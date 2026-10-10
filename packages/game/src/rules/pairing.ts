import type {GameSnapshot, Pair, Round} from '../model'
import type {Refusal} from '../schemas'

export const pairOf = (snapshot: GameSnapshot, roundId: string, playerId: string): Pair | null =>
  snapshot.pairs.find((p) => p.roundId === roundId && p.playerIds.includes(playerId)) ?? null

/** Everyone this player has been paired with in any round of the game. */
export const metBefore = (snapshot: GameSnapshot, playerId: string): Set<string> => {
  const met = new Set<string>()
  for (const pair of snapshot.pairs) {
    if (!pair.playerIds.includes(playerId)) continue
    for (const id of pair.playerIds) if (id !== playerId) met.add(id)
  }
  return met
}

export type PairCheck =
  | {ok: true; joinPairId: null}
  | {ok: true; joinPairId: string}
  | {ok: false; reason: Refusal}

/** A partner already in a two-person pair can be joined as a trio when the round allows it. */
export const checkPair = (
  snapshot: GameSnapshot,
  round: Round,
  meId: string,
  partnerId: string
): PairCheck => {
  if (snapshot.game.status === 'ended') return {ok: false, reason: 'game_over'}
  if (round.status !== 'live') return {ok: false, reason: 'round_not_live'}
  if (meId === partnerId) return {ok: false, reason: 'self'}
  if (pairOf(snapshot, round.id, meId)) return {ok: false, reason: 'already_paired'}

  const met = metBefore(snapshot, meId)
  if (met.has(partnerId)) return {ok: false, reason: 'met_before'}

  const partnerPair = pairOf(snapshot, round.id, partnerId)
  if (!partnerPair) return {ok: true, joinPairId: null}

  if (round.oddRule !== 'trio' || partnerPair.playerIds.length !== 2) {
    return {ok: false, reason: 'partner_busy'}
  }
  if (partnerPair.playerIds.some((id) => met.has(id))) return {ok: false, reason: 'met_before'}
  return {ok: true, joinPairId: partnerPair.id}
}

/** Players without a pair in this round. */
export const unpairedIds = (snapshot: GameSnapshot, roundId: string): string[] => {
  const paired = new Set(
    snapshot.pairs.filter((p) => p.roundId === roundId).flatMap((p) => p.playerIds)
  )
  return snapshot.players.map((p) => p.id).filter((id) => !paired.has(id))
}
