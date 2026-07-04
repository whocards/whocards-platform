// Pure logic for the question-review router, split out so it's testable without
// a database (see question-review.test.ts). question-review.ts wires this up to
// Drizzle queries and the tRPC procedures.

export const ACTS = [
  {label: 'Act 1 — Name the fear', range: [1, 9]},
  {label: 'Act 2 — Map the work', range: [10, 18]},
  {label: 'Act 3 — Redesign the role', range: [19, 27]},
  {label: 'Act 4 — Team norms', range: [28, 37]},
] as const

export const QUESTION_IDS = Array.from({length: 37}, (_, i) => `ai-${i + 1}`)

/** Which act a question id (e.g. 'ai-14') falls into, by its numeric suffix. */
export const actLabelFor = (questionId: string): string => {
  const n = Number(questionId.replace('ai-', ''))
  return ACTS.find((act) => n >= act.range[0] && n <= act.range[1])?.label ?? ''
}

export type Vote = {questionId: string; variant: string}

/** Vote counts per variant, for one question. */
export const tallyVotesForQuestion = (
  votes: readonly Vote[],
  questionId: string
): Partial<Record<string, number>> => {
  const tally: Partial<Record<string, number>> = {}
  for (const vote of votes) {
    if (vote.questionId !== questionId) continue
    tally[vote.variant] = (tally[vote.variant] ?? 0) + 1
  }
  return tally
}

export type ApprovedText = ReadonlyMap<string, string>

/**
 * The 37-question deck as it stands right now: approved text where a question
 * has been decided, the shipped baseline everywhere else. This is what
 * `emitDiff` compares against the shipped JSON, and what `approve` incrementally
 * builds toward as more questions get decided.
 */
export const assembleDeck = (
  shippedText: (questionId: string) => string,
  approvedText: ApprovedText,
  questionIds: readonly string[] = QUESTION_IDS
): Record<string, {en: string}> => {
  const assembled: Record<string, {en: string}> = {}
  for (const questionId of questionIds) {
    assembled[questionId] = {en: approvedText.get(questionId) ?? shippedText(questionId)}
  }
  return assembled
}
