import {z} from 'zod'

// Lives here, not in db.ts, so composing it doesn't run db.ts's eager validation.
export const dbSchema = {
  DB_URL: z.string().min(1),
}
