import type {Config} from 'drizzle-kit'
import {DB_URL} from './src/env.node'

const config: Config = {
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  verbose: true,
  dbCredentials: {
    url: DB_URL,
  },
}

export default config
