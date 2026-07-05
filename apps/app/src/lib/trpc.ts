import type {AppRouter} from '~/server/trpc/root'
import {createTRPCClient, httpBatchLink} from '@trpc/client'

/** End-to-end typed client for this app's own tRPC router, mirroring the
 *  @whocards/api client pattern used by apps/website and apps/mobile. */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({url: '/api/trpc'})],
})
