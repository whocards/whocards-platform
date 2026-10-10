import type {Overtime} from '../schemas'

export type TurnTiming = {
  startedAt: number
  turnSeconds: number
  overtime: Overtime
  overtimeSeconds: number
}

/** The instant the server stops a turn nobody finished: turn end, plus the nudge grace if any. */
export const turnDeadline = (t: TurnTiming): number =>
  t.startedAt + t.turnSeconds * 1000 + (t.overtime === 'nudge' ? t.overtimeSeconds * 1000 : 0)

export type TurnClock = {
  /** talking → overtime (nudge only) → over */
  phase: 'talking' | 'overtime' | 'over'
  /** Until the turn's own time is up. */
  remainingMs: number
  /** Until the server stops the turn. */
  untilDeadlineMs: number
}

export const turnClock = (t: TurnTiming, now: number): TurnClock => {
  const turnEnd = t.startedAt + t.turnSeconds * 1000
  const deadline = turnDeadline(t)
  const phase = now < turnEnd ? 'talking' : now < deadline ? 'overtime' : 'over'
  return {
    phase,
    remainingMs: Math.max(0, turnEnd - now),
    untilDeadlineMs: Math.max(0, deadline - now),
  }
}

/** Server minus device clock, assuming the reply was stamped mid round trip; add to `Date.now()`. */
export const clockOffset = (o: {serverNow: number; sentAt: number; receivedAt: number}): number =>
  o.serverNow - (o.sentAt + o.receivedAt) / 2

export const msUntil = (at: number | null, now: number): number | null =>
  at === null ? null : Math.max(0, at - now)
