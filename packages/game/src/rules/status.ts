import type {GameSnapshot, Round} from '../model'
import type {GameStatus, RoundStatus} from '../schemas'

const GAME_NEXT: Record<GameStatus, readonly GameStatus[]> = {
  lobby: ['live', 'ended'],
  live: ['ended'],
  ended: [],
}

const ROUND_NEXT: Record<RoundStatus, readonly RoundStatus[]> = {
  pending: ['live'],
  live: ['done'],
  done: [],
}

export const canMoveGame = (from: GameStatus, to: GameStatus): boolean =>
  GAME_NEXT[from].includes(to)

export const canMoveRound = (from: RoundStatus, to: RoundStatus): boolean =>
  ROUND_NEXT[from].includes(to)

export type StartRoundCheck =
  | {ok: true}
  | {ok: false; reason: 'game_not_live' | 'round_not_pending' | 'other_round_live'}

/** Only one round runs at a time, and only in a live game. */
export const checkStartRound = (snapshot: GameSnapshot, round: Round): StartRoundCheck => {
  if (snapshot.game.status !== 'live') return {ok: false, reason: 'game_not_live'}
  if (!canMoveRound(round.status, 'live')) return {ok: false, reason: 'round_not_pending'}
  if (snapshot.rounds.some((r) => r.status === 'live' && r.id !== round.id)) {
    return {ok: false, reason: 'other_round_live'}
  }
  return {ok: true}
}

/** The live round, else the latest finished one (so phones show "round over"), else null. */
export const currentRound = (snapshot: GameSnapshot): Round | null => {
  const live = snapshot.rounds.find((r) => r.status === 'live')
  if (live) return live
  const done = snapshot.rounds.filter((r) => r.status === 'done')
  return done.reduce<Round | null>((latest, r) => (!latest || r.n > latest.n ? r : latest), null)
}
