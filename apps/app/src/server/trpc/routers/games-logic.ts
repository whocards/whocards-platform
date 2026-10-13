import {getDeck} from '@whocards/decks'
import {deadlineOf, drawQuestion, finishedAtOf, metBefore, turnDeadline} from '@whocards/game'
import type {GameSnapshot, Player, Round, Turn} from '@whocards/game'
import type {GameRecapProps} from '@whocards/emails'
import {z} from 'zod'

import {eventLinks} from '../../../lib/event-links'

export const GAMES_MIN_ROLE = 'facilitator' as const

/** What the recap send recorded; kept under `hosted_game.settings.recap`, whose presence claims the one send. */
export const recapStateSchema = z.object({
  sentAt: z.number(),
  sent: z.number().int(),
  failed: z.number().int(),
  error: z.string().nullable(),
  pending: z.boolean().default(false),
})
export type RecapState = z.infer<typeof recapStateSchema>

export const readRecapState = (settings: unknown): RecapState | null => {
  const recap = z.object({recap: recapStateSchema}).safeParse(settings)
  return recap.success ? recap.data.recap : null
}

export const organizerOf = (snapshot: GameSnapshot): string | null =>
  snapshot.game.settings.organizer ?? null

/** One turn each for a pair, back to back; a trio runs a turn longer. Shown as the round's planned end. */
export const plannedRoundEnd = (round: Round, startedAt: number): number =>
  startedAt +
  2 *
    turnDeadline({
      startedAt: 0,
      turnSeconds: round.turnSeconds,
      overtime: round.overtime,
      overtimeSeconds: round.overtimeSeconds,
    })

const roundOfTurn = (snapshot: GameSnapshot, turn: Turn): Round | null =>
  snapshot.rounds.find((r) => r.id === turn.roundId) ?? null

/** When each of a round's open turns closes as the round ends: at `endedAt` or its deadline, whichever came first. */
export const closingTimes = (
  round: Round,
  openTurns: Array<Pick<Turn, 'id' | 'startedAt'>>,
  endedAt: number
): Array<{turnId: string; finishedAt: number}> =>
  openTurns.map((t) => ({turnId: t.id, finishedAt: Math.min(endedAt, deadlineOf(round, t))}))

const spokenMs = (snapshot: GameSnapshot, turn: Turn, now: number): number => {
  const round = roundOfTurn(snapshot, turn)
  const end = (round ? finishedAtOf(round, turn, now) : turn.finishedAt) ?? now
  return Math.max(0, end - turn.startedAt)
}

const minutes = (ms: number) => Math.round(ms / 60_000)

/** Pair members left behind when `playerId` leaves this round's pair: fewer than two can't play on. */
export const strandedByRemoval = (
  snapshot: GameSnapshot,
  playerId: string
): {pairId: string; playerIds: string[]} | null => {
  const live = snapshot.rounds.find((r) => r.status === 'live')
  const pair = live
    ? snapshot.pairs.find((p) => p.roundId === live.id && p.playerIds.includes(playerId))
    : undefined
  if (!pair) return null
  const rest = pair.playerIds.filter((id) => id !== playerId)
  return rest.length < 2 ? {pairId: pair.id, playerIds: rest} : null
}

const SEP = '\u0000'

export type Recap = {to: string; props: GameRecapProps}

type RecapInput = {
  snapshot: GameSnapshot
  savedByPlayer: Readonly<Record<string, number>>
  now: number
  random: () => number
}

const recapProps = ({snapshot, savedByPlayer, now, random}: RecapInput) => {
  const played = snapshot.rounds.filter((r) => r.startedAt !== null)
  const links = eventLinks(snapshot.game.code)
  const event = {
    players: snapshot.players.length,
    rounds: played.length,
    turns: snapshot.turns.length,
    minutes: minutes(snapshot.turns.reduce((sum, t) => sum + spokenMs(snapshot, t, now), 0)),
    languages: new Set(snapshot.players.map((p) => p.language)).size,
  }

  const decks = [...new Set(played.map((r) => r.deckSlug))].flatMap((slug) => {
    const deck = getDeck(slug)
    return deck ? [deck] : []
  })
  const candidates = decks.flatMap((d) => d.questionIds.map((id) => [d.slug, id].join(SEP)))

  return (player: Pick<Player, 'id' | 'name' | 'language'>): GameRecapProps => {
    const mine = snapshot.turns.filter((t) => t.playerId === player.id)
    const drawn = new Set(
      mine.map((t) => [roundOfTurn(snapshot, t)?.deckSlug, t.questionId].join(SEP))
    )
    const [slug, id] = drawQuestion(candidates, drawn, random)?.split(SEP) ?? []
    const text = slug && id ? decks.find((d) => d.slug === slug)?.questions[id] : undefined
    return {
      name: player.name,
      eventTitle: snapshot.game.title,
      organizer: organizerOf(snapshot),
      event,
      you: {
        peopleMet: metBefore(snapshot, player.id).size,
        turns: mine.length,
        minutes: minutes(mine.reduce((sum, t) => sum + spokenMs(snapshot, t, now), 0)),
        savedAnswers: savedByPlayer[player.id] ?? 0,
      },
      question: text?.[player.language] ?? text?.en ?? null,
      appUrl: links.app,
      eventUrl: links.event,
      myAnswersUrl: links.me,
    }
  }
}

/** One recap per player who asked for it and left an email; stats are counts only, never names. */
export const buildRecaps = (input: RecapInput): Recap[] => {
  const propsFor = recapProps(input)
  return input.snapshot.players.flatMap((player): Recap[] =>
    player.consentRecap && player.email ? [{to: player.email, props: propsFor(player)}] : []
  )
}

/** What the host sees before sending: the first real recap, else a sample player with the room's numbers. */
export const previewRecap = (
  input: RecapInput
): {recipients: number; sample: boolean; props: GameRecapProps} => {
  const recaps = buildRecaps(input)
  const first = recaps[0]
  if (first) return {recipients: recaps.length, sample: false, props: first.props}
  const props = recapProps(input)({id: '', name: 'Sample player', language: 'en'})
  return {recipients: 0, sample: true, props}
}
