import {describe, expect, it} from 'vitest'
import {
  applyPrivacyThreshold,
  buildTrend,
  MIN_DEVICE_COUNT,
  periodTrend,
  platformBreakdown,
} from './rollups'

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

describe('periodTrend', () => {
  it('empty input yields no points', () => {
    expect(periodTrend('week', [])).toEqual([])
  })

  it('fills zero-count gap weeks between the first and last data point', () => {
    const points = periodTrend(
      'week',
      [
        {periodStart: '2026-01-05', count: 1},
        {periodStart: '2026-01-19', count: 1},
      ],
      new Date('2026-01-19T00:00:00Z')
    )
    expect(points).toEqual([
      {periodStart: '2026-01-05', count: 1},
      {periodStart: '2026-01-12', count: 0},
      {periodStart: '2026-01-19', count: 1},
    ])
  })

  it('zero-fills through the current period even if the most recent activity was weeks ago', () => {
    const points = periodTrend(
      'week',
      [{periodStart: '2026-01-05', count: 1}],
      new Date('2026-01-28T00:00:00Z') // a Wednesday, 3 weeks later
    )
    expect(points.map((p) => p.periodStart)).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
    ])
  })

  it('caps months at the last 24, dropping older buckets', () => {
    const points = periodTrend(
      'month',
      [
        {periodStart: '2020-01-01', count: 5},
        {periodStart: '2026-01-01', count: 1},
      ],
      new Date('2026-01-15T00:00:00Z')
    )
    expect(points).toHaveLength(24)
    expect(points[0]).toEqual({periodStart: '2024-02-01', count: 0})
    expect(points.at(-1)).toEqual({periodStart: '2026-01-01', count: 1})
  })

  it('folds monthly rows into uncapped calendar years', () => {
    const points = periodTrend(
      'year',
      [
        {periodStart: '2024-11-01', count: 2},
        {periodStart: '2024-12-01', count: 3},
        {periodStart: '2026-01-01', count: 1},
      ],
      new Date('2026-01-15T00:00:00Z')
    )
    expect(points).toEqual([
      {periodStart: '2024-01-01', count: 5},
      {periodStart: '2025-01-01', count: 0},
      {periodStart: '2026-01-01', count: 1},
    ])
  })

  it('does not smooth — a single spiky week stays a spike, not an average', () => {
    const points = periodTrend(
      'week',
      [
        {periodStart: '2026-01-05', count: 5},
        {periodStart: '2026-01-12', count: 1},
      ],
      new Date('2026-01-12T00:00:00Z')
    )
    expect(points).toEqual([
      {periodStart: '2026-01-05', count: 5},
      {periodStart: '2026-01-12', count: 1},
    ])
  })
})

describe('buildTrend', () => {
  it('serves week from the weekly rows and both month and year from the monthly rows', () => {
    const trend = buildTrend(
      [{periodStart: '2026-01-05', count: 4}],
      [{periodStart: '2026-01-01', count: 4}],
      new Date('2026-01-07T00:00:00Z')
    )
    expect(trend.week).toEqual([{periodStart: '2026-01-05', count: 4}])
    expect(trend.month).toEqual([{periodStart: '2026-01-01', count: 4}])
    expect(trend.year).toEqual([{periodStart: '2026-01-01', count: 4}])
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
