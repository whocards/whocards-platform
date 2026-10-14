import {gamePlayer, gameResponse, gameRound, hostedGame} from '@whocards/game/db'
import {eq, inArray, sql} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'

/** Promised on the player privacy screen: answers and recap emails go 90 days after the workshop. */
export const RETENTION_DAYS = 90

export type ExpiredGame = {
  id: string
  code: string
  title: string
  lastActivity: Date
  responses: number
  emails: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Games whose last activity is past retention and that still hold responses or emails. */
export const findExpiredGames = async <
  T extends PgQueryResultHKT,
  S extends Record<string, unknown>,
>(
  db: PgDatabase<T, S>,
  now: Date
): Promise<ExpiredGame[]> => {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS)
  // Status is ignored on purpose: a game the host never ended still has to expire.
  const lastActivity = sql`greatest(${hostedGame.createdAt}, max(${gameRound.startedAt}), max(${gameRound.endsAt}))`
  const rows = await db
    .select({
      id: hostedGame.id,
      code: hostedGame.code,
      title: hostedGame.title,
      lastActivity: lastActivity.mapWith((value: string | Date) => new Date(value)),
      responses:
        sql`(select count(*) from ${gameResponse} join ${gamePlayer} on ${gamePlayer.id} = ${gameResponse.playerId} where ${gamePlayer.gameId} = ${hostedGame.id})`.mapWith(
          Number
        ),
      emails:
        sql`(select count(*) from ${gamePlayer} where ${gamePlayer.gameId} = ${hostedGame.id} and ${gamePlayer.email} is not null)`.mapWith(
          Number
        ),
    })
    .from(hostedGame)
    .leftJoin(gameRound, eq(gameRound.gameId, hostedGame.id))
    .groupBy(hostedGame.id)
    .having(sql`${lastActivity} < ${cutoff.toISOString()}::timestamptz`)
    .orderBy(hostedGame.createdAt)
  return rows.filter((row) => row.responses > 0 || row.emails > 0)
}

/** Deletes every response and clears every player email in the given games. */
export const purgeGames = async <T extends PgQueryResultHKT, S extends Record<string, unknown>>(
  db: PgDatabase<T, S>,
  gameIds: string[]
): Promise<void> => {
  if (gameIds.length === 0) return
  await db.transaction(async (tx) => {
    const players = tx
      .select({id: gamePlayer.id})
      .from(gamePlayer)
      .where(inArray(gamePlayer.gameId, gameIds))
    await tx.delete(gameResponse).where(inArray(gameResponse.playerId, players))
    await tx.update(gamePlayer).set({email: null}).where(inArray(gamePlayer.gameId, gameIds))
  })
}
