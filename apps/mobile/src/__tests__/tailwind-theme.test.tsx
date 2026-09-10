/**
 * The design-token → Tailwind → NativeWind pipeline, asserted end to end.
 *
 * Every screen in this app is styled with `className`, and nothing else in CI
 * runs Metro or a simulator — so if the Tailwind theme stopped being built from
 * @whocards/tokens, or NativeWind stopped resolving classes altogether, every
 * other test here would still pass and the app would ship unstyled. This file
 * is the guard: `jest.global-setup.js` compiles the real `src/global.css`
 * through the same PostCSS/Tailwind + react-native-css pipeline Metro uses, and
 * the cases below render each token's utility class and read the resolved style
 * back.
 *
 * The case tables are checked for completeness against the token objects
 * themselves, so adding a token to @whocards/tokens fails this file until the
 * token is covered. The class names must stay written out in full: Tailwind
 * only emits a utility it has seen literally in a scanned source file, and
 * `src/**` (this file included) is what `global.css` scans.
 */
import React from 'react'
import {Text, View} from 'react-native'
import {act, render, screen} from '@testing-library/react-native'
import {colors, fonts, radius, spacing} from '@whocards/tokens'

import {resolvedStyle, rem, withOpacity} from '@/test-utils/resolved-style'
import {setColorScheme} from '@/lib/color-scheme'

const styleFor = (className: string) => {
  render(<View testID="subject" className={className} />)
  return resolvedStyle(screen.getByTestId('subject'))
}

/** Every `--color-*` the theme should expose, as `[utility, token value]`. */
const COLOR_CASES: [className: string, expected: string][] = [
  ['bg-yellow-100', colors.yellow[100]],
  ['bg-yellow-300', colors.yellow[300]],
  ['bg-yellow-400', colors.yellow[400]],
  ['bg-yellow-500', colors.yellow[500]],
  ['bg-gray', colors.gray.DEFAULT],
  ['bg-gray-lighter', colors.gray.lighter],
  ['bg-gray-light', colors.gray.light],
  ['bg-gray-dark', colors.gray.dark],
  ['bg-primary-light', colors.primary.light],
  ['bg-primary-dark', colors.primary.dark],
  ['bg-dark', colors.dark],
  ['bg-darker', colors.darker],
  ['bg-darkest', colors.darkest],
  ['bg-background', colors.background],
  ['bg-white', colors.white],
  ['bg-red', colors.red],
  ['bg-canvasLight', colors.canvasLight],
  ['bg-mutedOnLight', colors.mutedOnLight],
  ['bg-accentOnLight', colors.accentOnLight],
  ['bg-errorOnLight', colors.errorOnLight],
  ['bg-accentOnDark', colors.accentOnDark],
  ['bg-errorOnDark', colors.errorOnDark],
]

describe('Tailwind theme — colours', () => {
  it.each(COLOR_CASES)('%s resolves to the token value', (className, expected) => {
    expect(styleFor(className).backgroundColor).toBe(expected)
  })

  it('covers every colour token — a new token must be added above', () => {
    const covered = new Set(COLOR_CASES.map(([className]) => className))
    const expected = Object.entries(colors).flatMap(([name, value]) =>
      typeof value === 'string'
        ? [`bg-${name}`]
        : Object.keys(value).map((shade) =>
            shade === 'DEFAULT' ? `bg-${name}` : `bg-${name}-${shade}`
          )
    )
    expect([...covered].toSorted()).toEqual([...new Set(expected)].toSorted())
  })
})

/** The custom spacing/radius steps, in the px their `rem` values compile to. */
const SPACING_CASES: [className: string, expected: number][] = [
  ['p-4.5', rem(spacing['4.5'])],
  ['p-7.5', rem(spacing['7.5'])],
]

describe('Tailwind theme — spacing and radius', () => {
  it.each(SPACING_CASES)('%s resolves to the token value in px', (className, expected) => {
    expect(styleFor(className).padding).toBe(expected)
  })

  it('covers every custom spacing step', () => {
    expect(SPACING_CASES.map(([className]) => className)).toEqual(
      Object.keys(spacing).map((name) => `p-${name}`)
    )
  })

  it('rounded-2.5xl resolves to the token value in px', () => {
    expect(styleFor('rounded-2.5xl').borderRadius).toBe(rem(radius['2.5xl']))
  })

  it('covers every custom radius step', () => {
    expect(Object.keys(radius)).toEqual(['2.5xl'])
  })
})

/**
 * `font-*` maps to the *registered* face, not the whole CSS stack: the tokens
 * carry a web fallback list, and react-native-css takes the first family from
 * it — which is the name `expo-font` loads the file under.
 */
const FONT_CASES: [className: string, expected: string][] = [
  ['font-sans', fonts.sans.family],
  ['font-title', fonts.title.family],
  ['font-chinese', fonts.chinese.family],
  ['font-hebrew', fonts.hebrew.family],
  ['font-japanese', fonts.japanese.family],
]

