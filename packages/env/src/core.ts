import {z} from 'zod'

export const coreSchema = {
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
}

// Lives here, not in db.ts, so composing it doesn't run db.ts's eager validation.
export const dbSchema = {
  DB_URL: z.string().min(1),
}
