/**
 * Font tokens. `family` is the primary registered face (what React Native loads
 * and references directly); `stack` is the full CSS fallback list the web uses.
 */
const EMOJI_FALLBACK = [
  'ui-sans-serif',
  'system-ui',
  'sans-serif',
  "'Apple Color Emoji'",
  "'Segoe UI Emoji'",
  "'Segoe UI Symbol'",
  "'Noto Color Emoji'",
] as const

const withFallback = (family: string): readonly string[] => [family, ...EMOJI_FALLBACK]

export const fonts = {
  sans: {family: 'golos-text', stack: withFallback('golos-text')},
  title: {family: 'aptly', stack: withFallback('aptly')},
  chinese: {family: 'noto-sans-chinese', stack: withFallback('noto-sans-chinese')},
  hebrew: {family: 'noto-sans-hebrew', stack: withFallback('noto-sans-hebrew')},
  japanese: {family: 'noto-sans-japanese', stack: withFallback('noto-sans-japanese')},
} as const

export type Fonts = typeof fonts
export type FontKey = keyof Fonts
