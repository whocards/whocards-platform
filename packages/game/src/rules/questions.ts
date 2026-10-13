import type {GameSnapshot, Round, Turn} from '../model'
import {CUSTOM_ID_PREFIX, CUSTOM_SOURCE} from '../schemas'
import type {CustomQuestion, GameLanguage, GameSettings, QuestionPlan} from '../schemas'
import {drawQuestion} from './turns'

/** The slice of a resolved deck these rules read; `getDeck` from @whocards/decks fits. */
export type DeckLookup = (slug: string) =>
  | {
      questionIds: readonly string[]
      questions: Readonly<Record<string, Readonly<Record<string, string>>>>
    }
  | undefined

export type QuestionSources = {custom: readonly CustomQuestion[]; decks: DeckLookup}

export const customQuestionsOf = (settings: GameSettings): CustomQuestion[] =>
  settings.questions ?? []

export const planOf = (round: Pick<Round, 'deckSlug' | 'questionPlan'>): QuestionPlan =>
  round.questionPlan ?? {mode: 'random', source: round.deckSlug}

export const deckRef = (slug: string, id: string): string => `${slug}:${id}`

/** Turns from before question plans stored a bare id from their round's deck. */
export const refOf = (questionId: string, legacyDeckSlug: string): string =>
  questionId.includes(':') ? questionId : deckRef(legacyDeckSlug, questionId)

/** CUSTOM_SOURCE or the deck slug a ref points into. */
export const sourceOf = (ref: string): string =>
  ref.startsWith(CUSTOM_ID_PREFIX) ? CUSTOM_SOURCE : ref.slice(0, ref.indexOf(':'))

/** What `game_round.deck_slug` records for a plan: the random source, else the first pick's source. */
export const planDeckSlug = (plan: QuestionPlan): string => {
  if (plan.mode === 'random') return plan.source
  return sourceOf(plan.mode === 'same' ? plan.question : plan.questions[0])
}

export const fixedRefsOf = (plan: QuestionPlan): string[] => {
  if (plan.mode === 'same') return [plan.question]
  if (plan.mode === 'per-turn') return [...plan.questions]
  return []
}

export const samePlan = (a: QuestionPlan, b: QuestionPlan): boolean =>
  a.mode === b.mode &&
  (a.mode === 'random' && b.mode === 'random'
    ? a.source === b.source
    : fixedRefsOf(a).join('\n') === fixedRefsOf(b).join('\n'))

/** Every question a random draw from `source` can land on. */
export const sourceRefs = (source: string, sources: QuestionSources): string[] =>
  source === CUSTOM_SOURCE
    ? sources.custom.map((q) => q.id)
    : (sources.decks(source)?.questionIds.map((id) => deckRef(source, id)) ?? [])

/** A ref's text in `language`, falling back to English; null when the ref points nowhere. */
export const questionText = (
  ref: string,
  language: GameLanguage,
  sources: QuestionSources
): string | null => {
  if (ref.startsWith(CUSTOM_ID_PREFIX)) {
    const q = sources.custom.find((c) => c.id === ref)
    return q ? q[language] || q.en : null
  }
  const at = ref.indexOf(':')
  if (at < 0) return null
  const text = sources.decks(ref.slice(0, at))?.questions[ref.slice(at + 1)]
  return text?.[language] ?? text?.en ?? null
}

export const turnRef = (snapshot: GameSnapshot, turn: Turn): string =>
  refOf(turn.questionId, snapshot.rounds.find((r) => r.id === turn.roundId)?.deckSlug ?? '')

/** Refs this player has had anywhere in the game. */
export const usedRefs = (snapshot: GameSnapshot, playerId: string): Set<string> =>
  new Set(snapshot.turns.filter((t) => t.playerId === playerId).map((t) => turnRef(snapshot, t)))

/** The question for a pair's next turn; `turnIndex` is how many turns the pair has already taken. */
export const questionForTurn = ({
  plan,
  turnIndex,
  used,
  random,
  sources,
}: {
  plan: QuestionPlan
  turnIndex: number
  used: ReadonlySet<string>
  random: () => number
  sources: QuestionSources
}): string | null => {
  if (plan.mode === 'same') return plan.question
  // A trio's third turn wraps back to the first question.
  if (plan.mode === 'per-turn') return plan.questions[turnIndex % 2 === 0 ? 0 : 1]
  return drawQuestion(sourceRefs(plan.source, sources), used, random)
}

export type PlanProblem = 'unknown_source' | 'unknown_question' | 'no_questions'

/** Why a plan can't run as is; `no_questions` only matters once the round starts. */
export const checkPlan = (plan: QuestionPlan, sources: QuestionSources): PlanProblem | null => {
  if (plan.mode === 'random') {
    if (plan.source !== CUSTOM_SOURCE && !sources.decks(plan.source)) return 'unknown_source'
    return sourceRefs(plan.source, sources).length === 0 ? 'no_questions' : null
  }
  const known = fixedRefsOf(plan).every((ref) => questionText(ref, 'en', sources) !== null)
  return known ? null : 'unknown_question'
}
