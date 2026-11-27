/**
 * Tests for src/components/question-text.tsx
 *
 * Covers Tabletop mode (issue #148, a Display setting): with `mirrored`, the
 * Question renders twice — a normal bottom half and a 180°-rotated top half —
 * and the rotated copy must be hidden from the accessibility tree so a screen
 * reader announces the Question once, not twice; with a second language each
 * side shows one language (issue #366). Also covers the `fitFontSize`
 * `minFont` override that gives the mirrored halves a lower font floor, and
 * `fitSecondaryFontSize`'s headroom growth (issue #189).
 */
import React from 'react'
import {act, render, screen} from '@testing-library/react-native'
import {colors} from '@whocards/tokens'

import {setColorScheme} from '@/lib/color-scheme'
import {resolvedStyle} from '@/test-utils/resolved-style'
import {
  MIRROR_GAP,
  QuestionText,
  fitFontSize,
  fitSecondaryFontSize,
} from '../components/question-text'

describe('fitFontSize — minFont override', () => {
  it('defaults to a 22px floor when the box cannot be computed from', () => {
    expect(fitFontSize('Hello', 0, 0)).toBe(22)
  })

  it('honors a lower custom floor — the Tabletop mirrored-half case', () => {
    expect(fitFontSize('Hello', 0, 0, 16)).toBe(16)
  })

  it('never returns below the custom floor even for a very long question', () => {
    const longText =
      'What is the most complicated, layered, and quietly difficult thing you have ever had to explain to someone you love, and did they understand it the way you meant it?'
    const size = fitFontSize(longText, 300, 90, 16)
    expect(size).toBeGreaterThanOrEqual(16)
  })
})

describe('fitSecondaryFontSize — headroom growth (issue #189)', () => {
  it('uses exactly the base 0.5 ratio when the primary is at its floor (no headroom)', () => {
    // primaryFontSize === primaryMinFont → headroom is 0 → the pre-#189 ratio.
    expect(fitSecondaryFontSize(40, 40)).toBe(20)
  })

  it('grows past the base ratio as the primary sizes further above its floor', () => {
    const atFloor = fitSecondaryFontSize(40, 40)
    const midHeadroom = fitSecondaryFontSize(50, 22)
    const moreHeadroom = fitSecondaryFontSize(60, 22)
    expect(midHeadroom).toBeGreaterThan(atFloor)
    expect(moreHeadroom).toBeGreaterThan(midHeadroom)
  })

  it('caps the ratio at 0.65 (base 0.5 + the 0.15 headroom bonus), never more', () => {
    // MAX_FONT (96) → full headroom → ratio 0.65, but SECONDARY_MAX (34) is reached first.
    expect(fitSecondaryFontSize(96, 22)).toBe(34)
  })

  it('caps at SECONDARY_MAX (34) regardless of how large the primary is', () => {
    expect(fitSecondaryFontSize(200, 22)).toBe(34)
  })

  it('floors at SECONDARY_MIN (16)', () => {
    // A primary at the mirrored floor (16) computes 8 on the base ratio; the floor wins.
    expect(fitSecondaryFontSize(16, 16)).toBe(16)
  })
})

type Node = ReturnType<typeof screen.getByText>
const isRotated = (node: Node | null | undefined): boolean =>
  !!node && (JSON.stringify(node.props.style ?? null).includes('180deg') || isRotated(node.parent))

const ancestor = (label: string, match: (s: Record<string, unknown>) => boolean) => {
  for (let node = screen.getByText(label).parent; node; node = node.parent) {
    if (match(resolvedStyle(node))) return node
  }
  throw new Error(`no matching ancestor for ${label}`)
}

