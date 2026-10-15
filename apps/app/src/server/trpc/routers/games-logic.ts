import {DEFAULT_DECK_SLUG, getDeck} from '@whocards/decks'
import {
  CUSTOM_SOURCE,
  currentAnswerMode,
  customQuestionsOf,
  deadlineOf,
  drawQuestion,
  finishedAtOf,
  metBefore,
  planDeckSlug,
  planOf,
  questionText,
  sourceOf,
  sourceRefs,
  standbyIds,
  turnDeadline,
  turnRef,
  usedRefs,
} from '@whocards/game'
import type {
  GameLanguage,
  GameSettings,
  GameSnapshot,
  Player,
  QuestionSources,
  Round,
  Turn,
} from '@whocards/game'
import type {GameRecapProps, GameRevisitProps} from '@whocards/emails'
import {z} from 'zod'

import {eventLinks, WEBSITE_ORIGIN} from '../../../lib/event-links'
import {roleAtLeast} from '../../auth/permissions'
import type {AppRole} from '../../auth/permissions'
import type {RoundRecord} from './games'

export const GAMES_MIN_ROLE = 'facilitator' as const

/** Co-facilitator user ids, kept under `hosted_game.settings.facilitators`. */
export const readFacilitators = (settings: unknown): string[] => {
  const parsed = z.object({facilitators: z.array(z.string())}).safeParse(settings)
  return parsed.success ? parsed.data.facilitators : []
}

export type GameHosts = {createdBy: string | null; facilitators: string[]}

/**
 * What a caller may do with a game: admins and the creator run it and manage its
 * co-facilitators, a co-facilitator only runs it, anyone else can't see it.
 */
export const hostAccess = (
  hosts: GameHosts,
  user: {id: string; role: AppRole}
): 'manage' | 'run' | null => {
  if (roleAtLeast(user.role, 'admin') || hosts.createdBy === user.id) return 'manage'
  return hosts.facilitators.includes(user.id) ? 'run' : null
}

const TITLE_MAX = 80
const COPY_SUFFIX = ' (copy)'

export type GameCopy = {
  title: string
  settings: GameSettings
  facilitators: string[]
  rounds: Array<RoundRecord & {n: number}>
}

/** A fresh draft for `copierId` without players, play, standby key or mailings; the original creator stays a co-facilitator. */
export const copyOf = (snapshot: GameSnapshot, hosts: GameHosts, copierId: string): GameCopy => {
  const {title, settings} = snapshot.game
  const questions = customQuestionsOf(settings)
  return {
    title: `${title.slice(0, TITLE_MAX - COPY_SUFFIX.length)}${COPY_SUFFIX}`,
    settings: {
      round: settings.round,
      ...(settings.organizer ? {organizer: settings.organizer} : {}),
      ...(questions.length > 0 ? {questions} : {}),
      answerModes: [{mode: currentAnswerMode(settings), at: 0}],
    },
    facilitators: [
      ...new Set([...(hosts.createdBy ? [hosts.createdBy] : []), ...hosts.facilitators]),
    ].filter((id) => id !== copierId),
    rounds: snapshot.rounds.map((r) => ({
      n: r.n,
      questionPlan: planOf(r),
      deckSlug: planDeckSlug(planOf(r)),
      turnSeconds: r.turnSeconds,
      oddRule: r.oddRule,
      overtime: r.overtime,
      overtimeSeconds: r.overtimeSeconds,
    })),
  }
}

/** The emails a host sends once after the game, each recorded under `hosted_game.settings[mailing]`. */
export type Mailing = 'recap' | 'revisit'

/** What a send recorded; its presence in settings claims the one send. */
export const sendStateSchema = z.object({
  sentAt: z.number(),
  sent: z.number().int(),
  failed: z.number().int(),
  error: z.string().nullable(),
  pending: z.boolean().default(false),
})
export type SendState = z.infer<typeof sendStateSchema>

