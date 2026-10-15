import type {AnswerMode, OddRule, Overtime, QuestionPlan, RoundStatus} from '@whocards/game'

export type BriefRound = {
  id: string
  n: number
  status: RoundStatus
  turnSeconds: number
  oddRule: OddRule
  overtime: Overtime
  overtimeSeconds: number
  questionPlan: QuestionPlan
}

/** The live round, else the next one to start; null once every round is done. */
export const roundToBrief = <R extends BriefRound>(rounds: readonly R[]): R | null =>
  rounds.find((r) => r.status === 'live') ??
  rounds.filter((r) => r.status === 'pending').toSorted((a, b) => a.n - b.n)[0] ??
  null

/** `90 seconds`, `2 minutes`, `2 min 30 s`. */
export const spokenDuration = (seconds: number): string => {
  if (seconds < 120) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} minutes` : `${minutes} min ${rest} s`
}

const QUESTIONS: Record<QuestionPlan['mode'], string> = {
  random: 'Each of you draws your own question on your phone.',
  same: 'Everyone gets the same question.',
  'per-turn': 'Each turn has its own question, the same for every pair.',
  physical: 'Draw a card from the deck in the room and read it out.',
}

const ANSWERS: Record<AnswerMode, string> = {
  voice: 'Speak your answer; it is saved as text for you.',
  type: 'Type your answer on your phone.',
  none: 'Just talk. Nothing is recorded.',
}

/** Plain sentences telling the room how a round plays. */
export const roundBrief = (
  round: BriefRound,
  o: {answerMode: AnswerMode; standby: boolean}
): string[] => {
  const overtime =
    round.overtime === 'hard' || round.overtimeSeconds === 0
      ? 'When time is up, the turn ends.'
      : `When time is up, you get ${spokenDuration(round.overtimeSeconds)} more to wrap up.`
  const trio = round.oddRule === 'trio'
  const odd = o.standby
    ? `Odd one out: find a facilitator. If none is free, ${trio ? 'join a pair as a trio' : 'sit this round out'}.`
    : trio
      ? 'Odd one out joins a pair as a trio.'
      : 'Odd one out sits this round out.'
  return [
    round.n === 1 ? 'Pair up with someone.' : 'Pair with someone new.',
    `Each of you gets ${spokenDuration(round.turnSeconds)} to answer.`,
    QUESTIONS[round.questionPlan.mode],
    ANSWERS[o.answerMode],
    overtime,
    odd,
  ]
}
