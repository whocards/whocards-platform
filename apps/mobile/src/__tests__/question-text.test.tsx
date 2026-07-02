/**
 * Tests for src/components/question-text.tsx
 *
 * Covers Tabletop mode (issue #148, a Display setting): with `mirrored`, the
 * Question renders twice — a normal bottom half and a 180°-rotated top half —
 * and the rotated copy must be hidden from the accessibility tree so a screen
 * reader announces the Question once, not twice. Also covers the `fitFontSize`
 * `minFont` override that gives the mirrored halves a lower font floor.
 */
import React from 'react'
import {render, screen} from '@testing-library/react-native'

import {QuestionText, fitFontSize} from '../components/question-text'

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
