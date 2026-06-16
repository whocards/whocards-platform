import type {QuestionSet, TrackingConfig} from '~components/Play'

/**
 * Presentation + config hints that a deck hands straight to <Play> / Layout.
 * These mirror the props those components already accept, so wiring a deck up
 * is a matter of spreading these through.
 */
export type DeckPresentation = {
  /** ordered list of available language codes; first entry is the default */
  languages: string[]
  /** text-colour utility for the question (adapts to the deck background) */
  questionClassName?: string
  /** render on the legacy hero background (the /play look) */
  oldBg?: boolean
  /** localStorage key used to persist the chosen language */
  languageStorageKey?: string
  /** localStorage key used to persist an anonymous user id (tracking only) */
  userIdStorageKey?: string
  /** optional analytics / db tracking. When omitted, no tracking happens. */
  tracking?: TrackingConfig
}

/**
 * A deck source describes WHERE a deck's questions come from. A deck either:
 * - references ids in the global pool (`src/data/questions.json`) — no text is
 *   duplicated; this is how the library and curated sub-decks work; or
 * - carries its own inline `QuestionSet` — for decks (e.g. events) whose
 *   questions don't all live in the global pool.
 */
export type DeckSource =
  | {
      kind: 'library'
      /**
       * Ordered ids into the global pool. When omitted, the deck is "all
       * questions" (the full library), in pool order.
       */
      ids?: string[]
    }
  | {
      kind: 'inline'
      /** the deck's own question id -> { lang: text } map */
      questions: QuestionSet
    }

/**
 * The authored shape of a deck (what lives in the registry). The resolver turns
 * this into a {@link ResolvedDeck} with a concrete {@link QuestionSet}.
 */
export type Deck = DeckPresentation & {
  /** url-safe identifier; also the `/play/[deck]` path segment */
  slug: string
  /** human title (used for OG / share card and page metadata) */
  title: string
  /** short description (OG / share card) */
  description: string
  /** where this deck's questions come from */
  source: DeckSource
}

/**
 * A deck whose questions have been resolved into a concrete {@link QuestionSet}.
 * This is what pages consume.
 */
export type ResolvedDeck = Deck & {
  /** the deck's questions, resolved to id -> { lang: text } */
  questions: QuestionSet
  /** ordered question ids (the keys of `questions`, in deck order) */
  questionIds: string[]
}
