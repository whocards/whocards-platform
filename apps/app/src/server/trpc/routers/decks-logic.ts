// Pure logic for the decks router, split out so it's testable without a
// database (see decks-logic.test.ts) — same split as question-review-logic.ts
// / question-review.ts. decks.ts wires this up to Drizzle queries and tRPC
// procedures.

import type {AppRole} from '../../auth/permissions'

export const DECK_STATUSES = ['draft', 'in_review', 'approved', 'shipped'] as const
export type DeckStatus = (typeof DECK_STATUSES)[number]

export const isDeckStatus = (value: string): value is DeckStatus =>
  (DECK_STATUSES as readonly string[]).includes(value)

/**
 * A deck's status is a linear pipeline: draft -> in_review -> approved ->
 * shipped. `updateStatus` only allows moving one step forward (advance the
 * review) or one step back (reopen for more work), not skipping straight from
 * draft to shipped — this keeps status a meaningful progress indicator rather
 * than a free-for-all label. Product-decision flag: if the founder wants
 * unrestricted jumps instead, this is a one-line change (delete the distance
 * check, keep the `from === to` no-op branch).
 */
export const canTransitionDeckStatus = (from: DeckStatus, to: DeckStatus): boolean => {
  if (from === to) return true
  return Math.abs(DECK_STATUSES.indexOf(from) - DECK_STATUSES.indexOf(to)) === 1
}

/**
 * The statuses a deck-detail `<select>` should actually offer from its current
 * status: itself (no-op) plus whatever `canTransitionDeckStatus` allows (one
 * step forward/back), in DECK_STATUSES order. Keeps the UI from ever showing
 * an option the server will reject — see decks/$slug.tsx, which used to render
 * all 4 statuses unconditionally.
 */
export const nextStatusOptions = (current: DeckStatus): DeckStatus[] =>
  DECK_STATUSES.filter((status) => canTransitionDeckStatus(current, status))

/** Minimum role for each decks.ts procedure — named so the router and its
 *  guard tests (decks-logic.test.ts) reference one source of truth instead of
 *  duplicating role-string literals. Matches the founder's brief: reviewer
 *  views, facilitator manages (status changes + add-question). */
export const DECKS_MIN_ROLE: Record<'view' | 'updateStatus' | 'addQuestion', AppRole> = {
  view: 'reviewer',
  updateStatus: 'facilitator',
  addQuestion: 'facilitator',
}

export type ActGroup<T> = {actLabel: string; items: T[]}

/** Groups items into sections by `actLabel`, preserving first-seen order (the
 *  order the DB returns them in, i.e. roster sortOrder) — this is what turns
 *  a deck's flat question list into the visually separated act sections the
 *  founder asked for ("crammed list with no separation"). */
export const groupByAct = <T extends {actLabel: string}>(items: readonly T[]): ActGroup<T>[] => {
  const order: string[] = []
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    if (!buckets.has(item.actLabel)) {
      buckets.set(item.actLabel, [])
      order.push(item.actLabel)
    }
    buckets.get(item.actLabel)?.push(item)
  }
  return order.map((actLabel) => ({actLabel, items: buckets.get(actLabel) ?? []}))
}

export type NewQuestionInput = {deckSlug: string; actLabel: string; text: string}

export type NewQuestionRecord = {
  questionId: string
  deckQuestion: {deckSlug: string; questionId: string; actLabel: string; sortOrder: number}
  questionReview: {deckSlug: string; questionId: string; status: 'draft'; currentText: string}
}

/**
 * Shapes the two rows `decks.addQuestion` inserts — a deckQuestion roster
 * entry plus an initial `question_review` row (status 'draft', currentText =
 * the given text) — from raw form input. Pure so the trimming/validation/
 * id-generation rules are unit-testable without a DB; decks.ts calls this
 * then does the two inserts. `generateId` is injected (rather than calling
 * `crypto.randomUUID()` here) so tests can pass a deterministic id.
 *
 * Decision (flagged for founder confirmation): a manually added question gets
 * exactly one wording, not the 5-way variant set the imported ai-at-work
 * questions have — that variant set is a one-time artifact of PR #144's
 * candidate-wording pick, not a general feature. A facilitator can still
 * comment/vote/approve/edit the single wording via the existing flow; if you
 * want real multi-variant authoring for new questions too, that's a
 * reasonably-sized follow-up (a `question_variant` table), not a redesign.
 */
export const buildNewQuestion = (
  input: NewQuestionInput,
  generateId: () => string,
  sortOrder: number
): NewQuestionRecord => {
  const deckSlug = input.deckSlug.trim()
  const actLabel = input.actLabel.trim()
  const text = input.text.trim()
  if (!deckSlug) throw new Error('deckSlug is required')
  if (!actLabel) throw new Error('actLabel is required')
  if (!text) throw new Error('text is required')

  const questionId = `${deckSlug}-${generateId()}`
  return {
    questionId,
    deckQuestion: {deckSlug, questionId, actLabel, sortOrder},
    questionReview: {deckSlug, questionId, status: 'draft', currentText: text},
  }
}
