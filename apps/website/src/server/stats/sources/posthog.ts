/** Country split via PostHog HogQL — the Answer record has no country. Setup: docs/STATS-ENV.md. */
import type {MetricResult, NamedCount} from '../types'
import {live, needsCredentials, unavailable} from '../types'

export type PostHogCredentials = {
  personalApiKey: string
  projectId: string
  host: string
}

const SOURCE = 'posthog'
const FETCH_TIMEOUT_MS = 10_000

export const fetchCountrySplit = async (
  creds: PostHogCredentials | undefined
): Promise<MetricResult<NamedCount[]>> => {
  if (!creds) {
    return needsCredentials(SOURCE, 'POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID not set')
  }
  if (!creds.host.startsWith('https://')) {
    return unavailable(SOURCE, 'PostHog host must use https — refusing to send the API key over it')
  }

  try {
    const query = {
      kind: 'HogQLQuery',
      query: `
        select properties.$geoip_country_name as country, count(distinct person_id) as devices
        from events
        where event = 'question_shown' and timestamp > now() - interval 90 day
          and properties.$geoip_country_name is not null
        group by country
        order by devices desc
        limit 50
      `,
    }
    const response = await fetch(`${creds.host}/api/projects/${creds.projectId}/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.personalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({query}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return unavailable(SOURCE, `PostHog returned ${response.status}`)
    }
    const json: unknown = await response.json()
    const results: unknown =
      typeof json === 'object' && json !== null && 'results' in json ? json.results : undefined
    if (!Array.isArray(results)) {
      return unavailable(SOURCE, 'PostHog response missing a results array')
    }
    const rows: NamedCount[] = results
      .filter(
        (row): row is [string, number] =>
          Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'number'
      )
      .map(([name, count]) => ({name, count}))
    return live(rows, SOURCE)
  } catch (error) {
    return unavailable(SOURCE, error instanceof Error ? error.message : 'unknown error')
  }
}
