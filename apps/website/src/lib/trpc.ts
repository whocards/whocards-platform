import type {AppRouter} from '@whocards/api'
import {createTRPCClient, httpBatchLink} from '@trpc/client'

/**
 * End-to-end typed client for the shared @whocards/api router (ADR-0002),
 * mirroring apps/mobile/src/lib/trpc.ts. The web Play island runs same-origin
 * with the Astro tRPC mount, so it always posts to the relative `/api/trpc`.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({url: '/api/trpc'})],
})
