import type {PlayerState, TurnView} from '@whocards/game'
import {copyFor, PHYSICAL_QUESTION_ID, playerCopyFor} from '@whocards/game'
import type {Draft, GameSession, TimerView, TurnControls} from '@whocards/game/hooks'
import type {ReactNode} from 'react'
import {useState} from 'react'

import {formatClock} from '~lib/game/format'
import {joinPath} from '~lib/game/links'
import {cn} from '~utils/cn'

import {QuestionVote} from './question-vote'
import {Button, Screen, Spinner, textareaClass} from './ui'

type TurnProps = {
  state: PlayerState
  timer: TimerView
  turn: TurnControls
  act: GameSession['act']
}

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
      'bg-background/80 text-white flex min-h-44 w-full flex-col gap-3 rounded-3xl border border-white/10 p-5 shadow-2xl shadow-black/40 backdrop-blur-md',
      locked && 'opacity-50'
    )}
  >
    <span className='text-yellow-300 text-sm font-semibold uppercase tracking-wider'>{label}</span>
    {children}
  </div>
)

const Question = ({
  turn,
  language,
  partner,
}: {
  turn: TurnView
  language: PlayerState['me']['language']
  partner?: boolean
}) => {
  const physical = playerCopyFor(language).turn
  const text =
    turn.questionId === PHYSICAL_QUESTION_ID
      ? partner
        ? physical.physicalPartner
        : physical.physical
      : turn.questionText
  return <p className='text-2xl font-semibold leading-snug'>{text ?? ''}</p>
}

const Clock = ({timer, language}: {timer: TimerView; language: PlayerState['me']['language']}) => {
  if (!timer.turn) return null
  const copy = playerCopyFor(language)
  return timer.turn.phase === 'talking' ? (
    <span className='text-gray-lighter font-mono text-xl tabular-nums'>
      {formatClock(timer.turn.remainingMs)}
    </span>
  ) : (
    <span className='text-primary-light text-xl font-semibold'>{copy.turn.overtime}</span>
  )
}

const CopyLink = ({code, language}: {code: string; language: PlayerState['me']['language']}) => {
  const copy = playerCopyFor(language)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  const url = `${location.origin}${joinPath(code)}`
  const copyLink = async () => {
    try {
      // In-app browsers often have no clipboard at all, so this can throw before any promise exists.
      await navigator.clipboard.writeText(url)
      setCopied('yes')
    } catch {
      setCopied('failed')
    }
  }
  return (
    <>
      <Button className='bg-primary-dark text-white' onClick={() => void copyLink()}>
        {copied === 'yes' ? copy.turn.linkCopied : copy.turn.copyLink}
      </Button>
      {copied === 'failed' && (
        <p className='bg-white text-darkest select-all break-all rounded-2xl p-3 font-mono text-sm'>
          {url}
        </p>
      )}
    </>
  )
}

export const Turn = ({state, timer, turn, act}: TurnProps) => {
  const {me, pair} = state
  const copy = playerCopyFor(me.language)
  const rules = copyFor(me.language)
  const active = pair?.activeTurn ?? null
  const mine = active?.playerId === me.id ? active : null
  const answered = (playerId: string) =>
    pair?.turns.some((t) => t.playerId === playerId && t.finishedAt !== null) ?? false
  const partnerAnswering = active !== null && mine === null
  const myDone = pair?.turns.find((t) => t.playerId === me.id && t.finishedAt !== null) ?? null

  const myCard = () => {
    if (mine && turn.micBlocked)
      return (
        <Card label={copy.turn.me}>
          <Question turn={mine} language={me.language} />
          <Clock timer={timer} language={me.language} />
          <p className='text-primary-light text-xl font-semibold'>{copy.turn.micBlocked}</p>
          <p>{copy.turn.micBlockedHint}</p>
          <CopyLink code={state.game.code} language={me.language} />
          <Button
            className='bg-primary-light text-darkest'
            pending={turn.stage === 'finishing'}
            onClick={() => void turn.finish()}
          >
            {rules.actions.finish}
          </Button>
        </Card>
      )
    const voice = mine?.answerMode === 'voice'
    if (mine)
      return (
        <Card label={copy.turn.me}>
          <Question turn={mine} language={me.language} />
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
            pending={turn.stage === 'finishing'}
            disabled={!['idle', 'starting', 'recording'].includes(turn.stage)}
            onClick={() => void turn.finish()}
          >
            {rules.actions.finish}
          </Button>
        </Card>
      )
    if (myDone)
      return (
        <Card label={copy.turn.me}>
          <p className='text-xl'>{copy.turn.answered}</p>
          <Question turn={myDone} language={me.language} />
          {myDone.questionId !== PHYSICAL_QUESTION_ID && (
            <QuestionVote turn={myDone} language={me.language} act={act} />
          )}
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
        className='w-full cursor-pointer rounded-3xl text-left ring-1 ring-yellow-400/50 transition-transform active:scale-95 disabled:cursor-progress'
        onClick={() => void turn.claim()}
      >
        <Card label={copy.turn.me}>
          <span className='font-title flex items-center gap-3 text-4xl font-bold text-yellow-300'>
            {turn.stage === 'claiming' && <Spinner className='size-7' />}
            {rules.actions.claim}
          </span>
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
                <Question turn={theirs} language={me.language} partner />
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

type TypedAnswerProps = {
  state: PlayerState
  timer: TimerView
  turn: TurnControls
  draft: Draft
}

export const TypedAnswer = ({state, timer, turn, draft}: TypedAnswerProps) => {
  const {language} = state.me
  const copy = playerCopyFor(language)
  const rules = copyFor(language)
  const [text, setText] = useState('')
  const asked = state.pair?.turns.find((t) => t.id === draft.turnId)
  return (
    <Screen title={copy.typing.title}>
      {asked && (
        <Card label={copy.turn.me}>
          <Question turn={asked} language={language} />
          <Clock timer={timer} language={language} />
        </Card>
      )}
      <p className='text-gray-dark'>{copy.typing.hint}</p>
      <textarea
        className={cn(textareaClass, 'min-h-48')}
        aria-label={copy.typing.hint}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button
        pending={turn.stage === 'saving'}
        disabled={turn.stage !== 'typing' || text.trim() === ''}
        onClick={() => void turn.save(text)}
      >
        {turn.stage === 'saving' ? copy.typing.saving : rules.actions.save}
      </Button>
      <Button variant='ghost' disabled={turn.stage !== 'typing'} onClick={turn.discard}>
        {rules.actions.skip}
      </Button>
    </Screen>
  )
}
