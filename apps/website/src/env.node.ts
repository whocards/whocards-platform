import '@whocards/env/load'
import {netlifySiteUrl} from '@whocards/env/netlify'

// Not `~env`: astro.config.ts runs before Vite, and `~env` validates every server var on import.
export const SITE_URL = netlifySiteUrl(process.env, 'http://localhost:4321')

if (!SITE_URL) {
  throw new Error('env vars messed up: SITE_URL resolved empty on Netlify')
}
