/**
 * PostHog HogQL query API — used ONLY for the optional country split (the
 * Answer record has no country column; PostHog's `$geoip_country_name` person
 * property is the only first-party-adjacent source for it). Everything else on
 * the stats page comes from Postgres, per the researcher findings ("Postgres
 * `answer` table as the headline source, not PostHog").
 *
 * Setup (documented again in apps/website/.env.example):
 * 1. PostHog → Settings → Project → Project API keys → note the Project ID.
 * 2. PostHog → Settings → Personal → Personal API Keys → create one scoped to
 *    "Query read" only for this project (least privilege — it can read
 *    aggregate event data, nothing else).
 *    `POSTHOG_PERSONAL_API_KEY` = that key.
 *    `POSTHOG_PROJECT_ID` = the numeric project id from step 1.
 *
 * Docs: https://posthog.com/docs/api/queries
 */
import type {MetricResult, NamedCount} from '../types'
import {live, needsCredentials, unavailable} from '../types'

export type PostHogCredentials = {
  personalApiKey: string
  projectId: string
  /** Same PostHog instance the client SDKs post to — see PUBLIC_POSTHOG_HOST. */
  host: string
}

const SOURCE = 'posthog'
const FETCH_TIMEOUT_MS = 10_000

/**
 * Distinct-device counts per country over the last 90 days, via a HogQL
 * aggregate query. Country granularity only (never city/region — privacy
 * constraint from the researcher findings); rows below the privacy threshold
 * are filtered by the caller (see rollups.applyPrivacyThreshold), not here.
 */
export const fetchCountrySplit = async (
  creds: PostHogCredentials | undefined
): Promise<MetricResult<NamedCount[]>> => {
  // Field-by-field completeness is the caller's job (apps/website's
  // `postHogCredentials()` builds this object only when both env vars are
  // set) — checking again here would duplicate that check, so this module
  // only distinguishes "no credentials at all" from "have them."
  if (!creds) {
    return needsCredentials(SOURCE, 'POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID not set')
  }
  // The personal API key goes out as an Authorization header — never send it
  // over a plaintext connection. Enforced again in ~env's schema for
  // PUBLIC_POSTHOG_UI_HOST, but checked here too since this is the module
  // that actually puts the key on the wire.
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
      // A missing/non-array `results` means the response shape isn't what we
      // expect (API change, error payload with a 200, etc.) — that must not
      // become a silent live `[]`, which would render as "no countries" on
      // the page rather than "not connected." A genuine `results: []` (a
      // well-formed but empty result set) IS an array, so it passes this
      // check and stays `live` with an empty value below.
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
