import type {GameSnapshot, Pair, Player, Round} from '../model'
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

/** Facilitators who joined through the host's standby link. */
export const standbyIds = (snapshot: GameSnapshot): Set<string> =>
  new Set(snapshot.game.settings.standby ?? [])

const pairedIn = (snapshot: GameSnapshot, roundId: string): Set<string> =>
  new Set(snapshot.pairs.filter((p) => p.roundId === roundId).flatMap((p) => p.playerIds))

/** Regular (non-standby) players without a pair in this round. */
export const unpairedIds = (snapshot: GameSnapshot, roundId: string): string[] => {
  const paired = pairedIn(snapshot, roundId)
  const standby = standbyIds(snapshot)
  return snapshot.players.map((p) => p.id).filter((id) => !paired.has(id) && !standby.has(id))
}

/** Standby facilitators still free in this round. */
export const freeStandbyIds = (snapshot: GameSnapshot, roundId: string): string[] => {
  const paired = pairedIn(snapshot, roundId)
  const standby = standbyIds(snapshot)
  return snapshot.players.map((p) => p.id).filter((id) => standby.has(id) && !paired.has(id))
}

/** Someone new is still within reach: a free player, or a pair to join as a trio, not met before. */
const hasFreshOption = (
  snapshot: GameSnapshot,
  round: Round,
  meId: string,
  met: Set<string>
): boolean => {
  if (unpairedIds(snapshot, round.id).some((id) => id !== meId && !met.has(id))) return true
  if (round.oddRule !== 'trio') return false
  const standby = standbyIds(snapshot)
  return snapshot.pairs.some(
    (p) =>
      p.roundId === round.id &&
      p.playerIds.length === 2 &&
      !p.playerIds.some((id) => met.has(id) || standby.has(id))
  )
}

export type PairCheck =
  | {ok: true; joinPairId: null}
  | {ok: true; joinPairId: string}
  | {ok: false; reason: Refusal}

/** Trios when the round allows; repeat partners only once nobody new is in reach; standby takes only the last free player. */
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

  const standby = standbyIds(snapshot)
  const partnerPair = pairOf(snapshot, round.id, partnerId)
  if (standby.has(meId) || standby.has(partnerId)) {
    if (standby.has(meId) && standby.has(partnerId)) {
      return {ok: false, reason: 'standby_partner'}
    }
    if (partnerPair) return {ok: false, reason: 'partner_busy'}
    const regular = standby.has(meId) ? partnerId : meId
    if (unpairedIds(snapshot, round.id).some((id) => id !== regular)) {
      return {ok: false, reason: 'standby_partner'}
    }
    return {ok: true, joinPairId: null}
  }

  const met = metBefore(snapshot, meId)
  if (met.has(partnerId) && hasFreshOption(snapshot, round, meId, met)) {
    return {ok: false, reason: 'met_before'}
  }
  if (!partnerPair) return {ok: true, joinPairId: null}

  if (
    round.oddRule !== 'trio' ||
    partnerPair.playerIds.length !== 2 ||
    partnerPair.playerIds.some((id) => standby.has(id))
  ) {
    return {ok: false, reason: 'partner_busy'}
  }
  if (
    partnerPair.playerIds.some((id) => met.has(id)) &&
    hasFreshOption(snapshot, round, meId, met)
  ) {
    return {ok: false, reason: 'met_before'}
  }
  return {ok: true, joinPairId: partnerPair.id}
}

/** Names compare trimmed, case- and accent-insensitively: "  ÁRON " finds "aron". */
export const nameKey = (name: string): string =>
  name.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase()

export type NameMatch = {
  /** Other players with that name. */
  matches: Player[]
  /** The matches `meId` may pair with right now. */
  eligible: Player[]
}

export const matchName = (
  snapshot: GameSnapshot,
  round: Round,
  meId: string,
  name: string
): NameMatch => {
  const key = nameKey(name)
  const matches = snapshot.players.filter((p) => p.id !== meId && nameKey(p.name) === key)
  return {matches, eligible: matches.filter((p) => checkPair(snapshot, round, meId, p.id).ok)}
}
