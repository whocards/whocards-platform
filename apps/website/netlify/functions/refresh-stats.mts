import type {Config} from '@netlify/functions'

// Hourly: ask the site to rebuild its /stats snapshot. The work itself lives in the
// Astro route so it shares the app's env validation and DB client; this function only
// holds the schedule. `URL` is the production origin Netlify injects at runtime.
export default async () => {
  const secret = process.env.STATS_REFRESH_SECRET
  if (!secret) {
    console.warn('refresh-stats: STATS_REFRESH_SECRET is not set, skipping')
    return
  }
  const response = await fetch(`${process.env.URL}/api/stats/refresh`, {
    method: 'POST',
    headers: {authorization: `Bearer ${secret}`},
  })
  if (!response.ok) throw new Error(`refresh-stats: ${response.status} ${await response.text()}`)
  console.log('refresh-stats:', await response.text())
}

export const config: Config = {schedule: '@hourly'}
