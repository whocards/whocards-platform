import type {RefObject} from 'react'
import type {GameId, NavState, QuestionSet} from '@whocards/decks'

import {UnifiedPlayer} from '@/components/unified-player'

/** Kept for compatibility with tests and callers that previously passed carry state. */
export type PlayCarry = {
  nav: NavState
  language: string
  secondary: string[]
  tabletop: boolean
  box: {width: number; height: number} | null
  barH: number
}

type PickPlayerProps = {
  deckSlug: string
  questionIds: string[]
  questions: QuestionSet
  languages: string[]
  poolBacked: boolean
  carryRef?: RefObject<PlayCarry | undefined>
  onChangeGame?: (game: GameId) => void
}

/**
 * Pick a Card entry point backed by the unified player so Pick a Card and Classic
 * share one mounted surface with zero unmount transitions.
 */
export const PickPlayer = ({
  deckSlug,
  questionIds,
  questions,
  languages,
  poolBacked,
  onChangeGame,
}: PickPlayerProps) => (
  <UnifiedPlayer
    deckSlug={deckSlug}
    questionIds={questionIds}
    questions={questions}
    languages={languages}
    poolBacked={poolBacked}
    initialGame="pick"
    onChangeGame={onChangeGame}
  />
)
