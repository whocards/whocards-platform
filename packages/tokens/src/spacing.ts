/** Custom spacing steps beyond Tailwind's default scale (rem units). */
export const spacing = {
  '4.5': '1.125rem',
  '7.5': '1.875rem',
} as const

/** Custom border-radius steps beyond Tailwind's default scale. */
export const radius = {
  '2.5xl': '1.25rem',
} as const

export type Spacing = typeof spacing
export type Radius = typeof radius
