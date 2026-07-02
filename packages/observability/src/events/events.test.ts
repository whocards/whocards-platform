import {describe, expect, it, vi, afterEach} from 'vitest'
import {configureObservability} from '../index'
import {eventsFor, createViewTracker, EVENTS, GAMES, track} from './index'
import type {NavState, NavAction} from '@whocards/decks/engine'

afterEach(() => {
  // reset to dev (safe fallback)
  configureObservability({dev: true})
})

// ---------------------------------------------------------------------------
// eventsFor — pure mapper
// ---------------------------------------------------------------------------

describe('eventsFor — next action', () => {
  const ctx = {deck_id: 'friends', language: 'en', game: 'wh'}

  it('emits question_next with correct from/to ids', () => {
    const prev: NavState = {ids: ['q1', 'q2', 'q3'], idx: 0}
    const next: NavState = {ids: ['q1', 'q2', 'q3'], idx: 1}
    const action: NavAction = {type: 'next'}

    const events = eventsFor(action, prev, next, ctx)
    expect(events).toHaveLength(1)
    expect(events[0]?.name).toBe(EVENTS.QUESTION_NEXT)
    expect(events[0]?.props).toEqual({
      deck_id: 'friends',
      from_question_id: 'q1',
      to_question_id: 'q2',
      language: 'en',
    })
  })

  it('also emits deck_cycled when ids length grew', () => {
    const prev: NavState = {ids: ['q1', 'q2'], idx: 1}
    // next appended a new shuffle batch — ids grew
    const next: NavState = {ids: ['q1', 'q2', 'q3', 'q1'], idx: 2}
    const action: NavAction = {type: 'next'}

    const events = eventsFor(action, prev, next, ctx)
    expect(events).toHaveLength(2)
    expect(events[0]?.name).toBe(EVENTS.QUESTION_NEXT)
    expect(events[1]?.name).toBe(EVENTS.DECK_CYCLED)
    expect(events[1]?.props).toEqual({deck_id: 'friends', game: 'wh'})
  })

  it('reads to_question_id from the REAL appended ids at the cycle boundary', () => {
    // At the wrap point the reducer appends a fresh shuffle; to_question_id must be
    // the first card of that NEW batch. Regression guard: callers must pass the real
    // post-dispatch state, not a pre-dispatch approximation (which mislabelled this id).
    const prev: NavState = {ids: ['q1', 'q2'], idx: 1}
    const next: NavState = {ids: ['q1', 'q2', 'q3', 'q1', 'q2'], idx: 2}

    const events = eventsFor({type: 'next'}, prev, next, ctx)
    const navEvent = events[0]
    expect(navEvent?.name).toBe(EVENTS.QUESTION_NEXT)
    expect((navEvent?.props as {to_question_id: string} | undefined)?.to_question_id).toBe('q3')
    expect(events[1]?.name).toBe(EVENTS.DECK_CYCLED)
  })

  it('does NOT emit deck_cycled when ids length stayed the same', () => {
    const prev: NavState = {ids: ['q1', 'q2', 'q3'], idx: 1}
    const next: NavState = {ids: ['q1', 'q2', 'q3'], idx: 2}
    const action: NavAction = {type: 'next'}

    const events = eventsFor(action, prev, next, ctx)
    expect(events).toHaveLength(1)
    expect(events[0]?.name).toBe(EVENTS.QUESTION_NEXT)
  })
})

