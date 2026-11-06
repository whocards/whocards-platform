import type {Config} from '@netlify/functions'

// Only the schedule lives here; the work is in /api/stats/refresh so it shares the site's env and DB.
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
