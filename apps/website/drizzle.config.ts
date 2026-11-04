import type {Config} from 'drizzle-kit'
import '@whocards/env/load'
import {dbEnv} from '@whocards/env/db'

const config: Config = {
  // both apps share one database, so push must see every table or it drops the other app's
  schema: ['./src/server/db/schema.ts', '../app/src/server/db/schema.ts'],
  dialect: 'postgresql',
  verbose: true,
  dbCredentials: {
    url: dbEnv.DB_URL,
  },
}

export default config
