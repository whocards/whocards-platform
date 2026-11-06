import {beforeEach, describe, expect, it} from 'vitest'
import {resetTestDb} from '../db/test-helpers'
import type {TestDb} from '../db/test-helpers'
import {KEEP_SNAPSHOTS, readLatestSnapshot, writeSnapshot} from './snapshot-store'
import type {StatsSnapshot} from './types'
import {live, unavailable} from './types'

let db: TestDb

beforeEach(async () => {
  db = await resetTestDb()
})

const snapshotAt = (generatedAt: string): StatsSnapshot => ({
  generatedAt,
  questionsAnswered: live({total: 1, thisWeek: 1}, 'postgres:answer'),
  platformBreakdown: live({web: 1, ios: 0, android: 0, unattributed: 0, total: 1}, 'x'),
  trend: live({week: [], month: [], year: []}, 'x'),
  activeDevices: live({total: 1, last30Days: 1}, 'x'),
  decksPlayed: live({total: 1}, 'x'),
  languages: live({spoken: 1, ofTotal: 10}, 'x'),
  countries: live([], 'x'),
  installsIos: unavailable('app-store-connect', 'nope'),
  installsAndroid: unavailable('google-play'),
  dataSince: live({date: '2026-01-01'}, 'x'),
})

describe('snapshot store', () => {
  it('reads nothing from an empty table', async () => {
    expect(await readLatestSnapshot(db)).toBeUndefined()
  })

  it('round-trips the snapshot and returns the newest one', async () => {
    await writeSnapshot(db, snapshotAt('2026-01-01T00:00:00.000Z'))
    await writeSnapshot(db, snapshotAt('2026-01-01T01:00:00.000Z'))
    expect(await readLatestSnapshot(db)).toEqual(snapshotAt('2026-01-01T01:00:00.000Z'))
  })

  it('keeps only the newest KEEP_SNAPSHOTS rows', async () => {
    for (let i = 0; i < KEEP_SNAPSHOTS + 3; i++) {
      await writeSnapshot(db, snapshotAt(`2026-01-01T${String(i).padStart(2, '0')}:00:00.000Z`))
    }
    const rows = await db.query.statsSnapshot.findMany()
    expect(rows).toHaveLength(KEEP_SNAPSHOTS)
    expect(await readLatestSnapshot(db)).toEqual(snapshotAt('2026-01-01T26:00:00.000Z'))
  })
})
