/**
 * WhoCards colour primitives — the single source of truth shared by the web
 * (Tailwind v4 `@theme`) and mobile (NativeWind) surfaces.
 *
 * Names mirror the Tailwind class names the apps already use (`bg-yellow-400`,
 * `text-darker`, `bg-gray`, `text-primary-light`, `from-primary-light`, …), so
 * the same utility classes resolve identically on both platforms.
 */
export const colors = {
  yellow: {
    100: '#7e7552',
    300: '#ffe37e',
    400: '#f9d75f',
    500: '#f6c944',
  },
  gray: {
    DEFAULT: '#65636e',
    lighter: '#dcdee9',
    light: '#474a69',
    dark: '#9698af',
  },
  primary: {
    light: '#f9d75f',
    dark: '#c058d2',
  },
  dark: '#262432',
  darker: '#111516',
  darkest: '#08001a',
  background: '#0d051f',
  white: '#f5f5f5',
  red: '#ee1e23',

  // --- Light mode (issue #163) ---
  // New, separately-named tokens only — every existing token above keeps its
  // current value and call sites unchanged (see docs/design/163-light-mode/proposal.md
  // "Naming — what actually shipped"). Card faces (Classic play, Pick a Card) never
  // read these — they stay dark in both themes. These cover the Library screen
  // canvas and the Language/Game/Share/Display sheet surfaces only.
  canvasLight: '#f6f2fb',
  // Deepened variants for text/accents that only ever sat on a dark canvas or a
  // small icon before now — the flat tokens don't reliably clear WCAG AA once
  // they're legible-text-sized on the new light surfaces (see the proposal's
  // contrast check).
  mutedOnLight: '#6b6d82',
  accentOnLight: '#9a3aac',
  errorOnLight: '#c9151a',
  // Lightened variants for the same reason, in the other direction: violet/red
  // text never sat on a dark *sheet* surface before (the sheets were always
  // white) — `dark` (#262432) is lighter than the canvases those tokens were
  // tuned against, so they need a lift to clear AA there too.
  accentOnDark: '#d485e2',
  errorOnDark: '#ff5b5f',
} as const

export type Colors = typeof colors
