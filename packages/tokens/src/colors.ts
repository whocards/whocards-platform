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
} as const

export type Colors = typeof colors
