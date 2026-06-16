import dotenv from 'dotenv'
import type {Config} from 'drizzle-kit'
dotenv.config()

const config: Config = {
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  verbose: true,
  dbCredentials: {
    url: process.env.DB_URL!,
  },
}

export default config