describe('QuestionText — Tabletop mode (mirrored, issue #148)', () => {
  const box = {width: 300, height: 400}
  const question = 'What matters to you right now?'

  it('renders the question once when not mirrored', async () => {
    await render(<QuestionText text={question} language="en" box={box} />)
    expect(screen.getAllByText(question)).toHaveLength(1)
  })

  it('renders the question twice in the tree when mirrored — one normal, one rotated', async () => {
    await render(<QuestionText text={question} language="en" box={box} mirrored />)
    // includeHiddenElements: true bypasses RNTL's default accessibility-hidden
    // filter, so this counts both copies regardless of a11y state.
    expect(screen.getAllByText(question, {includeHiddenElements: true})).toHaveLength(2)
  })

  it('hides the rotated copy from the accessibility tree — only one is queryable by default', async () => {
    await render(<QuestionText text={question} language="en" box={box} mirrored />)
    // RNTL's default query excludes accessibilityElementsHidden /
    // importantForAccessibility="no-hide-descendants" subtrees — exactly the
    // marking QuestionText puts on the rotated half. A screen reader hits the
    // same exclusion, so this is the regression guard against announcing the
    // Question twice.
    expect(screen.getAllByText(question)).toHaveLength(1)
  })

  // issue #366: each side reads its own language — near = primary, far (rotated) = secondary
  const secondary = '¿Qué te importa ahora mismo?'
  it('shows only the primary near and only the secondary on the rotated far side', async () => {
    await render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondary}]}
        mirrored
      />
    )
    const primaries = screen.getAllByText(question, {includeHiddenElements: true})
    const secondaries = screen.getAllByText(secondary, {includeHiddenElements: true})
    expect(primaries).toHaveLength(1)
    expect(secondaries).toHaveLength(1)
    expect(isRotated(primaries[0])).toBe(false)
    expect(isRotated(secondaries[0])).toBe(true)
  })

  it('gives both halves the same height, aligned symmetrically to the divider', async () => {
    await render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[
          {language: 'es', text: 'Una pregunta mucho más larga que ocupa varias líneas'},
        ]}
        mirrored
      />
    )
    const halfHeight = (box.height - MIRROR_GAP) / 2
    // The far (rotated) half hangs from the divider…
    const far = 'Una pregunta mucho más larga que ocupa varias líneas'
    expect(resolvedStyle(ancestor(far, (s) => s.height === halfHeight))).toMatchObject({
      height: halfHeight,
    })
    expect(resolvedStyle(ancestor(far, (s) => s.position === 'absolute'))).toMatchObject({
      bottom: 0,
    })
    // …and the near primary starts right below it: its lead spacer spans the far half and the gap.
    const near = ancestor(question, (s) => s.height === box.height)
    const lead = near.children[0]
    expect(typeof lead === 'string' ? {} : resolvedStyle(lead)).toMatchObject({
      height: halfHeight + MIRROR_GAP,
      flexGrow: 0,
    })
  })

  it('keeps the rotated second language readable by a screen reader', async () => {
    await render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondary}]}
        mirrored
      />
    )
    // the far side is no longer a duplicate, so hiding it would drop the second language
    expect(screen.getByText(question)).toBeTruthy()
    expect(screen.getByText(secondary)).toBeTruthy()
  })

  it('falls back to the primary on both sides when the secondary has no translation', async () => {
    await render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: ''}]}
        mirrored
      />
    )
    expect(screen.getAllByText(question, {includeHiddenElements: true})).toHaveLength(2)
    expect(screen.getAllByText(question)).toHaveLength(1)
  })

  it('stacks both languages when not mirrored', async () => {
    await render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondary}]}
      />
    )
    expect(screen.getAllByText(question)).toHaveLength(1)
    expect(screen.getAllByText(secondary)).toHaveLength(1)
  })
})

// These read the *resolved* colour rather than the `className` string: under
// NativeWind v5 the class is compiled away before it reaches the element, so
// asserting on the prop would pass even with the style pipeline dead. Going
// through the token values checks the whole chain — class → theme → token.
const textColor = (text: string) => resolvedStyle(screen.getByText(text)).color

describe('QuestionText — themedText (issue #173, final)', () => {
  const box = {width: 300, height: 400}
  const question = 'What matters to you right now?'
  const secondaryText = '¿Qué te importa ahora mismo?'

  it('defaults to hardcoded white — card surfaces (Pick a Card) omit themedText', async () => {
    await render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondaryText}]}
      />
    )
    expect(textColor(question)).toBe(colors.white)
    expect(textColor(secondaryText)).toBe(colors.white)
  })

  it('stays white on a card surface even in light mode — the card is always dark', async () => {
    await act(() => setColorScheme('light'))
    await render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondaryText}]}
      />
    )
    expect(textColor(question)).toBe(colors.white)
    expect(textColor(secondaryText)).toBe(colors.white)
  })

  it('follows the theme when themedText is set — classic play on the themed canvas', async () => {
    await act(() => setColorScheme('light'))
    await render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondaryText}]}
        themedText
      />
    )
    expect(textColor(question)).toBe(colors.darker)
    expect(textColor(secondaryText)).toBe(colors.darker)
  })

  it('flips to white when themedText meets the dark scheme', async () => {
    await act(() => setColorScheme('dark'))
    await render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondaryText}]}
        themedText
      />
    )
    expect(textColor(question)).toBe(colors.white)
    expect(textColor(secondaryText)).toBe(colors.white)
  })

  it('threads themedText through both mirrored (Tabletop) halves', async () => {
    await act(() => setColorScheme('light'))
    await render(<QuestionText text={question} language="en" box={box} mirrored themedText />)
    for (const node of screen.getAllByText(question, {includeHiddenElements: true})) {
      expect(resolvedStyle(node).color).toBe(colors.darker)
    }
  })
})

describe('QuestionText — unified 50/50 split sizing', () => {
  const box = {width: 300, height: 400}

  it('fits each language independently in its own equal half', async () => {
    const shortSecondary = 'Hola'
    const longSecondary =
      'Una pregunta mucho más larga y detallada que ocupa varias líneas en la mitad inferior'
    const shortRender = await render(
      <QuestionText
        text="What matters most?"
        language="en"
        box={box}
        secondaries={[{language: 'es', text: shortSecondary}]}
      />
    )
    const shortSize = Number(resolvedStyle(shortRender.getByText(shortSecondary)).fontSize)

    const longRender = await render(
      <QuestionText
        text="What matters most?"
        language="en"
        box={box}
        secondaries={[{language: 'es', text: longSecondary}]}
      />
    )
    const longSize = Number(resolvedStyle(longRender.getByText(longSecondary)).fontSize)

    expect(shortSize).toBeGreaterThan(longSize)
  })
})
