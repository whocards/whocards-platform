import type {JoinInput, PairCandidate, PlayerState} from '@whocards/game'
import {copyFor, playerCopyFor, readPairCode} from '@whocards/game'
import type {AnswerSink} from '@whocards/game'
import type {GameSession} from '@whocards/game/hooks'
import {useHostedGame, useRoundTimer, useTurn} from '@whocards/game/hooks'
import {useCallback, useMemo, useState} from 'react'

import {ErrorBoundary} from '~components/ErrorBoundary'
import {browserPlatform, createGameApi} from '~lib/game/client'
import {formatClock} from '~lib/game/format'
import {createWebRecorder} from '~lib/game/recorder'
import type {TokenStore} from '~lib/game/token-store'
import {createTokenStore} from '~lib/game/token-store'
import {useAnswerQueue} from '~lib/game/use-answer-queue'
import {createWakeLock} from '~lib/game/wake-lock'

import {Feedback} from './feedback'
import {Join} from './join'
import {noticeText} from './notices'
import {Pairing} from './pairing'
import {Turn, TypedAnswer} from './turn'
import {Button, Loading, Notice, Screen, Spinner} from './ui'

type GameProps = {
  session: GameSession
  state: PlayerState
  tokens: TokenStore
  code: string
  candidates: (name: string) => Promise<PairCandidate[]>
}

const Game = ({session, state, tokens, code, candidates}: GameProps) => {
  const {language} = state.me
  const copy = playerCopyFor(language)
  const [devices] = useState(() => ({recorder: createWebRecorder(), wakeLock: createWakeLock()}))
  const records = useMemo(() => tokens.records(code), [tokens, code])
  const pending = useAnswerQueue(tokens, code)
  const {queue} = pending
  const answers = useMemo<AnswerSink<Blob>>(
    () => ({
      add: (turnId, recording) =>
        queue.add({turnId, code, audio: recording.audio, durationMs: recording.durationMs}),
    }),
    [queue, code]
  )
  const saving = pending.items.filter((a) => !a.failed).length
  const unsaved = pending.items.length - saving

  const timer = useRoundTimer({
    round: state.round,
    turn: state.pair?.activeTurn ?? null,
    offsetMs: session.offsetMs,
  })
  const turn = useTurn({
    session,
    recorder: records ? devices.recorder : null,
    wakeLock: devices.wakeLock,
    answers: records ? answers : null,
    clock: timer.turn,
  })

  const body = () => {
    if (turn.draft && (turn.stage === 'typing' || turn.stage === 'saving'))
      return (
        <TypedAnswer
          key={turn.draft.turnId}
          state={state}
          timer={timer}
          turn={turn}
          draft={turn.draft}
        />
      )
    if (state.game.status === 'ended') return <Feedback language={language} act={session.act} />
    switch (state.phase) {
      case 'waiting':
        return (
          <Screen>
            <p className='font-title py-10 text-center text-3xl font-bold text-balance'>
              {state.round === null ? copy.waiting.firstRound : copyFor(language).phases.waiting}
            </p>
          </Screen>
        )
      case 'unpaired':
        return <Pairing state={state} act={session.act} candidates={candidates} />
      case 'find_facilitator':
      case 'standby':
        return (
          <Pairing
            state={state}
            act={session.act}
            candidates={candidates}
            hint={copyFor(language).phases[state.phase]}
          />
        )
      case 'sitting_out':
        return (
          <Screen>
            <p className='font-title py-10 text-center text-3xl font-bold text-balance'>
              {copyFor(language).phases.sitting_out}
            </p>
          </Screen>
        )
      default:
        return <Turn state={state} timer={timer} turn={turn} act={session.act} />
    }
  }

  const mine = `/events/sdd-2026/me?code=${code}`
  const partners = state.pair?.partners.map((p) => p.name).join(', ')
  return (
    <div className='flex w-full flex-col gap-3'>
      <header className='flex min-h-10 items-center justify-between gap-3 border-b border-white/10 pt-2 pb-3 text-sm'>
        <span className='font-semibold'>{state.me.name}</span>
        {state.round && (
          <span className='text-gray-lighter'>
            {copy.screen.round} {state.round.n}
            {timer.roundRemainingMs !== null && (
              <span className='ml-2 font-mono text-yellow-300 tabular-nums'>
                {formatClock(timer.roundRemainingMs)}
              </span>
            )}
          </span>
        )}
      </header>
      {(saving > 0 || unsaved > 0) && (
        <a href={mine} className='text-gray-lighter flex items-center gap-2 text-sm'>
          {saving > 0 ? (
            <>
              <Spinner className='size-3.5 border' />
              {saving === 1
                ? copy.answers.savingOne
                : copy.answers.savingMany.replace('{n}', String(saving))}
            </>
          ) : (
            <span className='text-yellow-300 underline underline-offset-4'>
              {copy.answers.failed}
            </span>
          )}
        </a>
      )}
      {partners && (
        <p className='text-gray-dark text-sm'>
          {copy.pairing.partner} <span className='text-white'>{partners}</span>
        </p>
      )}
      {turn.notice && (
        <Notice onDismiss={turn.dismissNotice}>{noticeText(language, turn.notice)}</Notice>
      )}
      {body()}
      <a
        href={mine}
        className='text-gray-lighter mx-auto py-4 underline underline-offset-4 hover:text-white'
      >
        {copy.mine.link}
      </a>
      {session.error && !session.error.refusal && (
        // Fixed so a flaky poll never shoves the card around.
        <div className='fixed inset-x-0 bottom-4 z-10 mx-auto w-full max-w-md px-4'>
          <Notice>{copy.notices.network}</Notice>
        </div>
      )}
    </div>
  )
}

export const SddPlayer = () => {
  const [tokens] = useState(() => createTokenStore())
  const [code, setCode] = useState(
    () =>
      readPairCode(new URLSearchParams(location.search).get('code') ?? '') ??
      tokens.lastCode() ??
      ''
  )
  const [joined, setJoined] = useState(() => code !== '' && tokens.get(code) !== null)
  const [standbyKey] = useState(
    () => new URLSearchParams(location.search).get('standby')?.trim() || undefined
  )
  const api = useMemo(() => createGameApi(code, tokens), [code, tokens])
  const onUnauthorized = useCallback(() => {
    tokens.clear(code)
    setJoined(false)
  }, [tokens, code])
  const lookup = useCallback((c: string) => createGameApi(c, tokens).screen(), [tokens])
  const session = useHostedGame({
    client: api.client,
    platform: browserPlatform,
    joined,
    onUnauthorized,
  })

  const join = async (input: JoinInput, records: boolean) => {
    const failure = await session.join(input)
    if (failure) return failure
    const joinedCode = tokens.lastCode() ?? input.code
    tokens.setRecords(joinedCode, records)
    setCode(joinedCode)
    setJoined(true)
    return null
  }

  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    await session.refresh()
    setRetrying(false)
  }

  const copy = playerCopyFor(session.state?.me.language ?? 'en')
  const content = () => {
    if (!joined)
      return <Join initialCode={code} standbyKey={standbyKey} onJoin={join} lookup={lookup} />
    if (session.state)
      return (
        <Game
          session={session}
          state={session.state}
          tokens={tokens}
          code={code}
          candidates={api.candidates}
        />
      )
    if (session.loading || retrying) return <Loading label={copy.waiting.loading} />
    return (
      <Screen>
        <Notice>{copy.notices.network}</Notice>
        <Button onClick={() => void retry()}>{copy.waiting.retry}</Button>
      </Screen>
    )
  }

  return <ErrorBoundary>{content()}</ErrorBoundary>
}
