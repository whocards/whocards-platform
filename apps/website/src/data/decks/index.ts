/**
 * The deck registry now lives in `@whocards/decks` (shared with mobile). This
 * module re-exports it so the website's existing `~data/decks` import sites keep
 * working unchanged.
 */
export type {Deck, DeckPresentation, DeckSource, ResolvedDeck, DeckSlug} from '@whocards/decks'
export {DEFAULT_DECK_SLUG, getDeck, getAllDecks, isDeckSlug, resolveDeck} from '@whocards/decks'
