import {useEffect, useState} from 'react'

import type {TurnClock} from '../rules/timer'
import {msUntil, turnClock} from '../rules/timer'
import type {RoundView, TurnView} from '../schemas'
import {after} from './timers'

export type TimerView = {
  /** Server time this view was computed for. */
  now: number
  /** Null when no turn is open. */
  turn: TurnClock | null
  /** Null when the round has no live end time. */
  roundRemainingMs: number | null
}

export const timerView = (
  round: RoundView | null,
  turn: TurnView | null,
  serverNow: number
): TimerView => ({
  now: serverNow,
  turn:
    round && turn && turn.finishedAt === null
      ? turnClock(
          {
            startedAt: turn.startedAt,
            turnSeconds: round.turnSeconds,
            overtime: round.overtime,
            overtimeSeconds: round.overtimeSeconds,
          },
          serverNow
        )
      : null,
  roundRemainingMs: round?.status === 'live' ? msUntil(round.endsAt, serverNow) : null,
})

export type RoundTimerOptions = {
  round: RoundView | null
  turn: TurnView | null
  offsetMs: number
  tickMs?: number
  now?: () => number
}

/** Counts down on the phone from server timestamps; ticks only while a round is live. */
export const useRoundTimer = ({
  round,
  turn,
  offsetMs,
  tickMs = 250,
  now = Date.now,
}: RoundTimerOptions): TimerView => {
  const [, setTick] = useState(0)
  const live = round?.status === 'live'

  useEffect(() => {
    if (!live) return undefined
    let cancel = after(tickMs, function tick() {
      setTick((n) => n + 1)
      cancel = after(tickMs, tick)
    })
    return () => cancel()
  }, [live, tickMs])

  return timerView(round, turn, now() + offsetMs)
}