describe('eventsFor — previous action', () => {
  const ctx = {deck_id: 'friends', language: 'en', game: 'wh'}

  it('emits question_previous when moving back', () => {
    const prev: NavState = {ids: ['q1', 'q2', 'q3'], idx: 1}
    const next: NavState = {ids: ['q1', 'q2', 'q3'], idx: 0}
    const action: NavAction = {type: 'previous'}

    const events = eventsFor(action, prev, next, ctx)
    expect(events).toHaveLength(1)
    expect(events[0]?.name).toBe(EVENTS.QUESTION_PREVIOUS)
    expect(events[0]?.props).toEqual({
      deck_id: 'friends',
      from_question_id: 'q2',
      to_question_id: 'q1',
      language: 'en',
    })
  })

  it('is a no-op (empty array) when already clamped at idx 0', () => {
    // reducer returns same state when already at 0
    const state: NavState = {ids: ['q1', 'q2'], idx: 0}
    const action: NavAction = {type: 'previous'}

    const events = eventsFor(action, state, state, ctx)
    expect(events).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// createViewTracker — stateful dwell stopwatch
// ---------------------------------------------------------------------------

describe('createViewTracker — dwell tracking', () => {
  it('emits question_viewed with correct dwell_ms', () => {
    let t = 0
    const now = () => t
    const emit = vi.fn()
    const tracker = createViewTracker(emit, now)

    tracker.startView({deck_id: 'friends', question_id: 'q1', language: 'en'})
    t = 1500
    tracker.endView('advanced')

    expect(emit).toHaveBeenCalledOnce()
    const [name, props] = emit.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe(EVENTS.QUESTION_VIEWED)
    expect(props?.dwell_ms).toBe(1500)
    expect(props?.reason).toBe('advanced')
    expect(props?.deck_id).toBe('friends')
    expect(props?.question_id).toBe('q1')
    expect(props?.language).toBe('en')
  })

  it('clamps dwell_ms to >= 0 even with a bad clock', () => {
    let t = 100
    const now = () => t
    const emit = vi.fn()
    const tracker = createViewTracker(emit, now)

    tracker.startView({deck_id: 'friends', question_id: 'q1', language: 'en'})
    t = 50 // clock went backwards
    tracker.endView('closed')

    const [, props] = emit.mock.calls[0] as [string, Record<string, unknown>]
    expect(props?.dwell_ms).toBe(0)
  })

  it('is a no-op when endView called with no active view', () => {
    const emit = vi.fn()
    const tracker = createViewTracker(emit)

    tracker.endView('backgrounded')
    expect(emit).not.toHaveBeenCalled()
  })

  it('emits each reason correctly', () => {
    const reasons = ['advanced', 'previous', 'backgrounded', 'closed'] as const
    for (const reason of reasons) {
      let t = 0
      const now = () => t
      const emit = vi.fn()
      const tracker = createViewTracker(emit, now)
      tracker.startView({deck_id: 'friends', question_id: 'q1', language: 'en'})
      t = 100
      tracker.endView(reason)
      const [, props] = emit.mock.calls[0] as [string, Record<string, unknown>]
      expect(props?.reason).toBe(reason)
    }
  })

  it('clears state after endView — subsequent endView is no-op', () => {
    let t = 0
    const now = () => t
    const emit = vi.fn()
    const tracker = createViewTracker(emit, now)

    tracker.startView({deck_id: 'friends', question_id: 'q1', language: 'en'})
    t = 500
    tracker.endView('advanced')
    tracker.endView('advanced') // should be no-op

    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('startView restarts tracking for a new question', () => {
    let t = 0
    const now = () => t
    const emit = vi.fn()
    const tracker = createViewTracker(emit, now)

    tracker.startView({deck_id: 'friends', question_id: 'q1', language: 'en'})
    t = 200
    tracker.endView('advanced')

    // second view
    tracker.startView({deck_id: 'friends', question_id: 'q2', language: 'en'})
    t = 700
    tracker.endView('previous')

    expect(emit).toHaveBeenCalledTimes(2)
    const secondProps = emit.mock.calls[1]?.[1] as Record<string, unknown>
    expect(secondProps?.question_id).toBe('q2')
    expect(secondProps?.dwell_ms).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// track wrapper
// ---------------------------------------------------------------------------

describe('track — typed wrapper over trackEvent', () => {
  it('calls trackEvent with name and props', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    configureObservability({dev: true})

    track({name: 'deck_opened', props: {deck_id: 'friends', source: 'home'}})

    expect(consoleSpy).toHaveBeenCalledOnce()
    expect(consoleSpy.mock.calls[0]?.[1]).toBe('deck_opened')
    consoleSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// catalog — pick game additions
// ---------------------------------------------------------------------------

describe('catalog — Pick a Card additions', () => {
  it('exposes the pick game id and events', () => {
    expect(GAMES.PICK).toBe('pick')
    expect(EVENTS.CARD_PICKED).toBe('card_picked')
    expect(EVENTS.SECONDARY_LANGUAGES_CHANGED).toBe('secondary_languages_changed')
  })

  it('eventsFor carries the pick game id into deck_cycled', () => {
    const prev: NavState = {ids: ['q1', 'q2'], idx: 1}
    const next: NavState = {ids: ['q1', 'q2', 'q3', 'q1'], idx: 2}
    const events = eventsFor({type: 'next'}, prev, next, {
      deck_id: 'library',
      language: 'en',
      game: GAMES.PICK,
    })
    expect(events[1]?.props).toEqual({deck_id: 'library', game: 'pick'})
  })
})
