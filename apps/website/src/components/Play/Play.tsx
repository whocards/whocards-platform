import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import type {QuestionSet, TrackingConfig} from '@whocards/decks'
import {getDirection, getInitialNav, navReducer} from '@whocards/decks/engine'
import {trackEvent} from '@whocards/observability'
import {EVENTS, GAMES, eventsFor, createViewTracker, track} from '@whocards/observability/events'
import {getDeviceId} from '~lib/device-id'
import {createOfflineQueue} from '~lib/offline-queue'
import {sendAnswer} from '~lib/answer-transport'
import {cn} from '~utils'

export type {QuestionSet, TrackingConfig}

export type PlayProps = {
  /** map of question id -> { lang: text } */
  questions: QuestionSet
  /** ordered list of available language codes (e.g. ['hu', 'en']) */
  languages: string[]
  /** slug of the deck being played, recorded with every Answer */
  deckSlug?: string
  /** optional analytics / db tracking. When omitted, no tracking happens. */
  tracking?: TrackingConfig
  /** localStorage key used to persist the chosen language */
  languageStorageKey?: string
  /** text colour utility for the question, so the deck adapts to its background */
  questionClassName?: string
}

/** One queue per island, recording each serve to the Answer record via tRPC. */
const answerQueue = createOfflineQueue(sendAnswer)

// Static nav glyphs, hand-written as inline JSX <svg> rather than astro-icon's
// <Icon>. astro-icon's <Icon> is an *Astro* component — it resolves `virtual:astro-icon`
// and reads from src/icons at build/render time, which only works inside .astro files.
// It can't be rendered from a React island like this one. `@iconify-icon/react` (used
// in LanguageSwitcher.tsx / Print.tsx) doesn't solve this either — that's a web-component
// wrapper around Iconify's *remote* API/collections (e.g. `mdi:`, `zondicons:`), not a
// bridge to our local src/icons SVGs.
//
// So for one-off glyphs in a React island, the simplest safe pattern is a hoisted inline
// JSX <svg> const (hoisted so it isn't re-created on every render, rendering-hoist-jsx).
// If a React island ever needs several of these, promote them to small colocated
// components instead of copy-pasting more one-offs — see src/icons/README.md.
const PrevArrowIcon = (
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' className='h-10 w-10'>
    <path fill='currentColor' d='M20 11H7.83l5.59-5.59L12 4l-8 8l8 8l1.41-1.41L7.83 13H20z' />
  </svg>
)
const NextArrowIcon = (
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' className='h-10 w-10'>
    <path fill='currentColor' d='m12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z' />
  </svg>
)

