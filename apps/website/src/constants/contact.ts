/** The `?about=` values of /contact (issue #455), in the dropdown's order. */
export const CONTACT_ABOUT_KEYS = [
  'general',
  'app-feedback',
  'android-test',
  'cards',
  'events',
] as const

export type ContactAbout = (typeof CONTACT_ABOUT_KEYS)[number]

/** What each About value reads as, in the form and the email. */
export const CONTACT_ABOUT: Record<ContactAbout, string> = {
  general: 'General',
  'app-feedback': 'App feedback',
  'android-test': 'Android test',
  cards: 'Cards / orders',
  events: 'Events',
}

const isContactAbout = (value: string): value is ContactAbout => value in CONTACT_ABOUT

/** The `?about=` value, or General for anything unknown. */
export const contactAboutFrom = (value: string | null | undefined): ContactAbout =>
  value && isContactAbout(value) ? value : 'general'

/** A platform the app reports with its feedback link, or undefined for anything else. */
export const contactPlatformFrom = (value: string | null | undefined) =>
  value === 'ios' || value === 'android' ? value : undefined

/** An x.y.z app version, or undefined for anything else. */
export const contactVersionFrom = (value: string | null | undefined) =>
  value && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value) ? value : undefined
