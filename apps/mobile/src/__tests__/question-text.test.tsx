/**
 * Tests for src/components/question-text.tsx
 *
 * Covers Tabletop mode (issue #148, a Display setting): with `mirrored`, the
 * Question renders twice — a normal bottom half and a 180°-rotated top half —
 * and the rotated copy must be hidden from the accessibility tree so a screen
 * reader announces the Question once, not twice. Also covers the `fitFontSize`
 * `minFont` override that gives the mirrored halves a lower font floor, and
 * `fitSecondaryFontSize`'s headroom growth (issue #189).
 */
import React from 'react'
import {render, screen} from '@testing-library/react-native'

import {QuestionText, fitFontSize, fitSecondaryFontSize} from '../components/question-text'

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
  // secondaryMin=10 throughout (below every computed value here) so the floor
  // clamp doesn't mask the ratio math being asserted — the floor itself gets
  // its own dedicated test below.

  it('uses exactly the base 0.5 ratio when the primary is at its floor (no headroom)', () => {
    // primaryFontSize === primaryMinFont → headroom is 0 → the pre-#189 ratio,
    // unchanged from before this issue.
    expect(fitSecondaryFontSize(22, 22, 10)).toBe(11)
  })

  it('grows past the base ratio as the primary sizes further above its floor', () => {
    const atFloor = fitSecondaryFontSize(22, 22, 10)
    const midHeadroom = fitSecondaryFontSize(40, 22, 10)
    const moreHeadroom = fitSecondaryFontSize(50, 22, 10)
    // Monotonic: more headroom under the primary's own fit → a bigger secondary,
    // for the same primary floor and secondary floor — never a static bump.
    expect(midHeadroom).toBeGreaterThan(atFloor)
    expect(moreHeadroom).toBeGreaterThan(midHeadroom)
  })

  it('caps the ratio at 0.65 (base 0.5 + the 0.15 headroom bonus), never more', () => {
    // primaryFontSize === MAX_FONT (96) → maximum possible headroom (1.0) → the
    // ratio tops out at 0.65 — but SECONDARY_MAX (34) is reached first here, so
    // this also exercises that cap; see the next test for the cap in isolation.
    expect(fitSecondaryFontSize(96, 22, 10)).toBe(34)
  })

  it('caps at SECONDARY_MAX (34) regardless of how large the primary is', () => {
    expect(fitSecondaryFontSize(200, 22, 10)).toBe(34)
  })

  it('floors at the caller-supplied secondaryMin, honoring the Tabletop-mirrored floor', () => {
    // A tiny primary right at the mirrored floor (16) computes well under the
    // mirrored secondary floor (11) on the base ratio (16 * 0.5 = 8) — the
    // floor wins, same as it always did.
    expect(fitSecondaryFontSize(16, 16, 11)).toBe(11)
  })
})

describe('QuestionText — Tabletop mode (mirrored, issue #148)', () => {
  const box = {width: 300, height: 400}
  const question = 'What matters to you right now?'

  it('renders the question once when not mirrored', () => {
    render(<QuestionText text={question} language="en" box={box} />)
    expect(screen.getAllByText(question)).toHaveLength(1)
  })

  it('renders the question twice in the tree when mirrored — one normal, one rotated', () => {
    render(<QuestionText text={question} language="en" box={box} mirrored />)
    // includeHiddenElements: true bypasses RNTL's default accessibility-hidden
    // filter, so this counts both copies regardless of a11y state.
    expect(screen.getAllByText(question, {includeHiddenElements: true})).toHaveLength(2)
  })

  it('hides the rotated copy from the accessibility tree — only one is queryable by default', () => {
    render(<QuestionText text={question} language="en" box={box} mirrored />)
    // RNTL's default query excludes accessibilityElementsHidden /
    // importantForAccessibility="no-hide-descendants" subtrees — exactly the
    // marking QuestionText puts on the rotated half. A screen reader hits the
    // same exclusion, so this is the regression guard against announcing the
    // Question twice.
    expect(screen.getAllByText(question)).toHaveLength(1)
  })

  it('renders secondaries in both mirrored halves, one hidden from accessibility', () => {
    render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: '¿Qué te importa ahora mismo?'}]}
        mirrored
      />
    )
    expect(
      screen.getAllByText('¿Qué te importa ahora mismo?', {includeHiddenElements: true})
    ).toHaveLength(2)
    expect(screen.getAllByText('¿Qué te importa ahora mismo?')).toHaveLength(1)
  })
})

describe('QuestionText — themedText (issue #173, final)', () => {
  const box = {width: 300, height: 400}
  const question = 'What matters to you right now?'
  const secondaryText = '¿Qué te importa ahora mismo?'

  it('defaults to hardcoded white — card surfaces (Pick a Card) omit themedText', () => {
    render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondaryText}]}
      />
    )
    expect(screen.getByText(question).props.className).toBe('text-white')
    expect(screen.getByText(secondaryText).props.className).toBe('text-white/70')
  })

  it('follows the theme when themedText is set — classic play on the themed canvas', () => {
    render(
      <QuestionText
        text={question}
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondaryText}]}
        themedText
      />
    )
    expect(screen.getByText(question).props.className).toBe('text-darker dark:text-white')
    expect(screen.getByText(secondaryText).props.className).toBe(
      'text-darker/70 dark:text-white/70'
    )
  })

  it('threads themedText through both mirrored (Tabletop) halves', () => {
    render(<QuestionText text={question} language="en" box={box} mirrored themedText />)
    for (const node of screen.getAllByText(question, {includeHiddenElements: true})) {
      expect(node.props.className).toBe('text-darker dark:text-white')
    }
  })
})

describe('QuestionText — secondary language sizing (issue #189)', () => {
  const box = {width: 300, height: 400}
  const secondaryText = 'Hola'

  it('renders the secondary noticeably bigger under a short primary than a long one', () => {
    // Each render is queried through its own RenderResult (rather than the
    // shared `screen`) so the two independent trees can't cross-match.
    const short = render(
      <QuestionText
        text="Hi?"
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondaryText}]}
      />
    )
    const shortPrimarySecondarySize = short.getByText(secondaryText).props.style.fontSize

    const long = render(
      <QuestionText
        text="What is the most complicated, layered thing you have ever had to explain to someone you love?"
        language="en"
        box={box}
        secondaries={[{language: 'es', text: secondaryText}]}
      />
    )
    const longPrimarySecondarySize = long.getByText(secondaryText).props.style.fontSize

    // A short question leaves the primary's fit with headroom (issue #189) —
    // the secondary grows to use some of it. A long question pins the primary
    // near its floor, leaving no headroom, so the secondary stays at its
    // original, more conservative size.
    expect(shortPrimarySecondarySize).toBeGreaterThan(longPrimarySecondarySize)
  })
})
