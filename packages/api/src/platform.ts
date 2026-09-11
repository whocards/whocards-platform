export const ANSWER_PLATFORMS = ['web', 'ios', 'android'] as const

export type AnswerPlatform = (typeof ANSWER_PLATFORMS)[number]
