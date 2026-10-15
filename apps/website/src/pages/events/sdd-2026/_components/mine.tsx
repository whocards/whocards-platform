import type {MyData} from '@whocards/game'
import {playerCopyFor, readPairCode} from '@whocards/game'
import {useEffect, useMemo, useState} from 'react'

import {createGameApi} from '~lib/game/client'
import {formatClock} from '~lib/game/format'
import {joinPath} from '~lib/game/links'
import {createTokenStore} from '~lib/game/token-store'

import {buttonClass, Loading, Notice, Screen} from './ui'

export const SddMine = () => {
  const [tokens] = useState(() => createTokenStore())
  const [code] = useState(
    () => readPairCode(new URLSearchParams(location.search).get('code') ?? '') ?? tokens.lastCode()
  )
  const joined = code !== null && tokens.get(code) !== null
  const api = useMemo(() => (code ? createGameApi(code, tokens) : null), [code, tokens])
  const [data, setData] = useState<MyData | null>(null)
  const [failed, setFailed] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const copy = playerCopyFor(data?.player.language ?? 'en')
  const gameLink = joinPath(code)

  useEffect(() => {
    if (!api || !joined) return undefined
    let alive = true
    api.me().then(
      (next) => alive && setData(next),
      () => alive && setFailed(true)
    )
    return () => {
      alive = false
    }
  }, [api, joined])

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

  return (
    <Screen title={copy.mine.title}>
      {!joined && <p>{copy.mine.notJoined}</p>}
      {failed && <Notice onDismiss={() => setFailed(false)}>{copy.notices.network}</Notice>}
      {joined && !data && !failed && <Loading label={copy.waiting.loading} />}
      {data?.responses.length === 0 && <p>{copy.mine.empty}</p>}
      <ul className='flex w-full flex-col gap-3'>
        {data?.responses.map((response) => (
          <li
            key={response.id}
            className='flex flex-col gap-2 rounded-2xl border border-white/10 bg-background/80 p-4'
          >
            <span className='text-gray-dark text-sm'>
              {new Date(response.createdAt).toLocaleString()} · {formatClock(response.durationMs)}
            </span>
            <p className='whitespace-pre-wrap'>{response.transcript}</p>
            <button
              type='button'
              className='text-errorOnDark cursor-pointer self-end underline'
              onClick={() => void remove(response.id)}
            >
              {armed === response.id ? copy.mine.confirmDelete : copy.mine.delete}
            </button>
          </li>
        ))}
      </ul>
      <a href={gameLink} className={buttonClass('ghost')}>
        {copy.mine.back}
      </a>
    </Screen>
  )
}
