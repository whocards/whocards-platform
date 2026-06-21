import type {AppRouter} from '@whocards/api'
import {createTRPCClient, httpBatchLink} from '@trpc/client'
import Constants from 'expo-constants'

/** Production API host — the deployed site that mounts the tRPC router (ADR-0002 / 0005). */
const PROD_API_URL = 'https://whocards.cc'

/**
 * Base URL of the WhoCards API (the apps/website tRPC mount, ADR-0002).
 * Override with EXPO_PUBLIC_API_URL; a release build with no env falls back to
 * production (never a dev host); in dev it defaults to the LAN host Expo reports,
 * on the website's default Astro port.
 */
const getBaseUrl = (): string => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL
  if (fromEnv) return fromEnv
  if (!__DEV__) return PROD_API_URL
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  return host ? `http://${host}:4321` : 'http://localhost:4321'
}

/** End-to-end typed client for the shared @whocards/api router. */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({url: `${getBaseUrl()}/api/trpc`})],
})
