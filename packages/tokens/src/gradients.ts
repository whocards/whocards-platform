import {colors} from './colors'

/** Named gradients used across the brand (web `bg-gradient-primary`, etc.). */
export const gradients = {
  primary: `linear-gradient(to bottom left, ${colors.primary.dark} 25%, ${colors.primary.light} 92%)`,
} as const

export type Gradients = typeof gradients
