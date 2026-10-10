import type {GameSnapshot, Pair, Round, Turn} from '../model'
import type {PlayerPhase, Refusal} from '../schemas'
import {pairOf, unpairedIds} from './pairing'
import {turnDeadline} from './timer'

export const deadlineOf = (round: Round, turn: Turn): number =>
  turnDeadline({
    startedAt: turn.startedAt,
    turnSeconds: round.turnSeconds,
    overtime: round.overtime,
    overtimeSeconds: round.overtimeSeconds,
  })

/** A turn left open past its deadline counts as finished at the deadline. */
export const finishedAtOf = (round: Round, turn: Turn, now: number): number | null => {
  if (turn.finishedAt !== null) return turn.finishedAt
  const deadline = deadlineOf(round, turn)
  return now >= deadline ? deadline : null
}

export const turnsOf = (snapshot: GameSnapshot, pairId: string): Turn[] =>
  snapshot.turns.filter((t) => t.pairId === pairId)

export const openTurnOf = (round: Round, turns: Turn[], now: number): Turn | null =>
  turns.find((t) => finishedAtOf(round, t, now) === null) ?? null

export type ClaimCheck =
  | {ok: true; start: boolean; expire: Array<{turnId: string; finishedAt: number}>}
  | {ok: false; reason: Refusal}

/** First tap wins; the partner is locked out until that turn finishes. Re-claiming my own open turn is a no-op. */
export const checkClaim = (
  round: Round,
  pair: Pair,
  turns: Turn[],
  meId: string,
  now: number
): ClaimCheck => {
  if (round.status !== 'live') return {ok: false, reason: 'round_not_live'}
  if (!pair.playerIds.includes(meId)) return {ok: false, reason: 'not_paired'}

  const open = openTurnOf(round, turns, now)
  if (open?.playerId === meId) return {ok: true, start: false, expire: []}
  if (open) return {ok: false, reason: 'partner_answering'}
  if (turns.some((t) => t.playerId === meId)) return {ok: false, reason: 'already_answered'}

  const expire = turns
    .filter((t) => t.finishedAt === null)
    .map((t) => ({turnId: t.id, finishedAt: deadlineOf(round, t)}))
  return {ok: true, start: true, expire}
}

export type FinishCheck =
  | {ok: true; finish: {turnId: string; finishedAt: number} | null}
  | {ok: false; reason: Refusal}

/** Finishing twice is a no-op; finishing late is clamped to the deadline. */
export const checkFinish = (
  round: Round,
  turns: Turn[],
  meId: string,
  now: number
): FinishCheck => {
  const mine = turns.find((t) => t.playerId === meId)
  if (!mine) return {ok: false, reason: 'no_open_turn'}
  if (mine.finishedAt !== null) return {ok: true, finish: null}
  return {
    ok: true,
    finish: {turnId: mine.id, finishedAt: Math.min(now, deadlineOf(round, mine))},
  }
}

/** Where `meId` stands this round. */
export const phaseOf = (
  snapshot: GameSnapshot,
  round: Round | null,
  meId: string,
  now: number
): PlayerPhase => {
  if (!round || round.status !== 'live') return 'waiting'
  const pair = pairOf(snapshot, round.id, meId)
  if (!pair) {
    const others = unpairedIds(snapshot, round.id).filter((id) => id !== meId)
    return round.oddRule === 'sitout' && others.length === 0 ? 'sitting_out' : 'unpaired'
  }
  const turns = turnsOf(snapshot, pair.id)
  const open = openTurnOf(round, turns, now)
  if (open) return open.playerId === meId ? 'speaking' : 'partner_speaking'
  const spoke = new Set(turns.map((t) => t.playerId))
  if (pair.playerIds.every((id) => spoke.has(id))) return 'pair_done'
  return spoke.has(meId) ? 'answered' : 'ready'
}

/** Prefer a question this player hasn't had in the game; repeat only once the deck runs out. */
export const drawQuestion = (
  questionIds: readonly string[],
  used: ReadonlySet<string>,
  random: () => number
): string | null => {
  const fresh = questionIds.filter((id) => !used.has(id))
  const from = fresh.length > 0 ? fresh : questionIds
  return from[Math.floor(random() * from.length)] ?? null
}
