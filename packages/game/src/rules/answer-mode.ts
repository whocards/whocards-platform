import type {AnswerMode, GameSettings} from '../schemas'

export const DEFAULT_ANSWER_MODE: AnswerMode = 'voice'

/** The mode in force at `at`; turns pass their claim time, so a later switch never reaches them. */
export const answerModeAt = (settings: GameSettings, at: number): AnswerMode =>
  settings.answerModes?.findLast((entry) => entry.at <= at)?.mode ?? DEFAULT_ANSWER_MODE

/** The mode the next claimed turn gets. */
export const currentAnswerMode = (settings: GameSettings): AnswerMode =>
  settings.answerModes?.at(-1)?.mode ?? DEFAULT_ANSWER_MODE
