import type {AnswerMode, GameSettings} from '../schemas'

export const DEFAULT_ANSWER_MODE: AnswerMode = 'voice'

/** The mode in force for a turn claimed at `at`; a switch stamped at the same instant counts as later. */
export const answerModeAt = (settings: GameSettings, at: number): AnswerMode =>
  settings.answerModes?.findLast((entry) => entry.at < at)?.mode ?? DEFAULT_ANSWER_MODE

/** The mode the next claimed turn gets. */
export const currentAnswerMode = (settings: GameSettings): AnswerMode =>
  answerModeAt(settings, Number.POSITIVE_INFINITY)
