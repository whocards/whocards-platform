// Pure constants and helpers for email consent — no DB or env imports so this
// stays unit-testable without any side effects at module load time.

export const CONSENT_TYPES = ['app_launch', 'newsletter', 'translator'] as const
export type ConsentType = (typeof CONSENT_TYPES)[number]

// Maps a ConsentType to the canonical Resend Segment name (#120); translators have none (#391).
export const CONSENT_TYPE_TO_SEGMENT = {
  newsletter: 'newsletter',
  app_launch: 'app-waitlist',
} as const satisfies Partial<Record<ConsentType, string>>

export const isConsentType = (v: string): v is ConsentType =>
  (CONSENT_TYPES as readonly string[]).includes(v)

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

// Canonical consent_source values written by the app routes.
export const CONSENT_SOURCE = {
  appPage: 'app_page',
  footer: 'footer',
  translatePrompt: 'translate_prompt',
} as const

// Consent types that wait on a double opt-in link before they count (#360, #391).
export const CONFIRMABLE_CONSENT_TYPES = [
  'newsletter',
  'translator',
] as const satisfies readonly ConsentType[]
export type ConfirmableConsentType = (typeof CONFIRMABLE_CONSENT_TYPES)[number]
