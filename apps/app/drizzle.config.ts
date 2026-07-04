import type {Config} from 'drizzle-kit'

import {env} from './src/server/env'

const config: Config = {
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  verbose: true,
  dbCredentials: {
    url: env.DB_URL,
  },
}

export default config
