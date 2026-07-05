import {useQuery} from '@tanstack/react-query'
import {createFileRoute, Link} from '@tanstack/react-router'
import {useEffect, useMemo, useRef, useState} from 'react'

import {trpc} from '~/lib/trpc'
import {
  buildSessionQueue,
  DOSE_META,
  DOSES,
  doseQuestionCount,
  estimatedMinutes,
  QUESTION_TIMER_SECONDS,
  TIMER_WARM_SECONDS,
} from '~/server/trpc/routers/facilitate-logic'
import type {Dose} from '~/server/trpc/routers/facilitate-logic'

/**
 * Facilitator Mode (issue #221) — a deck-agnostic timed session runner. Entry
 * points: this route directly (linked from the nav, see routes/_authed.tsx)
 * and a `?deck=<slug>` preselect from a deck's own page (decks/$slug.tsx's
 * "Facilitate this deck" link). One route handles both: there's no separate
 * "picker" vs "deck-preselected" screen, just the same picker with a
 * different starting selection.
 */
export const Route = createFileRoute('/_authed/facilitate')({
  validateSearch: (search: Record<string, unknown>): {deck?: string} => ({
    deck: typeof search.deck === 'string' ? search.deck : undefined,
  }),
  component: FacilitatePage,
})

type FacilitateDeck = Awaited<ReturnType<(typeof trpc)['facilitate']['decks']['query']>>[number]
type FacilitateRoster = Awaited<ReturnType<(typeof trpc)['facilitate']['roster']['query']>>
type RosterQuestion = FacilitateRoster['questions'][number]

function FacilitatePage() {
  const {deck: initialDeckSlug} = Route.useSearch()

  // Checked first, on its own — the picker/roster queries below never even
  // fire until this says granted, so a denied caller (or a direct API call
  // that skips this component entirely) can't pull real deck content; see
  // server/trpc/routers/facilitate.ts, which enforces the same gate again.
  const entitlement = useQuery({
    queryKey: ['facilitate.entitlement'],
    queryFn: () => trpc.facilitate.entitlement.query(),
  })

  if (entitlement.isLoading || !entitlement.data) return null
  if (entitlement.isError || !entitlement.data.granted) return <FacilitateLocked />

  return (
    <FacilitateApp initialDeckSlug={initialDeckSlug} entitlementReason={entitlement.data.reason} />
  )
}

/** The clean, non-crashing state for a caller whose plan doesn't include
 *  Facilitator Mode. Not reachable today — server/entitlements.ts's stub
 *  grants every tier — but it must render correctly regardless, for the day
 *  a real plan check can actually deny. */
function FacilitateLocked() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 p-10 text-center">
      <span className="facilitate-badge is-locked">Facilitator Mode</span>
      <h1 className="text-xl font-bold">Run the room</h1>
      <p className="text-gray-lighter">
        Facilitator Mode runs any deck as a live, timed session with your team — it&apos;s part of a
        paid plan.
      </p>
      <p className="text-sm text-gray-lighter">Ask your workspace owner to upgrade to unlock it.</p>
      <Link
        to="/decks"
        className="mt-2 flex min-h-11 items-center justify-center rounded-full bg-yellow-400 px-5 font-bold text-darker"
      >
        Back to Decks
      </Link>
    </div>
  )
}

type Stage = 'pick' | 'run' | 'end'

