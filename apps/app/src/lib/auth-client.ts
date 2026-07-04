import {magicLinkClient, organizationClient} from 'better-auth/client/plugins'
import {createAuthClient} from 'better-auth/react'

/** Browser-side auth client. Same-origin, so no explicit baseURL needed. */
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), organizationClient()],
})
