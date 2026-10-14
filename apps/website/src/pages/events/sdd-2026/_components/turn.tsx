import type {PlayerState, TurnView} from '@whocards/game'
import {copyFor, playerCopyFor} from '@whocards/game'
import type {Draft, TimerView, TurnControls} from '@whocards/game/hooks'
import type {ReactNode} from 'react'
import {useState} from 'react'

import {formatClock} from '~lib/game/format'
import {cn} from '~utils/cn'

import {Button, Screen} from './ui'

type TurnProps = {state: PlayerState; timer: TimerView; turn: TurnControls}

const Card = ({
  label,
  locked,
  children,
}: {
  label: string
  locked?: boolean
  children: ReactNode
}) => (
  <div
    className={cn(
      'bg-darkest text-white flex min-h-44 w-full flex-col gap-3 rounded-3xl p-5 shadow-lg',
      locked && 'opacity-50'
    )}
  >
    <span className='text-primary-light text-sm uppercase tracking-wider'>{label}</span>
    {children}
  </div>
)

const Question = ({turn}: {turn: TurnView}) => (
  <p className='text-2xl font-semibold leading-snug'>{turn.questionText ?? ''}</p>
)

const Clock = ({timer, language}: {timer: TimerView; language: PlayerState['me']['language']}) => {
  if (!timer.turn) return null
  const copy = playerCopyFor(language)
  return timer.turn.phase === 'talking' ? (
    <span className='font-mono text-3xl tabular-nums'>{formatClock(timer.turn.remainingMs)}</span>
  ) : (
    <span className='text-primary-light text-xl font-semibold'>{copy.turn.overtime}</span>
  )
}

const CopyLink = ({code, language}: {code: string; language: PlayerState['me']['language']}) => {
  const copy = playerCopyFor(language)
  const [copied, setCopied] = useState(false)
  const copyLink = () =>
    void navigator.clipboard
      .writeText(`${location.origin}/events/sdd-2026?code=${code}`)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  return (
    <Button className='bg-primary-dark text-white' onClick={copyLink}>
      {copied ? copy.turn.linkCopied : copy.turn.copyLink}
    </Button>
  )
}

export const Turn = ({state, timer, turn}: TurnProps) => {
  const {me, pair} = state
  const copy = playerCopyFor(me.language)
  const rules = copyFor(me.language)
  const active = pair?.activeTurn ?? null
  const mine = active?.playerId === me.id ? active : null
  const answered = (playerId: string) =>
    pair?.turns.some((t) => t.playerId === playerId && t.finishedAt !== null) ?? false
  const partnerAnswering = active !== null && mine === null

  const myCard = () => {
    if (mine && turn.micBlocked)
      return (
        <Card label={copy.turn.me}>
          <Question turn={mine} />
          <Clock timer={timer} language={me.language} />
          <p className='text-primary-light text-xl font-semibold'>{copy.turn.micBlocked}</p>
          <p>{copy.turn.micBlockedHint}</p>
          <CopyLink code={state.game.code} language={me.language} />
          <Button className='bg-primary-light text-darkest' onClick={() => void turn.finish()}>
            {rules.actions.finish}
          </Button>
        </Card>
      )
    const voice = mine?.answerMode === 'voice'
    if (mine)
      return (
        <Card label={copy.turn.me}>
          <Question turn={mine} />
          <Clock timer={timer} language={me.language} />
          {voice && turn.canRecord && turn.stage === 'idle' && (
            <Button className='bg-primary-dark text-white' onClick={() => void turn.record()}>
              {copy.turn.record}
            </Button>
          )}
          {turn.stage === 'recording' && (
            <span className='flex items-center gap-2 text-lg'>
              <span className='bg-red size-3 animate-pulse rounded-full' />
              {copy.turn.recording}
            </span>
          )}
          {voice && !turn.canRecord && <span className='text-gray-dark'>{copy.turn.justTalk}</span>}
          <Button
            className='bg-primary-light text-darkest'
            disabled={!['idle', 'starting', 'recording'].includes(turn.stage)}
            onClick={() => void turn.finish()}
          >
            {rules.actions.finish}
          </Button>
        </Card>
      )
    if (answered(me.id))
      return (
        <Card label={copy.turn.me}>
          <p className='text-xl'>{copy.turn.answered}</p>
        </Card>
      )
    if (partnerAnswering)
      return (
        <Card label={copy.turn.me} locked>
          <p className='text-xl'>{rules.refusals.partner_answering}</p>
        </Card>
      )
    return (
      <button
        type='button'
        aria-label={rules.actions.claim}
        disabled={turn.stage !== 'idle'}
        className='w-full text-left transition-transform active:scale-95'
        onClick={() => void turn.claim()}
      >
        <Card label={copy.turn.me}>
          <p className='font-title text-4xl'>{rules.actions.claim}</p>
        </Card>
      </button>
    )
  }

  return (
    <Screen>
      <p className='text-center text-lg'>{rules.phases[state.phase]}</p>
      {myCard()}
      {pair?.partners.map((partner) => {
        const theirs = active?.playerId === partner.id ? active : null
        return (
          <Card key={partner.id} label={partner.name} locked={!theirs}>
            {theirs ? (
              <>
                <Question turn={theirs} />
                <Clock timer={timer} language={me.language} />
              </>
            ) : (
              <p className='text-xl'>
                {answered(partner.id) ? copy.turn.answered : copy.turn.notYet}
              </p>
            )}
          </Card>
        )
      })}
    </Screen>
  )
}

type ReviewProps = {
  state: PlayerState
  timer: TimerView
  turn: TurnControls
  draft: Draft | null
}

export const Review = ({state, timer, turn, draft}: ReviewProps) => {
  const {language} = state.me
  const copy = playerCopyFor(language)
  const rules = copyFor(language)
  const [text, setText] = useState(draft?.text ?? '')

  if (turn.stage === 'transcribing' || !draft)
    return (
      <Screen title={copy.review.title}>
        <span className='loading loading-dots loading-lg' />
        <p>{copy.review.transcribing}</p>
      </Screen>
    )

  const skip = (
    <Button variant='ghost' disabled={turn.stage !== 'review'} onClick={turn.discard}>
      {rules.actions.skip}
    </Button>
  )

  if (draft.kind === 'failed')
    return (
      <Screen title={copy.review.title}>
        <p className='text-center text-xl'>{copy.review.failed}</p>
        <Button disabled={turn.stage !== 'review'} onClick={() => void turn.retryTranscribe()}>
          {copy.review.retry}
        </Button>
        {skip}
      </Screen>
    )

  const typed = draft.kind === 'typed'
  const asked = typed ? state.pair?.turns.find((t) => t.id === draft.turnId) : undefined
  return (
    <Screen title={copy.review.title}>
      {asked && (
        <Card label={copy.turn.me}>
          <Question turn={asked} />
          <Clock timer={timer} language={language} />
        </Card>
      )}
      <p className='text-mutedOnLight'>{typed ? copy.review.typeHint : copy.review.hint}</p>
      <textarea
        className='textarea bg-white text-darkest border-darkest/20 min-h-48 w-full rounded-2xl text-lg'
        aria-label={typed ? copy.review.typeHint : copy.review.title}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button
        disabled={turn.stage !== 'review' || text.trim() === ''}
        onClick={() => void turn.save(text)}
      >
        {turn.stage === 'saving' ? copy.review.saving : rules.actions.save}
      </Button>
      {skip}
    </Screen>
  )
}