function FacilitateApp({
  initialDeckSlug,
  entitlementReason,
}: {
  initialDeckSlug: string | undefined
  entitlementReason: 'free' | 'early_access' | 'purchase'
}) {
  const [deckSlug, setDeckSlug] = useState(initialDeckSlug)
  const [dose, setDose] = useState<Dose>('macro')
  const [stage, setStage] = useState<Stage>('pick')

  const decksQuery = useQuery({
    queryKey: ['facilitate.decks'],
    queryFn: () => trpc.facilitate.decks.query(),
  })
  const decks = decksQuery.data ?? []
  const selectedDeck: FacilitateDeck | undefined =
    decks.find((d) => d.slug === deckSlug) ?? decks[0]

  const rosterQuery = useQuery({
    queryKey: ['facilitate.roster', selectedDeck?.slug],
    queryFn: () => trpc.facilitate.roster.query({deckSlug: selectedDeck?.slug ?? ''}),
    enabled: Boolean(selectedDeck) && stage !== 'pick',
  })

  const queue = useMemo(
    () => buildSessionQueue(rosterQuery.data?.questions ?? [], dose),
    [rosterQuery.data, dose]
  )

  if (stage === 'run' || stage === 'end') {
    if (queue.length === 0) {
      return (
        <div className="facilitate-overlay">
          <div className="facilitate-stage flex flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-gray-lighter">Loading questions…</p>
            <button
              type="button"
              className="text-sm text-gray-lighter underline"
              onClick={() => setStage('pick')}
            >
              Cancel
            </button>
          </div>
        </div>
      )
    }

    if (stage === 'end') {
      return (
        <SessionEnd dose={dose} questionCount={queue.length} onRestart={() => setStage('pick')} />
      )
    }

    return (
      <SessionRunner
        queue={queue}
        onExit={() => setStage('pick')}
        onFinish={() => setStage('end')}
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-1 p-6 text-center md:p-10">
      <span className="facilitate-badge">
        {entitlementReason === 'early_access'
          ? 'Facilitator Mode · Included in early access'
          : 'Facilitator Mode'}
      </span>
      <h1 className="facilitate-title">Run the room</h1>
      <p className="facilitate-sub">
        Pick a deck and a dose. One question at a time, a calm timer, you set the pace.
      </p>

      <div className="facilitate-label">Deck</div>
      {decksQuery.isLoading ? <p className="text-gray-lighter">Loading decks…</p> : null}
      {decksQuery.isError ? <p className="text-red">{decksQuery.error.message}</p> : null}
      {!decksQuery.isLoading && decks.length === 0 ? (
        <p className="max-w-sm text-sm text-gray-lighter">
          No decks with questions yet — add questions to a deck from Decks first.
        </p>
      ) : null}
      {decks.length > 0 ? (
        <div className="facilitate-decks">
          {decks.map((d) => (
            <button
              key={d.slug}
              type="button"
              className="facilitate-deck"
              aria-selected={d.slug === selectedDeck?.slug}
              onClick={() => setDeckSlug(d.slug)}
            >
              <span>
                <span className="facilitate-deck-name block">{d.title}</span>
                <span className="facilitate-deck-count block">
                  {d.totalActs} act{d.totalActs === 1 ? '' : 's'} · {d.totalQuestions} question
                  {d.totalQuestions === 1 ? '' : 's'}
                </span>
              </span>
              <span className="facilitate-deck-tick" aria-hidden="true">
                ✓
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {selectedDeck ? (
        <>
          <div className="facilitate-label">Dose</div>
          <div className="facilitate-doses">
            {DOSES.map((k) => {
              const count = doseQuestionCount(selectedDeck.totalQuestions, k)
              return (
                <button
                  key={k}
                  type="button"
                  className="facilitate-dose"
                  aria-selected={k === dose}
                  onClick={() => setDose(k)}
                >
                  <div className="facilitate-dose-label">{DOSE_META[k].label}</div>
                  <div className="facilitate-dose-detail">
                    ~{estimatedMinutes(count)} min
                    <br />
                    {count} question{count === 1 ? '' : 's'}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="facilitate-dose-desc">{DOSE_META[dose].description}</p>
        </>
      ) : null}

      <button
        type="button"
        className="mt-2 flex min-h-13 items-center justify-center rounded-full bg-yellow-400 px-10 text-base font-bold text-darker disabled:opacity-60"
        disabled={!selectedDeck}
        onClick={() => setStage('run')}
      >
        Start session
      </button>
    </div>
  )
}

function SessionEnd({
  dose,
  questionCount,
  onRestart,
}: {
  dose: Dose
  questionCount: number
  onRestart: () => void
}) {
  return (
    <div className="facilitate-overlay">
      <div className="facilitate-stage flex flex-col items-center justify-center gap-1 p-8 text-center">
        <div className="facilitate-end-mark" aria-hidden="true">
          ✦
        </div>
        <h2 className="font-serif text-2xl font-semibold">Session complete</h2>
        <p className="mb-2 text-gray-lighter">
          <b className="text-yellow-400">{DOSE_META[dose].label} dose</b> — you moved through{' '}
          <b className="text-yellow-400">
            {questionCount} question{questionCount === 1 ? '' : 's'}
          </b>{' '}
          in about <b className="text-yellow-400">{estimatedMinutes(questionCount)} minutes</b>.
        </p>
        <button
          type="button"
          className="flex min-h-13 items-center justify-center rounded-full bg-yellow-400 px-10 text-base font-bold text-darker"
          onClick={onRestart}
        >
          Run another
        </button>
      </div>
    </div>
  )
}

function SessionRunner({
  queue,
  onExit,
  onFinish,
}: {
  queue: RosterQuestion[]
  onExit: () => void
  onFinish: () => void
}) {
  const [index, setIndex] = useState(0)
  const [swapping, setSwapping] = useState(false)
  const swapTimeoutRef = useRef<number | undefined>(undefined)

  const isLast = index === queue.length - 1
  const current = queue[index]

  const goTo = (nextIndex: number) => {
    setSwapping(true)
    swapTimeoutRef.current = window.setTimeout(() => {
      setIndex(nextIndex)
      setSwapping(false)
    }, 300)
  }
  // Clear a pending question-swap timeout on unmount (e.g. exiting mid-fade) —
  // otherwise it fires after the component is gone.
  useEffect(() => () => window.clearTimeout(swapTimeoutRef.current), [])

  const handleNext = () => {
    if (isLast) onFinish()
    else goTo(index + 1)
  }
  const handleBack = () => {
    if (index > 0) goTo(index - 1)
  }

  const timer = useQuestionTimer(index)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') handleNext()
      else if (event.key === 'ArrowLeft') handleBack()
      else if (event.key === ' ') {
        event.preventDefault()
        timer.togglePause()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // handleNext/handleBack close over `index`/`queue`, both stable for the
    // life of one question — re-subscribing per index keeps the handler
    // current. `timer` is deliberately omitted: useQuestionTimer returns a new
    // object each render, but `togglePause` only ever flips a ref, so any
    // render's copy behaves identically — including it here would just
    // re-subscribe this listener on every render for no behavioral change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue])

  if (!current) return null // queue is non-empty by the time this mounts (caller guards it)

  return (
    <div className="facilitate-overlay">
      <div className="facilitate-warmth" ref={timer.warmthRef} />
      <div className="facilitate-timerbar">
        <i ref={timer.barRef} />
      </div>

      <div className="facilitate-stage">
        <div className="facilitate-rtop">
          <button
            type="button"
            className="facilitate-exit"
            aria-label="Exit session"
            onClick={onExit}
          >
            ×
          </button>
          <div className="facilitate-dots">
            {queue.map((q, i) => (
              <span
                key={q.questionId}
                className={`facilitate-dot ${i < index ? 'is-done' : i === index ? 'is-now' : ''}`}
              />
            ))}
          </div>
          <span className="facilitate-count">
            {index + 1} / {queue.length}
          </span>
        </div>

        <div className={`facilitate-qwrap ${swapping ? 'is-swapping' : ''}`}>
          <div className="facilitate-act">{current.actLabel}</div>
          <div className="facilitate-question">{current.text}</div>
          <button
            type="button"
            ref={timer.pillRef}
            className="facilitate-timerpill"
            onClick={timer.togglePause}
            aria-label="Pause or show time remaining"
          >
            <svg className="facilitate-ring" viewBox="0 0 20 20" aria-hidden="true">
              <circle className="bg" cx="10" cy="10" r="8" />
              <circle className="fg" ref={timer.ringRef} cx="10" cy="10" r="8" />
            </svg>
            <span ref={timer.labelRef}>{formatClock(QUESTION_TIMER_SECONDS)}</span>
          </button>
        </div>

        <div ref={timer.hintRef} className="facilitate-hint">
          time&apos;s up — wrap this one up when you&apos;re ready
        </div>

        <div className="facilitate-controls">
          <button
            type="button"
            className="flex min-h-13 items-center justify-center rounded-full border border-hairline px-6 text-base font-semibold text-gray-lighter disabled:opacity-30"
            disabled={index === 0}
            onClick={handleBack}
          >
            Back
          </button>
          <button
            type="button"
            className="flex min-h-13 flex-1 items-center justify-center rounded-full bg-yellow-400 text-base font-bold text-darker"
            onClick={handleNext}
          >
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 8

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
}

/**
 * Drives the per-question timer's visuals (top progress line, ring pill,
 * mm:ss label, warm ambient glow) by mutating refs directly inside a
 * requestAnimationFrame loop rather than React state — a smooth countdown
 * without re-rendering the tree every frame. Resets whenever `resetKey`
 * changes (SessionRunner passes the question index). Never auto-advances:
 * once remaining hits 0 it paints the "wrap up" state once and stops
 * scheduling frames — Next/Back (a new `resetKey`) is the only way past it.
 */
function useQuestionTimer(resetKey: number) {
  const warmthRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLElement>(null)
  const ringRef = useRef<SVGCircleElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)

  useEffect(() => {
    let remaining = QUESTION_TIMER_SECONDS
    let lastTimestamp = performance.now()
    let rafId = 0
    let wasLow = false
    pausedRef.current = false
    pillRef.current?.classList.remove('is-low', 'is-wrap')
    hintRef.current?.classList.remove('is-visible')

    function paint() {
      const frac = remaining / QUESTION_TIMER_SECONDS
      if (barRef.current) barRef.current.style.transform = `scaleX(${frac})`
      if (ringRef.current) {
        ringRef.current.style.strokeDasharray = `${RING_CIRCUMFERENCE}`
        ringRef.current.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - frac)}`
      }
      if (labelRef.current) {
        labelRef.current.textContent = pausedRef.current
          ? 'paused'
          : remaining <= 0
            ? 'wrap up'
            : formatClock(remaining)
      }
      if (warmthRef.current) {
        const opacity =
          remaining <= 0
            ? 1
            : remaining <= TIMER_WARM_SECONDS
              ? Math.min(1, (TIMER_WARM_SECONDS - remaining) / TIMER_WARM_SECONDS)
              : 0
        warmthRef.current.style.opacity = String(opacity)
      }
    }

    function tick(now: number) {
      if (!pausedRef.current) {
        const dt = (now - lastTimestamp) / 1000
        lastTimestamp = now
        remaining = Math.max(0, remaining - dt)
      } else {
        lastTimestamp = now
      }
      paint()

      const nowLow = remaining > 0 && remaining <= TIMER_WARM_SECONDS
      if (nowLow !== wasLow) {
        wasLow = nowLow
        pillRef.current?.classList.toggle('is-low', nowLow)
      }

      if (remaining <= 0) {
        pillRef.current?.classList.remove('is-low')
        pillRef.current?.classList.add('is-wrap')
        hintRef.current?.classList.add('is-visible')
        return // hold at 0:00 — no more frames until `resetKey` changes
      }
      rafId = requestAnimationFrame(tick)
    }

    paint()
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [resetKey])

  const togglePause = () => {
    pausedRef.current = !pausedRef.current
  }

  return {warmthRef, barRef, ringRef, labelRef, pillRef, hintRef, togglePause}
}
