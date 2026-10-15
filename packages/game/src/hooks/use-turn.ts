import {useCallback, useEffect, useRef, useState} from 'react'

import type {AnswerSink, Recorder, Recording, WakeLock} from '../adapters'
import type {DeviceNotice} from '../player-copy'
import type {TurnClock} from '../rules/timer'
import type {PlayerState, Refusal, TurnView} from '../schemas'
import type {GameError} from './errors'
import {after} from './timers'
import type {GameSession} from './use-hosted-game'

export type TurnStage =
  | 'idle'
  | 'claiming'
  | 'starting'
  | 'recording'
  | 'finishing'
  | 'typing'
  | 'saving'

export type TurnNotice = Refusal | DeviceNotice

/** A Type-mode answer in progress. */
export type Draft = {turnId: string}

export type TurnOptions<TAudio> = {
  session: GameSession
  /** Null on the decline path: the player talks, nothing is recorded or typed. */
  recorder: Recorder<TAudio> | null
  wakeLock: WakeLock | null
  answers: AnswerSink<TAudio> | null
  clock: TurnClock | null
}

export type TurnControls = {
  stage: TurnStage
  notice: TurnNotice | null
  draft: Draft | null
  canRecord: boolean
  /** The mic was refused on my open turn: the answer can't be recorded this turn. */
  micBlocked: boolean
  claim: () => Promise<void>
  record: () => Promise<void>
  finish: () => Promise<void>
  save: (text: string) => Promise<void>
  discard: () => void
  dismissNotice: () => void
}

export const myOpenTurn = (state: PlayerState | null): TurnView | null => {
  const turn = state?.pair?.activeTurn ?? null
  return turn && turn.playerId === state?.me.id && turn.finishedAt === null ? turn : null
}

const noticeOf = (failure: GameError): TurnNotice => failure.refusal ?? 'network'

export const useTurn = <TAudio>({
  session,
  recorder,
  wakeLock,
  answers,
  clock,
}: TurnOptions<TAudio>): TurnControls => {
  const [stage, setStage] = useState<TurnStage>('idle')
  const [notice, setNotice] = useState<TurnNotice | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [micBlockedTurn, setMicBlockedTurn] = useState<string | null>(null)

  // Callbacks read these synchronously so a double tap can't start two flows.
  const stageNow = useRef<TurnStage>('idle')
  const recordingTurn = useRef<string | null>(null)
  const typedTurn = useRef<string | null>(null)
  // The recorder holds one session, so a second start must wait for the first mic answer.
  const micPending = useRef(false)
  const latest = useRef(session)
  useEffect(() => {
    latest.current = session
  }, [session])
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const {act} = session
  const go = useCallback((next: TurnStage) => {
    stageNow.current = next
    setStage(next)
  }, [])

  const canRecord = recorder !== null && answers !== null

  const claim = useCallback(async () => {
    if (stageNow.current !== 'idle') return
    go('claiming')
    const failure = await act((c) => c.turn('claim'))
    setNotice(failure ? noticeOf(failure) : null)
    go('idle')
  }, [act, go])

  const record = useCallback(async () => {
    const turn = myOpenTurn(latest.current.state)
    if (!recorder || !answers || turn?.answerMode !== 'voice') return
    if (stageNow.current !== 'idle') return
    if (micPending.current) return
    go('starting')
    // The mic can answer after the player finished or left; a late stream is dropped.
    const still = (expected: TurnStage) => mounted.current && stageNow.current === expected
    micPending.current = true
    const started = await recorder.start().then(
      () => true,
      () => false
    )
    micPending.current = false
    if (!still('starting')) {
      if (started) void recorder.cancel()
      return
    }
    if (!started) {
      setMicBlockedTurn(turn.id)
      go('idle')
      return
    }
    if (myOpenTurn(latest.current.state)?.id !== turn.id) {
      void recorder.cancel()
      go('idle')
      return
    }
    recordingTurn.current = turn.id
    go('recording')
    if (!wakeLock) return
    const held = await wakeLock.acquire()
    if (!still('recording')) {
      if (held) void wakeLock.release()
      return
    }
    if (!held) setNotice('keep_screen_on')
  }, [recorder, answers, wakeLock, go])

  const finish = useCallback(async () => {
    const from = stageNow.current
    if (from !== 'idle' && from !== 'starting' && from !== 'recording') return
    go('finishing')
    let recording: Recording<TAudio> | null = null
    if (from === 'recording' && recorder) {
      recording = await recorder.stop().catch(() => null)
      await wakeLock?.release()
    }
    // Queued before the finish call so a tab closed mid-request still keeps the take.
    if (recording && recordingTurn.current) answers?.add(recordingTurn.current, recording)
    recordingTurn.current = null
    const failure = await act((c) => c.turn('finish'))
    // The server may already have closed the turn at its deadline.
    if (failure && failure.refusal !== 'no_open_turn') setNotice(noticeOf(failure))
    go('idle')
  }, [recorder, wakeLock, answers, act, go])

  const clear = useCallback(() => {
    setDraft(null)
    go('idle')
  }, [go])

  const save = useCallback(
    async (text: string) => {
      const language = latest.current.state?.me.language
      if (!draft || !language) return
      if (stageNow.current !== 'typing') return
      go('saving')
      const failure = await act((c) =>
        c.response({
          turnId: draft.turnId,
          language,
          transcript: text,
          durationMs: 0,
          consent: true,
        })
      )
      if (failure) {
        setNotice(noticeOf(failure))
        go('typing')
        return
      }
      setNotice(null)
      clear()
    },
    [draft, act, clear, go]
  )

  const discard = useCallback(() => {
    if (stageNow.current !== 'typing') return
    setNotice(null)
    clear()
    // A typed turn is still open on the server; skipping it ends it.
    void act((c) => c.turn('finish'))
  }, [act, clear])

  const dismissNotice = useCallback(() => setNotice(null), [])

  const openTurn = myOpenTurn(session.state)
  const openTurnId = openTurn?.id ?? null

  // Type mode goes straight from the claim to a blank answer, unless the player opted out of saving.
  useEffect(() => {
    if (openTurn?.answerMode !== 'type' || typedTurn.current === openTurn.id) return undefined
    if (!recorder || stage !== 'idle') return undefined
    return after(0, () => {
      typedTurn.current = openTurn.id
      setDraft({turnId: openTurn.id})
      go('typing')
    })
  }, [openTurn?.answerMode, openTurn?.id, recorder, stage, go])

  const autoFinished = useRef<string | null>(null)
  useEffect(() => {
    if (clock?.phase !== 'over' || !openTurnId || autoFinished.current === openTurnId)
      return undefined
    if (stage !== 'recording' && stage !== 'starting' && stage !== 'idle') return undefined
    return after(0, () => {
      autoFinished.current = openTurnId
      void finish()
    })
  }, [clock?.phase, stage, openTurnId, finish])

  // The host ended the round or game, or the server closed the turn: keep the take.
  useEffect(() => {
    if (stage !== 'recording' || openTurnId === recordingTurn.current) return undefined
    return after(0, () => void finish())
  }, [stage, openTurnId, finish])

  useEffect(
    () => () => {
      if (stageNow.current !== 'recording') return
      void recorder?.cancel()
      void wakeLock?.release()
    },
    [recorder, wakeLock]
  )

  return {
    stage,
    notice,
    draft,
    canRecord,
    micBlocked: micBlockedTurn !== null && micBlockedTurn === openTurnId,
    claim,
    record,
    finish,
    save,
    discard,
    dismissNotice,
  }
}
