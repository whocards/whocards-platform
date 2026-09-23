// Pure logic for Facilitator Mode (issue #221), split out so it's testable
// without a database — same split as decks-logic.ts / question-review-logic.ts.
// facilitate.ts wires this up to Drizzle queries and tRPC procedures;
// routes/_authed/facilitate.tsx imports the dose math directly (client-safe:
// no DB/asset imports here) so the dose picker's live "~N min / N questions"
// preview and the runner's actual queue go through the exact same function.

export const DOSES = ['micro', 'macro', 'full'] as const
export type Dose = (typeof DOSES)[number]

export const isDose = (value: string): value is Dose => (DOSES as readonly string[]).includes(value)

export const DOSE_META: Record<Dose, {label: string; tag: string; description: string}> = {
  micro: {
    label: 'Micro',
    tag: 'test the water',
    description: 'A quick pulse — just the opening act or two.',
  },
  macro: {
    label: 'Macro',
    tag: 'a real check-in',
    description: 'A fuller session — most of the way through the arc.',
  },
  full: {
    label: 'Full',
    tag: 'the whole arc',
    description: 'Every act, start to finish — the deepest dose.',
  },
}

/**
 * THE dose -> question-count mapping. This is the one function to change if
 * the model changes — every caller (the picker's live count preview, the
 * runner's actual queue) goes through it; none re-implement the math.
 *
 * Today "dose" = how far *through* the act-ordered roster you go (further =
 * bigger dose): micro = max(3, ceil(n/3)), macro = ceil(2n/3), full = n.
 * Avi may later switch this to "deeper *per* act" instead (more questions
 * within each act rather than more acts) — that's a rewrite of this one
 * function's body, not a new call site anywhere.
 *
 * Each step is clamped to `total` so a tiny deck (e.g. a fresh custom deck
 * with 1-2 questions) is never asked for more questions than it has, and
 * `macro` is floored at `micro` — without that, a roster of exactly 3
 * (micro's `max(3, …)` floor equals `total`, but `ceil(2*3/3)` is only 2)
 * would show "Macro" offering *fewer* questions than "Micro", which reads as
 * broken rather than as a deliberately small deck. `full` is always `total`.
 */
export const doseQuestionCount = (total: number, dose: Dose): number => {
  if (total <= 0) return 0
  const micro = Math.min(total, Math.max(3, Math.ceil(total / 3)))
  if (dose === 'micro') return micro
  const macro = Math.min(total, Math.max(micro, Math.ceil((total * 2) / 3)))
  return dose === 'macro' ? macro : total
}

/** Slices an act-ordered roster down to one dose's worth — the actual queue
 *  Facilitator Mode runs through. Generic over the roster's item shape so
 *  both the tRPC roster payload and any client-side preview can share it. */
export const buildSessionQueue = <T>(roster: readonly T[], dose: Dose): T[] =>
  roster.slice(0, doseQuestionCount(roster.length, dose))

/** Per-question timer length — the spec's "calm ~2-min timer." */
export const QUESTION_TIMER_SECONDS = 120

/** How long before 0:00 the warm ambient glow starts fading in — kept short
 *  so it reads as a gentle nudge, never a klaxon (spec: "only fades in over
 *  the last ~20s"). */
export const TIMER_WARM_SECONDS = 20

/** Rough session length for the picker/summary copy ("~N min") — each
 *  question budgeted at the full per-question timer. */
export const estimatedMinutes = (questionCount: number): number =>
  Math.round((questionCount * QUESTION_TIMER_SECONDS) / 60)
