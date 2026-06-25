// Pure constants and helpers for email consent — no DB or env imports so this
// stays unit-testable without any side effects at module load time.

export const CONSENT_TYPES = ['app_launch', 'newsletter'] as const
export type ConsentType = (typeof CONSENT_TYPES)[number]

// Maps a ConsentType to the canonical Resend Segment name (#120).
export const CONSENT_TYPE_TO_SEGMENT = {
  newsletter: 'newsletter',
  app_launch: 'app-waitlist',
} as const satisfies Record<ConsentType, string>

export const isConsentType = (v: string): v is ConsentType =>
  (CONSENT_TYPES as readonly string[]).includes(v)

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

// Canonical consent_source values written by the app routes.
export const CONSENT_SOURCE = {
  appPage: 'app_page',
} as const
