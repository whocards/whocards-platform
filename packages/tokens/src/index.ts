export * from './colors'
export * from './spacing'
export * from './typography'
export * from './gradients'

import {colors} from './colors'
import {gradients} from './gradients'
import {radius, spacing} from './spacing'
import {fonts} from './typography'

/** Every WhoCards design token, grouped. The single source of truth for both apps. */
export const tokens = {colors, spacing, radius, fonts, gradients} as const

export type Tokens = typeof tokens