describe('Tailwind theme — fonts', () => {
  it.each(FONT_CASES)('%s resolves to the registered family', (className, expected) => {
    render(<Text className={className}>{className}</Text>)
    expect(resolvedStyle(screen.getByText(className)).fontFamily).toBe(expected)
  })

  it('covers every font token', () => {
    expect(FONT_CASES.map(([className]) => className)).toEqual(
      Object.keys(fonts).map((name) => `font-${name}`)
    )
  })

  it('keeps golos-text as the default sans face, beating nativewind/theme’s System', () => {
    // nativewind/theme ships an unlayered `@media ios { :root { --font-sans: System } }`,
    // which outranks anything in a cascade layer — including our @theme block.
    // src/global.css re-declares --font-sans after that import to win it back;
    // this is the assertion that the ordering still holds.
    expect(styleFor('font-sans').fontFamily).toBe(fonts.sans.family)
  })
})

/**
 * Line height — the one silently breaking change in the NativeWind v5 upgrade.
 *
 * v4 emitted `leading-<n>` as a `rem` length (`leading-8` = 2rem = 28px). v5's
 * `nativewind/theme` overrides the utility to a *unitless* value, which
 * react-native-css multiplies by the element's own font size — so the same
 * `leading-8` is now 2em, which is 35px at `text-xl`. Nothing throws when that
 * changes; the text just gets taller. These are the cases that would catch it.
 *
 * The migration recipe is "divide the old value by the font size": v4's
 * `text-xl leading-8` is 2rem ÷ 1.25rem = 1.6em, and each v5 step is 0.25em, so
 * the exact equivalent would be `leading-6.4` — which the override can't
 * express (it takes integers only). Nor can an arbitrary value: `leading-[…]`
 * does fall through to Tailwind's built-in utility and compiles fine, but
 * react-native-css accepts only a plain number for lineHeight, so
 * `leading-[1.6]`, `leading-[1.6em]`, `leading-[2rem]` and `leading-[28px]` all
 * resolve to no lineHeight at all (measured). `leading-6` (1.5em = 26.25px) is
 * the nearest step, and what src/app/index.tsx's tagline now uses — 1.75px
 * tighter than v4's 28px, and the migration's one accepted visual change.
 */
const renderClass = (className: string) => {
  render(<Text testID="line" className={className} />)
  return screen.getByTestId('line')
}

const lineHeightOf = (className: string) => resolvedStyle(renderClass(className)).lineHeight

describe('Tailwind theme — line height', () => {
  it('gives each text size its own line height, in px', () => {
    // Each `text-*` carries a line height distinct from its font size, and the
    // two are asserted together so neither reading can be mistaken for the
    // other: text-sm is 0.875rem/1.25rem, text-xl is 1.25rem/1.75rem.
    //
    // v4 emitted those line heights as rem lengths; v5 emits Tailwind's
    // `calc(<line-height> / <font-size>)` em ratio instead — 1.4em for text-xl
    // — which lands on the same pixel value by construction, for any font size
    // expressed in rem. That equality is the thing worth pinning: it is why
    // `text-sm`'s default is exactly what v4's `text-sm leading-5` pinned, and
    // so why theme-settings-page.tsx could drop that class outright rather than
    // restate it as a ratio.
    expect(resolvedStyle(renderClass('text-sm'))).toMatchObject({
      fontSize: rem('0.875rem'),
      lineHeight: rem('1.25rem'),
    })
    expect(resolvedStyle(renderClass('text-xl'))).toMatchObject({
      fontSize: rem('1.25rem'),
      lineHeight: rem('1.75rem'),
    })
  })

  it('parses a leading-* step as 0.25em, not 0.25rem', () => {
    // Against text-xl's 1.25rem (17.5px) font size.
    expect(lineHeightOf('text-xl leading-6')).toBe(1.5 * rem('1.25rem'))
    expect(lineHeightOf('text-xl leading-8')).toBe(2 * rem('1.25rem'))
  })
})

describe('Tailwind theme — modifiers', () => {
  it('applies the /NN opacity modifier to a token colour', () => {
    expect(styleFor('bg-primary-dark/25').backgroundColor).toBe(
      withOpacity(colors.primary.dark, 25)
    )
    expect(styleFor('bg-white/70').backgroundColor).toBe(withOpacity(colors.white, 70))
  })

  it('switches on `dark:` with the app’s colour-scheme setting', () => {
    act(() => setColorScheme('light'))
    expect(styleFor('bg-canvasLight dark:bg-darkest').backgroundColor).toBe(colors.canvasLight)

    act(() => setColorScheme('dark'))
    expect(styleFor('bg-canvasLight dark:bg-darkest').backgroundColor).toBe(colors.darkest)
  })
})
