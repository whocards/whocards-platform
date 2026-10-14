import type {JoinInput, PlayerState} from '@whocards/game'
import {copyFor, playerCopyFor, readPairCode} from '@whocards/game'
import type {GameSession} from '@whocards/game/hooks'
import {useHostedGame, useRoundTimer, useTurn} from '@whocards/game/hooks'
import {useCallback, useMemo, useState} from 'react'

import {ErrorBoundary} from '~components/ErrorBoundary'
import {browserPlatform, createGameApi} from '~lib/game/client'
import {formatClock} from '~lib/game/format'
import {createWebRecorder} from '~lib/game/recorder'
import type {TokenStore} from '~lib/game/token-store'
import {createTokenStore} from '~lib/game/token-store'
import {createWebTranscriber} from '~lib/game/transcriber'
import {createWakeLock} from '~lib/game/wake-lock'

import {Feedback} from './feedback'
import {Join} from './join'
import {noticeText} from './notices'
import {Pairing} from './pairing'
import {Review, Turn} from './turn'
import {Button, Notice, Screen} from './ui'

type GameProps = {
  session: GameSession
  state: PlayerState
  tokens: TokenStore
  code: string
}

const Game = ({session, state, tokens, code}: GameProps) => {
  const {language} = state.me
  const copy = playerCopyFor(language)
  const [devices] = useState(() => ({recorder: createWebRecorder(), wakeLock: createWakeLock()}))
  const transcriber = useMemo(() => createWebTranscriber(() => tokens.get(code)), [tokens, code])
  const records = useMemo(() => tokens.records(code), [tokens, code])

  const timer = useRoundTimer({
    round: state.round,
    turn: state.pair?.activeTurn ?? null,
    offsetMs: session.offsetMs,
  })
  const turn = useTurn({
    session,
    recorder: records ? devices.recorder : null,
    wakeLock: devices.wakeLock,
    transcriber: records ? transcriber : null,
    clock: timer.turn,
  })

  const reviewing =
    turn.stage === 'transcribing' || turn.stage === 'review' || turn.stage === 'saving'
  const body = () => {
    if (reviewing)
      return (
        <Review
          key={`${turn.draft?.turnId}:${turn.draft?.kind}:${turn.draft?.text}`}
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
            <p className='text-center text-2xl'>
              {state.round === null ? copy.waiting.firstRound : copyFor(language).phases.waiting}
            </p>
          </Screen>
        )
      case 'unpaired':
        return <Pairing state={state} act={session.act} />
      case 'sitting_out':
        return (
          <Screen>
            <p className='text-center text-2xl'>{copyFor(language).phases.sitting_out}</p>
          </Screen>
        )
      default:
        return <Turn state={state} timer={timer} turn={turn} />
    }
  }

  const partners = state.pair?.partners.map((p) => p.name).join(', ')
  return (
    <div className='flex w-full flex-col gap-3'>
      <header className='flex items-baseline justify-between gap-3 pt-2 text-sm'>
        <span className='font-semibold'>{state.me.name}</span>
        {state.round && (
          <span>
            {copy.screen.round} {state.round.n}
            {timer.roundRemainingMs !== null && ` · ${formatClock(timer.roundRemainingMs)}`}
          </span>
        )}
      </header>
      {partners && (
        <p className='text-mutedOnLight text-sm'>
          {copy.pairing.partner} {partners}
        </p>
      )}
      {turn.notice && (
        <Notice onDismiss={turn.dismissNotice}>{noticeText(language, turn.notice)}</Notice>
      )}
      {session.error && !session.error.refusal && <Notice>{copy.notices.network}</Notice>}
      {body()}
      <a href={`/events/sdd-2026/me?code=${code}`} className='mx-auto py-4 underline'>
        {copy.mine.link}
      </a>
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

  const copy = playerCopyFor(session.state?.me.language ?? 'en')
  const content = () => {
    if (!joined) return <Join initialCode={code} onJoin={join} lookup={lookup} />
    if (session.state)
      return <Game session={session} state={session.state} tokens={tokens} code={code} />
    if (session.loading)
      return (
        <Screen>
          <span className='loading loading-dots loading-lg' aria-label={copy.waiting.loading} />
        </Screen>
      )
    return (
      <Screen>
        <Notice>{copy.notices.network}</Notice>
        <Button onClick={() => void session.refresh()}>{copy.waiting.retry}</Button>
      </Screen>
    )
  }

  return <ErrorBoundary>{content()}</ErrorBoundary>
}