export const Play = ({
  questions,
  languages,
  deckSlug,
  tracking,
  languageStorageKey = 'play-language',
  questionClassName = 'text-darkest',
}: PlayProps) => {
  const questionIds = useMemo(() => Object.keys(questions), [questions])
  const defaultLanguage = languages[0]

  const reducer = useMemo(() => navReducer(questionIds), [questionIds])
  const [{ids, idx}, dispatch] = useReducer(reducer, undefined, () => {
    // a `?q=` deep link wins (start there, keep the rest behind it); otherwise shuffle
    const startId =
      typeof window === 'undefined'
        ? undefined
        : (new URLSearchParams(window.location.search).get('q') ?? undefined)
    return getInitialNav(questionIds, startId)
  })

  const getStoredLanguage = useCallback((): string => {
    if (typeof window === 'undefined') return defaultLanguage ?? ''
    // a `?lang=` query param wins so deep links stay shareable
    const urlLang = new URLSearchParams(window.location.search).get('lang')
    if (urlLang && languages.includes(urlLang)) {
      localStorage.setItem(languageStorageKey, urlLang)
      return urlLang
    }
    const stored = localStorage.getItem(languageStorageKey)
    if (stored && languages.includes(stored)) return stored
    localStorage.setItem(languageStorageKey, defaultLanguage ?? '')
    return defaultLanguage ?? ''
  }, [defaultLanguage, languageStorageKey, languages])

  // lazy init: getStoredLanguage touches localStorage (read AND write) — pass the
  // function so it runs once on mount, not on every render (rerender-lazy-state-init)
  const [language, setLanguageState] = useState<string>(getStoredLanguage)
  const [showControls, setShowControls] = useState(true)

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  // transient values driven by per-frame mousemove / hover — kept in refs so they
  // don't trigger re-renders (rerender-use-ref-transient-values). `showControls`
  // stays state because the JSX reads it; its ref mirror just gates the setState.
  const showControlsRef = useRef(true)
  const isHoveredRef = useRef(false)

  const setLanguage = useCallback(
    (next: string) => {
      if (typeof window !== 'undefined') localStorage.setItem(languageStorageKey, next)
      setLanguageState(next)
    },
    [languageStorageKey]
  )

  // ---- dwell tracker (stable for the component lifetime) ----
  const viewTracker = useMemo(() => createViewTracker(trackEvent), [])

  // ---- auto-hiding controls ----

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  const setHideTimeout = useCallback(() => {
    clearHideTimeout()
    // read the live hover state from a ref so this callback stays stable and never
    // arms the timer while the pointer rests on the controls
    if (isHoveredRef.current) return
    hideTimeoutRef.current = setTimeout(() => {
      showControlsRef.current = false
      setShowControls(false)
    }, 3000)
  }, [clearHideTimeout])

  // mousemove fires ~once per frame: only touch state on the hidden→shown edge,
  // then (re)arm the idle-hide timer. The ref guard keeps no-op moves render-free.
  const handleMouseMove = useCallback(() => {
    if (!showControlsRef.current) {
      showControlsRef.current = true
      setShowControls(true)
    }
    setHideTimeout()
  }, [setHideTimeout])

  const handleControlsMouseEnter = useCallback(() => {
    isHoveredRef.current = true
    clearHideTimeout()
  }, [clearHideTimeout])

  const handleControlsMouseLeave = useCallback(() => {
    isHoveredRef.current = false
    setHideTimeout()
  }, [setHideTimeout])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    setHideTimeout()
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      clearHideTimeout()
    }
  }, [handleMouseMove, setHideTimeout, clearHideTimeout])

  // ---- flush any queued Answers on load and when the network returns ----
  useEffect(() => answerQueue.start(), [])

  // ---- emit deck_opened on mount ----
  useEffect(() => {
    if (deckSlug) {
      const startId =
        typeof window === 'undefined'
          ? undefined
          : (new URLSearchParams(window.location.search).get('q') ?? undefined)
      track({
        name: EVENTS.DECK_OPENED,
        props: {deck_id: deckSlug, source: startId ? 'deep_link' : 'browse'},
      })
      track({
        name: EVENTS.GAME_STARTED,
        props: {deck_id: deckSlug, game: GAMES.WH, language: language ?? defaultLanguage ?? ''},
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckSlug])

  // keep the previous committed nav state so nav events read the REAL post-dispatch
  // ids (no pre-dispatch approximation) — fixes question_next/deck_cycled at the cycle
  // boundary and keeps the transition logic in @whocards/observability/events.
  const prevNavRef = useRef<{ids: typeof ids; idx: number} | null>(null)

  // ---- track every question view ----
  useEffect(() => {
    const questionId = ids[idx]
    if (!questionId) return

    // nav events from the real committed transition (prev → current)
    const prev = prevNavRef.current
    if (prev && prev.idx !== idx) {
      const action = idx > prev.idx ? ({type: 'next'} as const) : ({type: 'previous'} as const)
      for (const event of eventsFor(
        action,
        prev,
        {ids, idx},
        {
          deck_id: deckSlug ?? '',
          language: language ?? '',
          game: GAMES.WH,
        }
      )) {
        track(event)
      }
    }

    // dwell: start the new view (end is fired by the nav handlers / lifecycle)
    viewTracker.startView({
      deck_id: deckSlug ?? '',
      question_id: questionId,
      language: language ?? '',
    })

    // always-on catalog tracking
    track({
      name: EVENTS.QUESTION_SHOWN,
      props: {
        deck_id: deckSlug ?? '',
        question_id: questionId,
        language: language ?? '',
        source: 'nav',
      },
    })

    // legacy, event-scoped conference tracking (kept until it folds in, 0003)
    if (tracking) {
      void fetch(tracking.endpoint, {
        method: 'POST',
        body: JSON.stringify({
          eventId: tracking.eventId,
          userId: getDeviceId(),
          questionId,
          type: 'view',
          language: language,
        }),
      })
    }

    // durable Answer record: enqueue every serve, flushed via the offline queue.
    // TODO(answered=served): `language` in the deps re-records when language is
    // switched on the same card (an over-count vs "answered = served"); revisit
    // when "answered" gains a dwell timer.
    if (deckSlug && questionId) {
      void answerQueue.enqueue({
        deviceId: getDeviceId(),
        deckSlug,
        questionId,
        language: language ?? '',
      })
    }

    prevNavRef.current = {ids, idx}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, ids])

  // ---- end dwell on tab hide / page close (use beacon path) ----
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        viewTracker.endView('closed')
      }
    }
    const handlePagehide = () => {
      viewTracker.endView('closed')
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePagehide)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePagehide)
    }
  }, [viewTracker])

  // ---- keep ?q= and ?lang= in the url in sync so links stay shareable ----
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('q', ids[idx] ?? '')
    url.searchParams.set('lang', language ?? '')
    window.history.replaceState(null, '', url)
  }, [idx, ids, language])

  // ---- navigation handlers ----

  // Handlers only end the outgoing dwell + dispatch; the nav events (question_next /
  // question_previous / deck_cycled) are emitted from the [idx, ids] effect off the
  // REAL committed state, so there's no pre-dispatch approximation to maintain.
  const handlePrevious = useCallback(() => {
    viewTracker.endView('previous')
    dispatch({type: 'previous'})
  }, [viewTracker])

  const handleNext = useCallback(() => {
    viewTracker.endView('advanced')
    dispatch({type: 'next'})
  }, [viewTracker])

  const changeLanguage = useCallback(
    (next: string) => {
      if (next === language) return
      track({
        name: EVENTS.LANGUAGE_CHANGED,
        props: {
          deck_id: deckSlug ?? '',
          from: language ?? '',
          to: next,
        },
      })
      setLanguage(next)
    },
    [deckSlug, language, setLanguage]
  )

  // two languages => simple toggle (preserves hajnalig UX); more => dropdown
  const isToggle = languages.length === 2
  const otherLanguage = isToggle ? languages.find((l) => l !== language)! : undefined

  const handleToggleLanguage = useCallback(() => {
    if (otherLanguage) changeLanguage(otherLanguage)
  }, [otherLanguage, changeLanguage])

  const direction = getDirection(language ?? '')
  const questionText =
    questions[ids[idx] ?? '']?.[language ?? ''] ??
    questions[ids[idx] ?? '']?.[defaultLanguage ?? ''] ??
    ''

  return (
    <>
      <div
        className={cn(
          'xs:text-3xl phone-landscape:text-2xl flex h-full w-full items-center px-4 pb-[10%] text-5xl font-semibold md:px-8 md:text-7xl lg:max-w-[1140px] xl:px-0',
          questionClassName
        )}
      >
        <h1 dir={direction} className='whitespace-pre-wrap leading-tight'>
          {questionText}
        </h1>
      </div>

      <div
        ref={controlsRef}
        onMouseEnter={handleControlsMouseEnter}
        onMouseLeave={handleControlsMouseLeave}
        className={`fixed bottom-4 mx-auto flex h-12 flex-col items-center justify-center transition-all duration-500 ${
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div
          className={`text-gray flex w-full max-w-2xl items-center justify-between gap-8 transition-all duration-500 ${
            showControls ? 'translate-y-0' : 'md:translate-y-16'
          }`}
        >
          <button
            aria-label='previous question'
            onClick={handlePrevious}
            disabled={idx === 0}
            className={cn(idx === 0 && 'pointer-events-none opacity-50', 'hover:text-primary-dark')}
          >
            {PrevArrowIcon}
          </button>

          {isToggle ? (
            <button
              aria-label='change language'
              onClick={handleToggleLanguage}
              className='group/button btn btn-circle btn-ghost bg-gray hover:bg-gray/80 hover:text-primary-light relative uppercase text-white'
            >
              <span className='absolute transition-all duration-200 group-hover/button:-translate-y-full group-hover/button:opacity-0'>
                {language}
              </span>
              <span className='absolute translate-y-full opacity-0 transition-all duration-200 group-hover/button:translate-y-0 group-hover/button:opacity-100'>
                {otherLanguage}
              </span>
            </button>
          ) : (
            <label className='relative'>
              <span className='sr-only'>change language</span>
              <select
                aria-label='change language'
                value={language}
                onChange={(e) => changeLanguage(e.target.value)}
                className={cn(
                  'btn btn-circle bg-gray hover:bg-gray/80 hover:text-primary-light cursor-pointer appearance-none text-center uppercase text-white',
                  language?.includes('-') && 'w-fit px-4'
                )}
              >
                {languages.map((l) => (
                  <option key={l} value={l} className='text-darkest'>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            aria-label='next question'
            onClick={handleNext}
            className='hover:text-primary-dark'
          >
            {NextArrowIcon}
          </button>
        </div>
      </div>
    </>
  )
}

export default Play
