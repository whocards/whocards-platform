import {desc, notInArray, sql} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import type {StatsSnapshot} from './types'
import * as schema from '../db/schema'

type Db<T extends PgQueryResultHKT> = PgDatabase<T, typeof schema>

/** Rows kept after each write: a day of hourly runs, enough to eyeball a bad refresh. */
export const KEEP_SNAPSHOTS = 24

export const readLatestSnapshot = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<StatsSnapshot | undefined> => {
  const [row] = await database
    .select({snapshot: schema.statsSnapshot.snapshot})
    .from(schema.statsSnapshot)
    .orderBy(desc(schema.statsSnapshot.id))
    .limit(1)
  return row?.snapshot
}

/** Inserts the snapshot and prunes everything but the newest KEEP_SNAPSHOTS rows. */
export const writeSnapshot = async <T extends PgQueryResultHKT>(
  database: Db<T>,
  snapshot: StatsSnapshot
): Promise<void> => {
  await database.insert(schema.statsSnapshot).values({snapshot})
  const keep = database
    .select({id: schema.statsSnapshot.id})
    .from(schema.statsSnapshot)
    .orderBy(desc(schema.statsSnapshot.id))
    .limit(KEEP_SNAPSHOTS)
  await database
    .delete(schema.statsSnapshot)
    .where(notInArray(schema.statsSnapshot.id, sql`(${keep})`))
}
