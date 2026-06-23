import {colors} from '@whocards/tokens'

/** Email-safe translations of shared tokens. Custom web fonts and gradients are avoided. */
export const emailBrand = {
  colors: {
    background: colors.background,
    card: colors.dark,
    cardMuted: colors.gray.light,
    ink: colors.white,
    inkMuted: colors.gray.lighter,
    accent: colors.yellow[400],
    accentInk: colors.darker,
    secondaryAccent: colors.primary.dark,
  },
  fonts: {
    sans: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
    title: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
  },
} as const
