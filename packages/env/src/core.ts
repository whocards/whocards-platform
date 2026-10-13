import {z} from 'zod'

/** Shared by every app's env; each app composes only the entry points it needs. */
export const coreSchema = {
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
}
