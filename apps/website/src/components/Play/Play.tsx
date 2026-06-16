import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import type {QuestionSet, TrackingConfig} from '@whocards/decks'
import {getDirection, getInitialNav, navReducer} from '@whocards/decks/engine'
import {cn} from '~utils'

export type {QuestionSet, TrackingConfig}

export type PlayProps = {
  /** map of question id -> { lang: text } */
  questions: QuestionSet
  /** ordered list of available language codes (e.g. ['hu', 'en']) */
  languages: string[]
  /** optional analytics / db tracking. When omitted, no tracking happens. */
  tracking?: TrackingConfig
  /** localStorage key used to persist the chosen language */
  languageStorageKey?: string
  /** localStorage key used to persist an anonymous user id (tracking only) */
  userIdStorageKey?: string
  /** text colour utility for the question, so the deck adapts to its background */
  questionClassName?: string
}

export const Play = ({
  questions,
  languages,
  tracking,
  languageStorageKey = 'play-language',
  userIdStorageKey = 'play-user-id',
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
    if (typeof window === 'undefined') return defaultLanguage
    // a `?lang=` query param wins so deep links stay shareable
    const urlLang = new URLSearchParams(window.location.search).get('lang')
    if (urlLang && languages.includes(urlLang)) {
      localStorage.setItem(languageStorageKey, urlLang)
      return urlLang
    }
    const stored = localStorage.getItem(languageStorageKey)
    if (stored && languages.includes(stored)) return stored
    localStorage.setItem(languageStorageKey, defaultLanguage)
    return defaultLanguage
  }, [defaultLanguage, languageStorageKey, languages])

  const [language, setLanguageState] = useState<string>(getStoredLanguage())
  const [trackingSource, setTrackingSource] = useState('initial')
  const [showControls, setShowControls] = useState(true)
  const [isControlsHovered, setIsControlsHovered] = useState(false)

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const userIdRef = useRef<string>('')

  const setLanguage = useCallback(
    (next: string) => {
      if (typeof window !== 'undefined') localStorage.setItem(languageStorageKey, next)
      setLanguageState(next)
    },
    [languageStorageKey]
  )

  // ---- tracking helpers (no-ops when tracking is undefined) ----

  const getUserId = useCallback((): string => {
    if (typeof window === 'undefined') return ''
    if (userIdRef.current) return userIdRef.current
    let userId = localStorage.getItem(userIdStorageKey)
    if (!userId) {
      userId = crypto.randomUUID()
      localStorage.setItem(userIdStorageKey, userId)
    }
    userIdRef.current = userId
    return userId
  }, [userIdStorageKey])

  const createQuestionTracking = useCallback(
    (questionId: string, type: string, lang: string) => {
      if (!tracking) return
      void fetch(tracking.endpoint, {
        method: 'POST',
        body: JSON.stringify({
          eventId: tracking.eventId,
          userId: getUserId(),
          questionId,
          type,
          language: lang,
        }),
      })
    },
    [tracking, getUserId]
  )

  const capture = useCallback(
    (eventName: string, questionId: string, properties: Record<string, unknown> = {}) => {
      if (!tracking) return
      window.posthog?.capture(eventName, {
        event_id: tracking.eventId,
        question_id: Number(questionId),
        ...properties,
      })
    },
    [tracking]
  )

  // ---- auto-hiding controls ----

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  const setHideTimeout = useCallback(() => {
    clearHideTimeout()
    if (!isControlsHovered) {
      hideTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [isControlsHovered, clearHideTimeout])

  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    setHideTimeout()
  }, [setHideTimeout])

  const handleControlsMouseEnter = useCallback(() => {
    setIsControlsHovered(true)
    clearHideTimeout()
  }, [clearHideTimeout])

  const handleControlsMouseLeave = useCallback(() => {
    setIsControlsHovered(false)
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

  useEffect(() => {
    if (showControls && !isControlsHovered) {
      setHideTimeout()
    } else if (isControlsHovered) {
      clearHideTimeout()
    }
  }, [isControlsHovered, showControls, setHideTimeout, clearHideTimeout])

  // ---- track every question view ----
  useEffect(() => {
    createQuestionTracking(ids[idx], trackingSource, language)
    capture('event_question_seen', ids[idx], {language, source: trackingSource})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, ids, language, trackingSource])

  // ---- keep ?q= and ?lang= in the url in sync so links stay shareable ----
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('q', ids[idx])
    url.searchParams.set('lang', language)
    window.history.replaceState(null, '', url)
  }, [idx, ids, language])

  // ---- navigation handlers ----

  const handlePrevious = useCallback(() => {
    const previousQuestionId = ids[idx - 1]
    if (previousQuestionId) {
      capture('event_question_previous', previousQuestionId, {
        language,
        from_question_id: Number(ids[idx]),
      })
    }
    setTrackingSource('previous')
    dispatch({type: 'previous'})
  }, [idx, ids, language, capture])

  const handleNext = useCallback(() => {
    capture('event_question_next', ids[idx], {language})
    setTrackingSource('next')
    dispatch({type: 'next'})
  }, [idx, ids, language, capture])

  const changeLanguage = useCallback(
    (next: string) => {
      if (next === language) return
      capture('event_language_changed', ids[idx], {
        from_language: language,
        to_language: next,
      })
      setTrackingSource('language_change')
      setLanguage(next)
    },
    [idx, ids, language, capture, setLanguage]
  )

  // two languages => simple toggle (preserves hajnalig UX); more => dropdown
  const isToggle = languages.length === 2
  const otherLanguage = isToggle ? languages.find((l) => l !== language)! : undefined

  const handleToggleLanguage = useCallback(() => {
    if (otherLanguage) changeLanguage(otherLanguage)
  }, [otherLanguage, changeLanguage])

  const direction = getDirection(language)
  const questionText =
    questions[ids[idx]]?.[language] ?? questions[ids[idx]]?.[defaultLanguage] ?? ''

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
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' className='h-10 w-10'>
              <path
                fill='currentColor'
                d='M20 11H7.83l5.59-5.59L12 4l-8 8l8 8l1.41-1.41L7.83 13H20z'
              />
            </svg>
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
                  language.includes('-') && 'w-fit px-4'
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
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' className='h-10 w-10'>
              <path
                fill='currentColor'
                d='m12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z'
              />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}

export default Play
