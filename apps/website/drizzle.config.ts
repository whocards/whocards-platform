import type {Config} from 'drizzle-kit'
import '@whocards/env/load'
import {dbEnv} from '@whocards/env/db'

const config: Config = {
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  verbose: true,
  dbCredentials: {
    url: dbEnv.DB_URL,
  },
}

export default config
