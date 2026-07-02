/**
 * @whocards/observability/events
 *
 * Domain-level event catalog, nav-action mapper, and dwell-time tracker.
 * This subpath may import from @whocards/decks TYPES only (one-way dependency;
 * decks must never import observability — no cycles).
 */
import type {NavAction, NavState} from '@whocards/decks/engine'
import type {EventProps, ObsEvent} from '../index'
import {trackEvent} from '../index'

// ---------------------------------------------------------------------------
// Event catalog — typed names + per-event payload types
// ---------------------------------------------------------------------------

export const EVENTS = {
  DECK_OPENED: 'deck_opened',
  GAME_STARTED: 'game_started',
  QUESTION_SHOWN: 'question_shown',
  QUESTION_NEXT: 'question_next',
  QUESTION_PREVIOUS: 'question_previous',
  QUESTION_VIEWED: 'question_viewed',
  DECK_CYCLED: 'deck_cycled',
  CARD_PICKED: 'card_picked',
  LANGUAGE_CHANGED: 'language_changed',
  SECONDARY_LANGUAGES_CHANGED: 'secondary_languages_changed',
  APP_REVIEW_ELIGIBLE: 'app_review_eligible',
  APP_REVIEW_REQUESTED: 'app_review_requested',
  SHARE_COMPLETED: 'share_completed',
} as const

/** Game ids used in event payloads — single source of truth for the `game` prop. */
export const GAMES = {WH: 'wh', PICK: 'pick'} as const

/** The three rows offered by the Share sheet (epic #152) — one shape for web and mobile. */
export type ShareFormat = 'link' | 'story' | 'post'

export type DeckOpenedProps = {deck_id: string; source: string}
export type GameStartedProps = {
  deck_id: string
  game: string
  language: string
  secondary_languages?: string[]
}
export type QuestionShownProps = {
  deck_id: string
  question_id: string
  language: string
  source: string
}
export type QuestionNextProps = {
  deck_id: string
  from_question_id: string
  to_question_id: string
  language: string
}
export type QuestionPreviousProps = {
  deck_id: string
  from_question_id: string
  to_question_id: string
  language: string
}
export type ViewReason = 'advanced' | 'previous' | 'backgrounded' | 'closed'
export type QuestionViewedProps = {
  deck_id: string
  question_id: string
  language: string
  dwell_ms: number
  reason: ViewReason
}
export type DeckCycledProps = {deck_id: string; game: string}
/** The pick tap itself — distinct from question_shown so re-reads don't inflate it. */
export type CardPickedProps = {deck_id: string; game: string}
export type LanguageChangedProps = {deck_id: string; from: string; to: string}
export type SecondaryLanguagesChangedProps = {deck_id: string; secondary: string[]}
export type AppReviewEligibleProps = {
  app_version: string
  card_count: number
  session_count: number
}
// `platform` is React Native's `Platform.OS` ('ios' | 'android'); typed as string
// here so the shared (web + mobile) package needn't depend on react-native types.
export type AppReviewRequestedProps = {app_version: string; platform: string}
/**
 * A completed Share (epic #152): the Web Share API succeeded, the clipboard-copy
 * fallback succeeded, or a Share Card PNG download was triggered. Fired by both
 * the web player and mobile Share sheet (#154/#155) with the same shape so both
 * surfaces roll into one growth metric. A cancelled OS share sheet is NOT a
 * completed share — callers must not emit this for a user-abandoned share.
 */
export type ShareCompletedProps = {
  deck_id: string
  question_id: string
  language: string
  game: string
  format: ShareFormat
}

// ---------------------------------------------------------------------------
// Typed track wrapper
// ---------------------------------------------------------------------------

/** Typed wrapper over the core `trackEvent` for catalog events. */
export const track = (event: ObsEvent): void => {
  if (event.props !== undefined) {
    trackEvent(event.name, event.props)
  } else {
    trackEvent(event.name)
  }
}

