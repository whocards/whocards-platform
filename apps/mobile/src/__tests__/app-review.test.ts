/**
 * Tests for src/lib/app-review.ts
 *
 * Covers:
 * - incrementCardCount accumulates correctly
 * - incrementSessionCount accumulates correctly
 * - isReviewEligible returns true only when all three conditions are met
 * - isReviewEligible returns false when already attempted for this version
 * - markReviewAttempted persists lastVersion so the same version is not repeated
 * - getReviewState reads from AsyncStorage (not an in-memory cache)
 *
 * Strategy: mirrors the AsyncStorage-mock style from language-store.test.ts and
 * device-id.test.ts. Each test gets a clean AsyncStorage.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  MIN_CARDS,
  MIN_SESSIONS,
  getReviewState,
  incrementCardCount,
  incrementSessionCount,
  isReviewEligible,
  markReviewAttempted,
} from '../lib/app-review'

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// incrementCardCount
// ---------------------------------------------------------------------------

describe('incrementCardCount', () => {
  it('starts at 0 and returns 1 on first call', async () => {
    const count = await incrementCardCount()
    expect(count).toBe(1)
  })

  it('accumulates across calls', async () => {
    await incrementCardCount()
    await incrementCardCount()
    const count = await incrementCardCount()
    expect(count).toBe(3)
  })

  it('accepts a delta > 1', async () => {
    const count = await incrementCardCount(5)
    expect(count).toBe(5)
  })

  it('persists the count to AsyncStorage', async () => {
    await incrementCardCount(3)
    const raw = await AsyncStorage.getItem('whocards-review:card-count')
    expect(raw).toBe('3')
  })
})

// ---------------------------------------------------------------------------
// incrementSessionCount
// ---------------------------------------------------------------------------

describe('incrementSessionCount', () => {
  it('starts at 0 and returns 1 on first call', async () => {
    const count = await incrementSessionCount()
    expect(count).toBe(1)
  })

  it('accumulates across calls', async () => {
    await incrementSessionCount()
    const count = await incrementSessionCount()
    expect(count).toBe(2)
  })

  it('persists the count to AsyncStorage', async () => {
    await incrementSessionCount()
    const raw = await AsyncStorage.getItem('whocards-review:session-count')
    expect(raw).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// isReviewEligible
// ---------------------------------------------------------------------------

describe('isReviewEligible', () => {
  it('returns false when card count is below threshold', () => {
    expect(
      isReviewEligible(
        {cardCount: MIN_CARDS - 1, sessionCount: MIN_SESSIONS, lastVersion: null},
        '1.0.0'
      )
    ).toBe(false)
  })

  it('returns false when session count is below threshold', () => {
    expect(
      isReviewEligible(
        {cardCount: MIN_CARDS, sessionCount: MIN_SESSIONS - 1, lastVersion: null},
        '1.0.0'
      )
    ).toBe(false)
  })

  it('returns false when review was already attempted for this version', () => {
    expect(
      isReviewEligible(
        {cardCount: MIN_CARDS, sessionCount: MIN_SESSIONS, lastVersion: '1.0.0'},
        '1.0.0'
      )
    ).toBe(false)
  })

  it('returns true when all conditions are met and version is new', () => {
    expect(
      isReviewEligible(
        {cardCount: MIN_CARDS, sessionCount: MIN_SESSIONS, lastVersion: null},
        '1.0.0'
      )
    ).toBe(true)
  })

  it('returns true when lastVersion is a previous app version', () => {
    expect(
      isReviewEligible(
        {cardCount: MIN_CARDS, sessionCount: MIN_SESSIONS, lastVersion: '0.9.0'},
        '1.0.0'
      )
    ).toBe(true)
  })

  it('returns true exactly at the thresholds (MIN_CARDS, MIN_SESSIONS)', () => {
    expect(
      isReviewEligible(
        {cardCount: MIN_CARDS, sessionCount: MIN_SESSIONS, lastVersion: null},
        '2.0.0'
      )
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// markReviewAttempted + getReviewState
// ---------------------------------------------------------------------------

describe('markReviewAttempted', () => {
  it('sets the lastVersion in AsyncStorage', async () => {
    await markReviewAttempted('1.0.0')
    const raw = await AsyncStorage.getItem('whocards-review:last-version')
    expect(raw).toBe('1.0.0')
  })

  it('prevents a second attempt for the same version via isReviewEligible', async () => {
    // Build up enough counts.
    for (let i = 0; i < MIN_CARDS; i++) await incrementCardCount()
    for (let i = 0; i < MIN_SESSIONS; i++) await incrementSessionCount()

    const before = await getReviewState()
    expect(isReviewEligible(before, '1.0.0')).toBe(true)

    await markReviewAttempted('1.0.0')

    const after = await getReviewState()
    expect(isReviewEligible(after, '1.0.0')).toBe(false)
  })
})

describe('getReviewState', () => {
  it('returns zeros and null when storage is empty', async () => {
    const state = await getReviewState()
    expect(state).toEqual({cardCount: 0, sessionCount: 0, lastVersion: null})
  })

  it('reads persisted values from AsyncStorage', async () => {
    await incrementCardCount(7)
    await incrementSessionCount()
    await incrementSessionCount()
    await markReviewAttempted('1.0.0')

    const state = await getReviewState()
    expect(state).toEqual({cardCount: 7, sessionCount: 2, lastVersion: '1.0.0'})
  })
})
