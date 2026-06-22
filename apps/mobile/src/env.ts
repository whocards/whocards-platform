import {z} from 'zod'

/**
 * Validated, type-safe access to the mobile app's `EXPO_PUBLIC_*` configuration.
 *
 * This is the ONE module allowed to read `process.env` on mobile (enforced by the
 * `node/no-process-env` lint rule) so every env read is parsed/typed in one place.
 * Metro statically inlines each `process.env.EXPO_PUBLIC_*` literal at build time,
 * which is why `runtimeEnv` lists them explicitly rather than reading dynamically.
 */
const schema = z.object({
  /** Base URL of the WhoCards tRPC API (apps/website mount). Overrides the dev/prod default. */
  EXPO_PUBLIC_API_URL: z.string().url().optional(),
  /** PostHog project key. Absent → analytics client is not constructed. */
  EXPO_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  /** PostHog ingestion host. Defaults to the EU endpoint (native apps talk to it directly). */
  EXPO_PUBLIC_POSTHOG_HOST: z.string().url().default('https://eu.i.posthog.com'),
  /** Opt in to recording Answer events from a dev build. Release builds always record. */
  EXPO_PUBLIC_RECORD_ANSWERS: z.stringbool().default(false),
  /**
   * Generic debug switch. When on it (a) forces the real transports on in a dev
   * build for emulator/device testing, and (b) tees observability to the console.
   * Replaces the old single-purpose `EXPO_PUBLIC_POSTHOG_DEBUG` flag.
   */
  EXPO_PUBLIC_DEBUG: z.stringbool().default(false),
})

export const env = schema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  EXPO_PUBLIC_RECORD_ANSWERS: process.env.EXPO_PUBLIC_RECORD_ANSWERS,
  EXPO_PUBLIC_DEBUG: process.env.EXPO_PUBLIC_DEBUG,
})
