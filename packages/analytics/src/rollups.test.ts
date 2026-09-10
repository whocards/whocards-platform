import {describe, expect, it} from 'vitest'
import {applyPrivacyThreshold, MIN_DEVICE_COUNT, platformBreakdown, weeklyTrend} from './rollups'

describe('platformBreakdown', () => {
  it('buckets known platforms and sums a total', () => {
    const result = platformBreakdown([
      {platform: 'web', count: 10},
      {platform: 'ios', count: 5},
      {platform: 'android', count: 3},
    ])
    expect(result).toEqual({web: 10, ios: 5, android: 3, unattributed: 0, total: 18})
  })

  it('buckets null (legacy rows) as unattributed', () => {
    const result = platformBreakdown([
      {platform: 'web', count: 10},
      {platform: null, count: 7},
    ])
    expect(result.unattributed).toBe(7)
    expect(result.total).toBe(17)
  })

  it('folds an unrecognized platform string into unattributed rather than dropping it', () => {
    const result = platformBreakdown([
      // @ts-expect-error — exercising a stray/unexpected DB value defensively
      {platform: 'smart-fridge', count: 2},
    ])
    expect(result.unattributed).toBe(2)
    expect(result.total).toBe(2)
  })

  it('empty input yields all zeros', () => {
    expect(platformBreakdown([])).toEqual({web: 0, ios: 0, android: 0, unattributed: 0, total: 0})
  })
})

describe('weeklyTrend', () => {
  it('empty input yields no points', () => {
    expect(weeklyTrend([])).toEqual([])
  })

  it('buckets timestamps into the Monday-starting week they fall in', () => {
    // Mon 2026-01-05 .. Sun 2026-01-11 is one ISO week.
    const points = weeklyTrend([
      {createdAt: new Date('2026-01-05T00:00:00Z')}, // Monday
      {createdAt: new Date('2026-01-07T12:00:00Z')}, // Wednesday, same week
      {createdAt: new Date('2026-01-11T23:59:59Z')}, // Sunday, same week
    ])
    expect(points).toEqual([{weekStart: '2026-01-05', count: 3}])
  })

  it('fills zero-count gap weeks between the first and last data point', () => {
    const points = weeklyTrend([
      {createdAt: new Date('2026-01-05T00:00:00Z')}, // week of Jan 5
      {createdAt: new Date('2026-01-19T00:00:00Z')}, // week of Jan 19 (two weeks later)
    ])
    expect(points).toEqual([
      {weekStart: '2026-01-05', count: 1},
      {weekStart: '2026-01-12', count: 0},
      {weekStart: '2026-01-19', count: 1},
    ])
  })

  it('does not smooth — a single spiky week stays a spike, not an average', () => {
    const points = weeklyTrend([
      {createdAt: new Date('2026-01-05T00:00:00Z')},
      {createdAt: new Date('2026-01-06T00:00:00Z')},
      {createdAt: new Date('2026-01-07T00:00:00Z')},
      {createdAt: new Date('2026-01-08T00:00:00Z')},
      {createdAt: new Date('2026-01-09T00:00:00Z')},
      {createdAt: new Date('2026-01-12T00:00:00Z')}, // next week, one answer
    ])
    expect(points).toEqual([
      {weekStart: '2026-01-05', count: 5},
      {weekStart: '2026-01-12', count: 1},
    ])
  })
})

describe('applyPrivacyThreshold', () => {
  it('drops rows below the default minimum (5)', () => {
    const rows = [
      {name: 'Hungary', count: 42},
      {name: 'Vatican City', count: 1},
      {name: 'Andorra', count: 4},
      {name: 'Germany', count: 5},
    ]
    expect(applyPrivacyThreshold(rows)).toEqual([
      {name: 'Hungary', count: 42},
      {name: 'Germany', count: 5},
    ])
  })

  it('honors a custom threshold', () => {
    const rows = [
      {name: 'A', count: 10},
      {name: 'B', count: 20},
    ]
    expect(applyPrivacyThreshold(rows, 15)).toEqual([{name: 'B', count: 20}])
  })

  it('MIN_DEVICE_COUNT is exported as 5, matching the researcher findings threshold', () => {
    expect(MIN_DEVICE_COUNT).toBe(5)
  })
})
