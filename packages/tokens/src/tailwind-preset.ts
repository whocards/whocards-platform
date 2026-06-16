import {colors} from './colors'
import {gradients} from './gradients'
import {radius, spacing} from './spacing'
import {fonts} from './typography'

/**
 * Tailwind `theme.extend` shaped from the tokens. Consumed by mobile's NativeWind
 * config and available to regenerate the web's `@theme` block, so utility classes
 * (`bg-yellow-400`, `text-primary-light`, `rounded-2.5xl`, `font-title`, …) resolve
 * the same on every surface.
 */
export const tailwindTheme = {
  extend: {
    colors,
    spacing,
    borderRadius: radius,
    fontFamily: {
      sans: [...fonts.sans.stack],
      title: [...fonts.title.stack],
      chinese: [...fonts.chinese.stack],
      hebrew: [...fonts.hebrew.stack],
      japanese: [...fonts.japanese.stack],
    },
    backgroundImage: {
      'gradient-primary': gradients.primary,
    },
  },
} as const

/** A drop-in Tailwind preset: `presets: [tailwindPreset]`. */
export const tailwindPreset = {theme: tailwindTheme} as const

export type TailwindPreset = typeof tailwindPreset
