import {drizzleAdapter} from '@better-auth/drizzle-adapter'
import {betterAuth} from 'better-auth'
import {magicLink, organization} from 'better-auth/plugins'
import {MagicLinkEmail, magicLinkSubject, magicLinkText} from '@whocards/emails'
import {sendEmail} from '@whocards/emails/resend'

import {db, schema} from '../db'
import {env} from '../env'
import {MAGIC_LINK_DISABLE_SIGNUP} from './magic-link-policy'
import {roles} from './permissions'

const googleProvider =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET}
    : undefined

// The Drizzle adapter looks up each model by the STRING key it's configured
// with below (e.g. `app_verification`, matching `verification: {modelName:
// 'app_verification'}`) — it indexes into this object by that exact string, not
// by matching our camelCase schema.ts export names. So this is an explicit,
// intentional map from adapter model-name -> our actual (camelCase) table
// export, not just `schema` re-exported verbatim.
const adapterSchema = {
  app_user: schema.appUser,
  app_session: schema.appSession,
  app_account: schema.appAccount,
  app_verification: schema.appVerification,
  app_organization: schema.appOrganization,
  app_member: schema.appMember,
  app_invitation: schema.appInvitation,
}

// The Netlify site's BETTER_AUTH_URL is still the old *.netlify.app subdomain,
// but the app is served at app.whocards.cc. baseURL builds the magic-link email
// URL and validates the browser's callbackURL/cookie origin — so in production
// it MUST be the canonical domain, or the browser sign-in from app.whocards.cc
// is rejected as an untrusted origin (403 INVALID_CALLBACK_URL) and "Couldn't
// send that link" appears. trustedOrigins additionally keeps the raw
// *.netlify.app host working (and localhost in dev).
const canonicalBaseURL =
  env.NODE_ENV === 'production' ? 'https://app.whocards.cc' : env.BETTER_AUTH_URL

export const auth = betterAuth({
  baseURL: canonicalBaseURL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: ['https://app.whocards.cc', 'https://whocards-app.netlify.app'],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: adapterSchema,
    usePlural: false,
  }),
  // No email+password or Google-only-required flow — magic link is the primary
  // (and, tonight, only guaranteed-working) sign-in method. Google is scaffolded
  // and env-gated (see googleAuthEnabled) per the overnight build plan.
  emailAndPassword: {enabled: false},
  ...(googleProvider ? {socialProviders: {google: googleProvider}} : {}),
  user: {modelName: 'app_user'},
  session: {modelName: 'app_session'},
  account: {modelName: 'app_account'},
  verification: {modelName: 'app_verification'},
  plugins: [
    magicLink({
      // Invite-only — see magic-link-policy.ts for exactly why this can't
      // lock out the seeded owner or anyone people.ts's invite already added.
      disableSignUp: MAGIC_LINK_DISABLE_SIGNUP,
      expiresIn: 60 * 15,
      sendMagicLink: async ({email, url}) => {
        // Dev/test verification path (plan requirement): read the link from the
        // server log instead of an inbox. Real send still happens below so prod
        // behaves identically to what we test tonight.
        if (env.NODE_ENV !== 'production') {
          // oxlint-disable-next-line no-console -- deliberate dev-only sign-in log, not an error
          console.log(`[auth] magic link for ${email}: ${url}`)
        }
        await sendEmail({
          apiKey: env.RESEND_API_KEY,
          from: env.RESEND_FROM_EMAIL,
          to: email,
          subject: magicLinkSubject,
          html: <MagicLinkEmail url={url} />,
          text: magicLinkText({url}),
        })
      },
    }),
    organization({
      schema: {
        organization: {modelName: 'app_organization'},
        member: {modelName: 'app_member'},
        invitation: {modelName: 'app_invitation'},
      },
      roles,
      // No self-serve org creation UI tonight — org(s) are provisioned by our own
      // server-side bootstrap (see server/auth/bootstrap.ts), not by end users.
      allowUserToCreateOrganization: false,
    }),
  ],
})
