/** A language code present in the Pool (e.g. `'en'`, `'pt-br'`, `'he'`). */
export type LanguageCode = string

/** A question's id (the key into the Pool / a {@link QuestionSet}). */
export type QuestionId = string

/** One question's text, keyed by language code. */
export type QuestionText = Record<LanguageCode, string>

/** A map of question id -> { language code -> question text }. */
export type QuestionSet = Record<QuestionId, QuestionText>

/** The master, multilingual store of Question content. */
export type Pool = QuestionSet

/** Optional analytics / db tracking handed to the view. No-op when omitted. */
export type TrackingConfig = {
  /** numeric event id sent with every tracking call */
  eventId: number
  /** endpoint that receives the question-tracking POST */
  endpoint: string
}

/**
 * Presentation + config hints a deck hands to the view layer. These are
 * platform-agnostic; each app maps them onto its own components.
 */
export type DeckPresentation = {
  /** ordered list of available language codes; first entry is the default */
  languages: LanguageCode[]
  /** text-colour utility for the question (adapts to the deck background) */
  questionClassName?: string
  /** render on the legacy hero background (the /play look) */
  oldBg?: boolean
  /** storage key used to persist the chosen language */
  languageStorageKey?: string
  /** storage key used to persist an anonymous user id (tracking only) */
  userIdStorageKey?: string
  /** optional analytics / db tracking. When omitted, no tracking happens. */
  tracking?: TrackingConfig
}

/**
 * A deck source describes WHERE a deck's questions come from. A deck either
 * references ids in the global Pool (no text duplicated) or carries its own
 * inline {@link QuestionSet}.
 */
export type DeckSource =
  | {
      kind: 'library'
      /** Ordered ids into the Pool. Omitted => the full library, in pool order. */
      ids?: QuestionId[]
    }
  | {
      kind: 'inline'
      /** the deck's own question id -> { lang: text } map */
      questions: QuestionSet
    }

/** The authored shape of a deck (what lives in the registry). */
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

/** A deck whose questions have been resolved into a concrete {@link QuestionSet}. */
export type ResolvedDeck = Deck & {
  /** the deck's questions, resolved to id -> { lang: text } */
  questions: QuestionSet
  /** ordered question ids (the keys of `questions`, in deck order) */
  questionIds: QuestionId[]
}

/**
 * Is this deck's content backed by the global Pool (`source.kind === 'library'`),
 * as opposed to an inline, deck-authored {@link QuestionSet}?
 *
 * The on-demand Share Card endpoint (ADR-0007) resolves `(language, id)` against
 * the Pool only — an inline deck's ids either don't exist there (404, e.g.
 * ai-at-work's `ai-3`) or collide with an unrelated Pool id and silently serve
 * the WRONG image (e.g. hajnalig's numeric ids overlapping Pool ids 1–66).
 * Callers must gate any Share Card image offering on this predicate — derived
 * from the deck's source, never from a hardcoded slug list — until a
 * deck-aware endpoint lands (ADR-0007 future work).
 */
export const isPoolBacked = (deck: {source: DeckSource}): boolean => deck.source.kind === 'library'
