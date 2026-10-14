#!/usr/bin/env tsx
// Deletes game answers and player emails 90 days after the workshop (#317). Dry-run unless --apply.
//   pnpm --filter website game:retention
//   pnpm --filter website game:retention -- --apply

import {dbEnv} from '@whocards/env/db'
import {drizzle} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {findExpiredGames, purgeGames, RETENTION_DAYS} from '../src/server/game/retention'

const apply = process.argv.includes('--apply')
const client = postgres(dbEnv.DB_URL)
const db = drizzle(client)

async function main() {
  const games = await findExpiredGames(db, new Date())
  console.log(
    `[game-retention] ${apply ? 'APPLY' : 'DRY-RUN (pass --apply to delete)'}: ${games.length} game(s) past ${RETENTION_DAYS} days`
  )
  for (const game of games) {
    console.log(
      `  ${game.code}  ${game.lastActivity.toISOString().slice(0, 10)}  responses=${game.responses} emails=${game.emails}  ${game.title}`
    )
  }
  if (apply) {
    await purgeGames(
      db,
      games.map((game) => game.id)
    )
    console.log('[game-retention] Deleted.')
  }
}

try {
  await main()
} catch (error: unknown) {
  console.error(
    '[game-retention] Failed:',
    error instanceof Error ? error.message : 'unknown error'
  )
  process.exitCode = 1
} finally {
  await client.end()
}
