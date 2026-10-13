import {createEnv} from '@t3-oss/env-core'

import {dbSchema} from './core'

/** For tooling (drizzle-kit) that needs the database and nothing else. */
export const dbEnv = createEnv({
  server: dbSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
