import {z} from 'zod'

export const coreSchema = {
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
}
