import type {MyData} from '@whocards/game'
import {PHYSICAL_QUESTION_ID, playerCopyFor, readPairCode} from '@whocards/game'
import type {ReactNode} from 'react'
import {useEffect, useMemo, useState} from 'react'

import {createGameApi} from '~lib/game/client'
import {formatClock} from '~lib/game/format'
import {joinPath} from '~lib/game/links'
import {createTokenStore} from '~lib/game/token-store'
import {useAnswerQueue} from '~lib/game/use-answer-queue'
import {cn} from '~utils/cn'

import {Button, buttonClass, Loading, Notice, Screen, Spinner, textareaClass} from './ui'

type Response = MyData['responses'][number]

const Entry = ({meta, children}: {meta: string; children: ReactNode}) => (
  <li className='flex flex-col gap-2 rounded-2xl border border-white/10 bg-background/80 p-4'>
    <span className='text-gray-dark text-sm'>{meta}</span>
    {children}
  </li>
)

const metaOf = (at: number, durationMs: number) =>
  `${new Date(at).toLocaleString()} · ${formatClock(durationMs)}`

const linkClass = 'cursor-pointer underline underline-offset-4'

export const SddMine = () => {
  const [tokens] = useState(() => createTokenStore())
  const [code] = useState(
    () => readPairCode(new URLSearchParams(location.search).get('code') ?? '') ?? tokens.lastCode()
  )
  const joined = code !== null && tokens.get(code) !== null
  const api = useMemo(() => (code ? createGameApi(code, tokens) : null), [code, tokens])
  const {queue, items: pending} = useAnswerQueue(tokens, code)
  const [data, setData] = useState<MyData | null>(null)
  const [failed, setFailed] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const [editing, setEditing] = useState<{id: string; text: string} | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const copy = playerCopyFor(data?.player.language ?? 'en')
  const gameLink = joinPath(code)

  useEffect(() => {
    if (!api || !joined) return undefined
    let alive = true
    const load = () =>
      api.me().then(
        (next) => alive && setData(next),
        () => alive && setFailed(true)
      )
    void load()
    let waiting = queue.items().length
    // A take leaving the queue was saved: fetch its transcript.
    const unsubscribe = queue.subscribe(() => {
      const now = queue.items().length
      if (now < waiting) void load()
      waiting = now
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [api, joined, queue])

  const remove = async (responseId: string) => {
    if (!api) return
    if (armed !== responseId) {
      setArmed(responseId)
      return
    }
    setArmed(null)
    try {
      setData(await api.deleteResponse(responseId))
    } catch {
      setFailed(true)
    }
  }

  const saveEdit = async () => {
    if (!api || !editing) return
    setSavingEdit(true)
    try {
      setData(await api.editResponse(editing.id, editing.text))
      setEditing(null)
    } catch {
      setFailed(true)
    }
    setSavingEdit(false)
  }

  const response = (r: Response) => {
    const meta = metaOf(r.createdAt, r.durationMs)
    const physical = r.questionId === PHYSICAL_QUESTION_ID && (
      <span className='text-yellow-300 text-sm font-semibold'>{copy.mine.physical}</span>
    )
    if (editing?.id === r.id)
      return (
        <Entry key={r.id} meta={meta}>
          {physical}
          <textarea
            className={cn(textareaClass, 'min-h-40')}
            aria-label={copy.mine.edit}
            value={editing.text}
            onChange={(event) => setEditing({id: r.id, text: event.target.value})}
          />
          <Button
            pending={savingEdit}
            disabled={editing.text.trim() === ''}
            onClick={() => void saveEdit()}
          >
            {copy.mine.save}
          </Button>
          <Button variant='ghost' disabled={savingEdit} onClick={() => setEditing(null)}>
            {copy.mine.cancel}
          </Button>
        </Entry>
      )
    return (
      <Entry key={r.id} meta={meta}>
        {physical}
        <p className='whitespace-pre-wrap'>{r.transcript}</p>
        <span className='flex justify-end gap-5'>
          <button
            type='button'
            className={linkClass}
            onClick={() => {
              setArmed(null)
              setEditing({id: r.id, text: r.transcript})
            }}
          >
            {copy.mine.edit}
          </button>
          <button
            type='button'
            className={cn(linkClass, 'text-errorOnDark')}
            onClick={() => void remove(r.id)}
          >
            {armed === r.id ? copy.mine.confirmDelete : copy.mine.delete}
          </button>
        </span>
      </Entry>
    )
  }

  const empty = data?.responses.length === 0 && pending.length === 0
  return (
    <Screen title={copy.mine.title}>
      {!joined && <p>{copy.mine.notJoined}</p>}
      {failed && <Notice onDismiss={() => setFailed(false)}>{copy.notices.network}</Notice>}
      {joined && !data && !failed && <Loading label={copy.waiting.loading} />}
      {empty && <p>{copy.mine.empty}</p>}
      <ul className='flex w-full flex-col gap-3'>
        {data?.responses.map(response)}
        {pending.map((answer) => (
          <Entry key={answer.turnId} meta={metaOf(answer.recordedAt, answer.durationMs)}>
            {answer.failed ? (
              <>
                <p className='text-yellow-300'>{copy.mine.failed}</p>
                <span className='flex justify-end gap-5'>
                  <button
                    type='button'
                    className={linkClass}
                    onClick={() => queue.retry(answer.turnId)}
                  >
                    {copy.mine.retry}
                  </button>
                  <button
                    type='button'
                    className={cn(linkClass, 'text-errorOnDark')}
                    onClick={() =>
                      armed === answer.turnId
                        ? void queue.discard(answer.turnId)
                        : setArmed(answer.turnId)
                    }
                  >
                    {armed === answer.turnId ? copy.mine.confirmDelete : copy.mine.delete}
                  </button>
                </span>
              </>
            ) : (
              <p className='text-gray-lighter flex items-center gap-2'>
                <Spinner className='size-4' />
                {copy.mine.processing}
              </p>
            )}
          </Entry>
        ))}
      </ul>
      <a href={gameLink} className={buttonClass('ghost')}>
        {copy.mine.back}
      </a>
    </Screen>
  )
}
