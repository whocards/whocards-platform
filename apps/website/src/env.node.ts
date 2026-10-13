import '@whocards/env/load'
import {netlifySiteUrl} from '@whocards/env/netlify'

/**
 * Env for `astro.config.ts`, where Vite hasn't started so `import.meta.env` isn't
 * populated. `~env` can't be reused here: it validates every required server var on import.
 */
export const SITE_URL = netlifySiteUrl(process.env, 'http://localhost:4321')

if (!SITE_URL) {
  throw new Error('env vars messed up: SITE_URL resolved empty on Netlify')
}
