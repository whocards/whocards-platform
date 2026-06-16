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
