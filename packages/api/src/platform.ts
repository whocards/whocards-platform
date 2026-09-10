/**
 * Client platforms an Answer (or a catalog event) can originate from — the
 * single source of truth other packages/derive from, instead of hand-copying
 * the same three strings (previously duplicated across answers.ts, trpc.ts,
 * and the stats page's own types/query modules).
 */
export const ANSWER_PLATFORMS = ['web', 'ios', 'android'] as const

export type AnswerPlatform = (typeof ANSWER_PLATFORMS)[number]
