import {logError} from '@whocards/observability'
import type {Resend} from 'resend'
import {env} from '~env'
import {db} from '~server/db'
import {makeSegmentIdResolver, syncEmailConsents} from '~server/resend-sync'

// Best-effort Resend Contacts/Segments sync (#120): provider failures are recorded in
// provider_sync_error for reconciliation and never fail the caller's request.
export const syncConsentsBestEffort = async (resend: Resend, email: string, caller: string) => {
  try {
    const segmentIdFor = makeSegmentIdResolver(
      env.RESEND_SEGMENT_NEWSLETTER_ID,
      env.RESEND_SEGMENT_APP_WAITLIST_ID
    )
    const resendContacts = {
      create: (payload: Parameters<typeof resend.contacts.create>[0]) =>
        resend.contacts.create(payload),
      get: (options: {email: string}) => resend.contacts.get(options),
      addToSegment: (options: {email: string; segmentId: string}) =>
        resend.contacts.segments.add(options),
    }
    await syncEmailConsents(db, email, {resendContacts, segmentIdFor})
  } catch (syncErr) {
    logError(`${caller}: resend sync threw (non-fatal)`, syncErr)
  }
}