// ---------------------------------------------------------------------------
// Pure nav-action → events mapper
// ---------------------------------------------------------------------------

type NavContext = {deck_id: string; language: string; game: string}

/**
 * Maps a nav action + state transition to zero or more catalog events.
 * Pure — no side-effects, no module state. Callers emit via `track()`.
 *
 * - `next`: emits `question_next`; also `deck_cycled` when ids grew (cycle).
 * - `previous`: emits `question_previous` (empty when clamped at idx 0).
 * - `reset`: emits nothing — a deep-link jump into the deck isn't a nav step (the
 *   new card's `question_shown` is emitted by the caller's question effect).
 * - `question_viewed` is NOT emitted here — that's the view tracker's job.
 */
export const eventsFor = (
  action: NavAction,
  prev: NavState,
  next: NavState,
  ctx: NavContext
): ObsEvent[] => {
  switch (action.type) {
    case 'next': {
      const fromId = prev.ids[prev.idx]
      const toId = next.ids[next.idx]
      if (fromId === undefined || toId === undefined) return []

      const events: ObsEvent[] = [
        {
          name: EVENTS.QUESTION_NEXT,
          props: {
            deck_id: ctx.deck_id,
            from_question_id: fromId,
            to_question_id: toId,
            language: ctx.language,
          } satisfies QuestionNextProps as EventProps,
        },
      ]

      // ids grew → a fresh shuffle was appended — this is the cycle boundary
      if (next.ids.length > prev.ids.length) {
        events.push({
          name: EVENTS.DECK_CYCLED,
          props: {deck_id: ctx.deck_id, game: ctx.game} satisfies DeckCycledProps as EventProps,
        })
      }

      return events
    }

    case 'previous': {
      // Clamped at idx 0 in both states — reducer returned same state
      if (prev.idx === 0 && next.idx === 0) return []

      const fromId = prev.ids[prev.idx]
      const toId = next.ids[next.idx]
      if (fromId === undefined || toId === undefined) return []

      return [
        {
          name: EVENTS.QUESTION_PREVIOUS,
          props: {
            deck_id: ctx.deck_id,
            from_question_id: fromId,
            to_question_id: toId,
            language: ctx.language,
          } satisfies QuestionPreviousProps as EventProps,
        },
      ]
    }

    case 'reset':
      // A deep-link jump into the open deck — not a next/previous nav step.
      return []
  }
}

// ---------------------------------------------------------------------------
// Stateful dwell-time tracker
// ---------------------------------------------------------------------------

type ViewMeta = {deck_id: string; question_id: string; language: string}

type ViewTrackerState = {meta: ViewMeta; startedAt: number} | null

/** Monotonic clock factory — injectable for tests. */
const defaultNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()

/**
 * Creates a stateful dwell-time tracker.
 *
 * - `startView(meta)` — records the start time for the current question.
 * - `endView(reason)` — computes `dwell_ms`, emits `question_viewed`, clears state.
 *   Calling `endView` with no active view is a no-op.
 *
 * @param emit — injectable emit function (defaults to `trackEvent`)
 * @param now  — injectable clock (defaults to `performance.now()` / `Date.now()`)
 */
export const createViewTracker = (
  emit: (name: string, props?: EventProps) => void = trackEvent,
  now: () => number = defaultNow
): {startView: (meta: ViewMeta) => void; endView: (reason: ViewReason) => void} => {
  let state: ViewTrackerState = null

  const startView = (meta: ViewMeta): void => {
    state = {meta, startedAt: now()}
  }

  const endView = (reason: ViewReason): void => {
    if (state === null) return
    const dwell_ms = Math.max(0, Math.round(now() - state.startedAt))
    const props: QuestionViewedProps = {
      deck_id: state.meta.deck_id,
      question_id: state.meta.question_id,
      language: state.meta.language,
      dwell_ms,
      reason,
    }
    state = null
    emit(EVENTS.QUESTION_VIEWED, props as EventProps)
  }

  return {startView, endView}
}
