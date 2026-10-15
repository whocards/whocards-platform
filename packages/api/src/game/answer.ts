import {deadlineOf} from '@whocards/game'
import type {GameLanguage, Round, Turn} from '@whocards/game'

import type {GamePort} from './port'

/** Saves the answer to my turn, finishing the turn first if it's still open. Callers check ownership and mode. */
export const saveAnswer = async (
  port: Pick<GamePort, 'now' | 'finishTurn' | 'saveResponse'>,
  round: Round,
  turn: Turn,
  answer: {playerId: string; language: GameLanguage; transcript: string; durationMs: number}
): Promise<void> => {
  if (turn.finishedAt === null) {
    const finishedAt = Math.min(port.now(), deadlineOf(round, turn))
    await port.finishTurn({turnId: turn.id, finishedAt})
  }
  await port.saveResponse({turnId: turn.id, ...answer})
}
