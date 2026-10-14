import type {GameSnapshot, Round, Turn} from './model'
import type {GameLanguage, PlayerState, RoundView, ScreenState, TurnView} from './schemas'
import {answerModeAt} from './rules/answer-mode'
import {pairOf} from './rules/pairing'
import {currentRound} from './rules/status'
import {deadlineOf, finishedAtOf, openTurnOf, phaseOf, turnsOf} from './rules/turns'

export type ResolveQuestion = (questionId: string, language: GameLanguage) => string | null

export const roundView = (round: Round): RoundView => ({
  id: round.id,
  n: round.n,
  status: round.status,
  deckSlug: round.deckSlug,
  turnSeconds: round.turnSeconds,
  oddRule: round.oddRule,
  overtime: round.overtime,
  overtimeSeconds: round.overtimeSeconds,
  startedAt: round.startedAt,
  endsAt: round.endsAt,
})

const turnView = (
  snapshot: GameSnapshot,
  round: Round,
  turn: Turn,
  now: number,
  language: GameLanguage,
  resolve: ResolveQuestion
): TurnView => ({
  id: turn.id,
  playerId: turn.playerId,
  questionId: turn.questionId,
  questionText: resolve(turn.questionId, language),
  answerMode: answerModeAt(snapshot.game.settings, turn.startedAt),
  startedAt: turn.startedAt,
  finishedAt: finishedAtOf(round, turn, now),
  deadline: deadlineOf(round, turn),
})

/** Everything one phone needs to render, from that player's point of view. */
export const playerView = (
  snapshot: GameSnapshot,
  playerId: string,
  now: number,
  resolve: ResolveQuestion = () => null
): PlayerState | null => {
  const me = snapshot.players.find((p) => p.id === playerId)
  if (!me) return null
  const round = currentRound(snapshot)
  const pair = round ? pairOf(snapshot, round.id, me.id) : null

  let pairView: PlayerState['pair'] = null
  if (round && pair) {
    const turns = turnsOf(snapshot, pair.id).map((t) =>
      turnView(snapshot, round, t, now, me.language, resolve)
    )
    const open = openTurnOf(round, turnsOf(snapshot, pair.id), now)
    pairView = {
      id: pair.id,
      partners: pair.playerIds
        .filter((id) => id !== me.id)
        .map((id) => ({id, name: snapshot.players.find((p) => p.id === id)?.name ?? ''})),
      turns,
      activeTurn: turns.find((t) => t.id === open?.id) ?? null,
    }
  }

  return {
    serverNow: now,
    game: {
      id: snapshot.game.id,
      code: snapshot.game.code,
      title: snapshot.game.title,
      organizer: snapshot.game.settings.organizer ?? null,
      status: snapshot.game.status,
    },
    me: {id: me.id, name: me.name, language: me.language, pairCode: me.pairCode},
    round: round ? roundView(round) : null,
    phase: phaseOf(snapshot, round, me.id, now),
    pair: pairView,
  }
}

/** The big screen: counts only, no names or answers. */
export const screenView = (snapshot: GameSnapshot, now: number): ScreenState => {
  const round = currentRound(snapshot)
  const pairs = round ? snapshot.pairs.filter((p) => p.roundId === round.id) : []
  let talking = 0
  let done = 0
  for (const pair of pairs) {
    const turns = turnsOf(snapshot, pair.id)
    if (round && openTurnOf(round, turns, now)) talking += 1
    const spoke = new Set(
      turns.filter((t) => round && finishedAtOf(round, t, now) !== null).map((t) => t.playerId)
    )
    if (pair.playerIds.every((id) => spoke.has(id))) done += pair.playerIds.length
  }
  return {
    serverNow: now,
    game: {
      code: snapshot.game.code,
      title: snapshot.game.title,
      organizer: snapshot.game.settings.organizer ?? null,
      status: snapshot.game.status,
    },
    round: round ? roundView(round) : null,
    counts: {
      joined: snapshot.players.length,
      paired: pairs.reduce((sum, p) => sum + p.playerIds.length, 0),
      talking,
      done,
    },
  }
}