export const readSendState = (settings: unknown, mailing: Mailing): SendState | null => {
  const parsed = z.object({[mailing]: sendStateSchema}).safeParse(settings)
  return parsed.success ? (parsed.data[mailing] ?? null) : null
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

export type Recap = {to: string; props: GameRecapProps}

const regularPlayers = (snapshot: GameSnapshot): Player[] => {
  const standby = standbyIds(snapshot)
  return snapshot.players.filter((p) => !standby.has(p.id))
}

type RecapInput = {
  snapshot: GameSnapshot
  savedByPlayer: Readonly<Record<string, number>>
  now: number
  random: () => number
}

const recapProps = ({snapshot, savedByPlayer, now, random}: RecapInput) => {
  const played = snapshot.rounds.filter((r) => r.startedAt !== null)
  const links = eventLinks(snapshot.game.code)
  const players = regularPlayers(snapshot)
  const event = {
    players: players.length,
    rounds: played.length,
    turns: snapshot.turns.length,
    minutes: minutes(snapshot.turns.reduce((sum, t) => sum + spokenMs(snapshot, t, now), 0)),
    languages: new Set(players.map((p) => p.language)).size,
  }

  const sources = {custom: customQuestionsOf(snapshot.game.settings), decks: getDeck}
  const candidates = [...new Set(played.flatMap((r) => sourceRefs(r.deckSlug, sources)))]

  return (player: Pick<Player, 'id' | 'name' | 'language'>): GameRecapProps => {
    const mine = snapshot.turns
      .filter((t) => t.playerId === player.id)
      .toSorted((a, b) => a.startedAt - b.startedAt)
    const ref = drawQuestion(candidates, usedRefs(snapshot, player.id), random)
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
      asked: mine.flatMap(
        (t) => questionText(turnRef(snapshot, t), player.language, sources) ?? []
      ),
      question: ref ? questionText(ref, player.language, sources) : null,
      appUrl: links.app,
      eventUrl: links.event,
      myAnswersUrl: links.me,
    }
  }
}

/** One recap per player who asked for it and left an email, standby facilitators never; stats are counts only, never names. */
export const buildRecaps = (input: RecapInput): Recap[] => {
  const propsFor = recapProps(input)
  return regularPlayers(input.snapshot).flatMap((player): Recap[] =>
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

export type Revisit = {to: string; props: GameRevisitProps}

/** The question's card on whocards.cc; null for a host's own question, which only lived in the game. */
export const questionUrl = (
  ref: string,
  language: GameLanguage,
  sources: QuestionSources
): string | null => {
  const source = sourceOf(ref)
  if (source === CUSTOM_SOURCE) return null
  const id = ref.slice(source.length + 1)
  const text = sources.decks(source)?.questions[id]
  if (!text) return null
  const path = source === DEFAULT_DECK_SLUG ? '/play' : `/play/${source}`
  const lang = text[language] ? language : 'en'
  return `${WEBSITE_ORIGIN}${path}?lang=${lang}&q=${encodeURIComponent(id)}`
}

const revisitProps = (snapshot: GameSnapshot) => {
  const sources = {custom: customQuestionsOf(snapshot.game.settings), decks: getDeck}
  const links = eventLinks(snapshot.game.code)
  return (name: string, language: GameLanguage, refs: string[]): GameRevisitProps => ({
    name,
    eventTitle: snapshot.game.title,
    organizer: organizerOf(snapshot),
    questions: refs.flatMap((ref) => {
      const text = questionText(ref, language, sources)
      return text ? [{text, url: questionUrl(ref, language, sources)}] : []
    }),
    playUrl: links.play,
    appUrl: links.app,
  })
}

/** Distinct refs answered, oldest first; everyone's when `playerId` is left out. */
const answeredRefs = (snapshot: GameSnapshot, playerId?: string): string[] => [
  ...new Set(
    snapshot.turns
      .filter((t) => playerId === undefined || t.playerId === playerId)
      .toSorted((a, b) => a.startedAt - b.startedAt)
      .map((t) => turnRef(snapshot, t))
  ),
]

/** One per recap-consenting player with an email who answered something; standby facilitators never. */
export const buildRevisits = (snapshot: GameSnapshot): Revisit[] => {
  const propsFor = revisitProps(snapshot)
  return regularPlayers(snapshot).flatMap((player): Revisit[] => {
    if (!player.consentRecap || !player.email) return []
    const props = propsFor(player.name, player.language, answeredRefs(snapshot, player.id))
    return props.questions.length > 0 ? [{to: player.email, props}] : []
  })
}

const SAMPLE_QUESTIONS = 3

/** What the host sees before sending: the first real email, else a sample with the room's first questions. */
export const previewRevisit = (
  snapshot: GameSnapshot
): {recipients: number; sample: boolean; props: GameRevisitProps} => {
  const revisits = buildRevisits(snapshot)
  const first = revisits[0]
  if (first) return {recipients: revisits.length, sample: false, props: first.props}
  const refs = answeredRefs(snapshot).slice(0, SAMPLE_QUESTIONS)
  return {recipients: 0, sample: true, props: revisitProps(snapshot)('Sample player', 'en', refs)}
}
