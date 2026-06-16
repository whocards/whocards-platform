import {describe, expect, it} from 'vitest'

import {colors, fonts, gradients, radius, spacing, tokens} from './index'
import {tailwindTheme} from './tailwind-preset'

describe('colors', () => {
  it('exposes the brand yellows', () => {
    expect(colors.yellow[400]).toBe('#f9d75f')
    expect(colors.yellow[500]).toBe('#f6c944')
  })

  it('keeps primary.light aligned with yellow-400', () => {
    expect(colors.primary.light).toBe(colors.yellow[400])
  })
})

describe('fonts', () => {
  it('leads each stack with its primary family', () => {
    for (const key of Object.keys(fonts) as (keyof typeof fonts)[]) {
      expect(fonts[key].stack[0]).toBe(fonts[key].family)
    }
  })
})

describe('gradients', () => {
  it('derives the primary gradient from the primary colours', () => {
    expect(gradients.primary).toContain(colors.primary.dark)
    expect(gradients.primary).toContain(colors.primary.light)
  })
})

describe('aggregate + tailwind preset', () => {
  it('groups every token family', () => {
    expect(tokens).toMatchObject({colors, spacing, radius, fonts, gradients})
  })

  it('shapes a tailwind theme.extend that mirrors the tokens', () => {
    expect(tailwindTheme.extend.colors).toBe(colors)
    expect(tailwindTheme.extend.borderRadius).toBe(radius)
    expect(tailwindTheme.extend.spacing).toBe(spacing)
    expect(tailwindTheme.extend.fontFamily.title[0]).toBe('aptly')
    expect(tailwindTheme.extend.backgroundImage['gradient-primary']).toBe(gradients.primary)
  })
})
