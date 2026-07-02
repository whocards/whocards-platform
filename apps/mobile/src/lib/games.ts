import type {GameId} from '@whocards/decks/engine'
import type {AccessTier} from './entitlements'

export type GameInfo = {
  id: GameId
  title: string
  description: string
  tier: AccessTier
}

/** Player-facing Game catalog for the picker. Order is display order. */
export const GAME_CATALOG: GameInfo[] = [
  {
    id: 'wh',
    title: 'Classic',
    description: 'Swipe through the deck, one question after another.',
    tier: 'free',
  },
  {
    id: 'pick',
    title: 'Pick a Card',
    description: 'Draw each card yourself — a fresh deal for every question.',
    tier: 'unlock',
  },
]
