/**
 * Regression test for question overflow on small screens (iOS user report,
 * 2026-07): the question face has no numberOfLines / adjustsFontSizeToFit /
 * scroll, so the sizing in question-text.tsx is the only thing keeping text
 * inside its box.
 *
 * Two things have to hold, and both are checked here against an *independent*
 * line-breaking oracle (see wrapLines below) rather than the component's own
 * estimator, so a bug in that estimator cannot validate itself:
 *
 * 1. Every question shipped in every deck, in every language, on the smallest
 *    supported iPhone (SE, 375×667pt), in both orientations, with and without
 *    Tabletop mode, with 0/1/2 secondary languages — an exhaustive sweep, not a
 *    "longest text" sample, because overflow depends on the whole stack rather
 *    than on the primary's character count.
 * 2. The same, with the OS text-size setting turned up. RN Text scales with it
 *    by default, so a stack measured at 76pt renders at 114pt on iOS "Larger
 *    Text" at 1.5× — which is very likely what the original reporter saw.
 *    fitStack caps that scaling per-face with maxFontSizeMultiplier; this
 *    asserts the cap is tight enough at every scale iOS can produce.
 */
import React from 'react'
import {render} from '@testing-library/react-native'
import {getAllDecks} from '@whocards/decks'

import {
  estimateBlockHeight,
  fitStack,
  MIRROR_GAP,
  QuestionText,
  SECONDARY_GAP,
  SECONDARY_GAP_MIRRORED,
} from '../components/question-text'

// iPhone SE (3rd gen), the smallest iPhone the app targets, in pt.
const SE_PORTRAIT = {width: 375, height: 667}
const SE_LANDSCAPE = {width: 667, height: 375}

// The play screen's question budget box (play/[deck].tsx): px-8 gutters (32pt
// each side) and its own first-paint budget of 220pt for status bar + bottom
// chrome. Rotation just swaps the window dims through the same formula.
const playBox = (win: {width: number; height: number}) => ({
  width: win.width - 64,
  height: win.height - 220,
})

// The OS text-size multipliers to sweep. iOS' largest accessibility text size
// lands around 3.1×; Android's "Largest" is 2.0.
const FONT_SCALES = [1, 1.15, 1.5, 2, 3.1]

// --- the independent oracle ---
//
// Deliberately re-encoded rather than imported from question-text.tsx. The
// component's estimator and this oracle have to agree by *construction*, not by
// sharing a constant: if the glyph metrics or the line-height ratio are ever
// retuned, this test should fail and make someone re-check the model, instead of
// silently validating whatever the new numbers are. Same reason the hard font
// floors below are re-encoded.
const ORACLE_CHAR_ADVANCE = 0.54 // average Latin glyph advance, as a fraction of the font size
const ORACLE_CJK_ADVANCE = 1 // CJK glyphs are full-width
const ORACLE_LINE_HEIGHT = 1.15
const ORACLE_CJK_RE = /[　-ヿ㐀-鿿豈-﫿＀-￯]/

// The backstop's hard readability floors — also re-encoded on purpose, so
// silently lowering them into unreadable territory fails this test rather than
// retuning it.
const HARD_MIN_PRIMARY = 12
const HARD_MIN_PRIMARY_MIRRORED = 10
const HARD_MIN_SECONDARY = 8

/**
 * Break `text` into the lines a text engine would actually render at
 * `fontSize` in a `width`-pt column, and return them.
 *
 * This builds the wrapped lines as strings instead of counting them
 * arithmetically the way estimateBlockHeight does — a separate implementation
 * of the same model, so an off-by-one in the production line count shows up
 * here as a disagreement rather than being reproduced.
 */
const wrapLines = (text: string, fontSize: number, width: number): string[] => {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const advance = ORACLE_CJK_RE.test(paragraph) ? ORACLE_CJK_ADVANCE : ORACLE_CHAR_ADVANCE
    const perLine = Math.max(1, Math.floor(width / (fontSize * advance)))
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('') // a blank line from a \n\n break still occupies a line
      continue
    }
    let line = ''
    for (const word of words) {
      // a word wider than a whole line (a space-less CJK sentence) breaks
      // across lines character by character
      let rest = word
      while (rest.length > perLine) {
        if (line) {
          lines.push(line)
          line = ''
        }
        lines.push(rest.slice(0, perLine))
        rest = rest.slice(perLine)
      }
      if (!rest) continue
      const candidate = line ? `${line} ${rest}` : rest
      if (candidate.length <= perLine) {
        line = candidate
      } else {
        lines.push(line)
        line = rest
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

const oracleBlockHeight = (text: string, fontSize: number, width: number) =>
  wrapLines(text, fontSize, width).length * fontSize * ORACLE_LINE_HEIGHT

type LanguageText = {language: string; text: string}

/** The rendered height of a whole primary+secondaries stack, per the oracle. */
const oracleStackHeight = (
  text: string,
  shown: LanguageText[],
  fontSize: number,
  secondaryFont: number,
  width: number,
  gap: number
) =>
  oracleBlockHeight(text, fontSize, width) +
  shown.reduce((sum, s) => sum + gap + oracleBlockHeight(s.text, secondaryFont, width), 0)

// --- every question shipped in every deck, in every language ---

type Question = {language: string; text: string; others: LanguageText[]}

const allQuestions: Question[] = getAllDecks().flatMap((deck) =>
  Object.values(deck.questions).flatMap((entry: Record<string, string>) =>
    Object.entries(entry).map(([language, text]) => ({
      language,
      text,
      // longest translations first: the worst stack a Display setting can build
      others: Object.entries(entry)
        .filter(([code]) => code !== language)
        .map(([code, translation]) => ({language: code, text: translation}))
        .toSorted((a, b) => b.text.length - a.text.length),
    }))
  )
)

const byStackLength = (a: Question, b: Question) =>
  b.others.slice(0, 2).reduce((n, o) => n + o.text.length, b.text.length) -
  a.others.slice(0, 2).reduce((n, o) => n + o.text.length, a.text.length)

/**
 * The worst stacked case in the shipped decks — ranked by primary *plus* the two
 * translations that would render under it, not by the primary's length alone: a
 * short question with long translations overflows a box a long one survives.
 */
const worstStack = allQuestions.filter((q) => q.others.length >= 2).toSorted(byStackLength)[0]
const worstSecondaries = worstStack.others.slice(0, 2)

// --- exhaustive sweep ---

const layouts = [
  ['portrait', SE_PORTRAIT, false],
  ['portrait, tabletop', SE_PORTRAIT, true],
  ['landscape', SE_LANDSCAPE, false],
  ['landscape, tabletop', SE_LANDSCAPE, true],
] as const

describe.each(layouts)(
  'no shipped question overflows an iPhone SE — %s',
  (_layout, win, mirrored) => {
    const box = playBox(win)
    // A Tabletop face only gets half the box (minus the divider) and a tighter gap.
    const height = mirrored ? Math.max(0, (box.height - MIRROR_GAP) / 2) : box.height
    const gap = mirrored ? SECONDARY_GAP_MIRRORED : SECONDARY_GAP
    const floor = mirrored ? HARD_MIN_PRIMARY_MIRRORED : HARD_MIN_PRIMARY

    it.each([0, 1, 2])('fits every question with %i secondary language(s)', (count) => {
      const failures: string[] = []

      for (const question of allQuestions) {
        if (question.others.length < count) continue
        const secondaries = question.others.slice(0, count)
        const fit = fitStack({
          text: question.text,
          secondaries,
          width: box.width,
          height,
          compact: mirrored,
        })
        const where = `${question.language} (${question.text.length} chars) ×${count}`

        // readable, and never louder than the primary (support, not focus)
        if (fit.fontSize < floor)
          failures.push(`${where}: primary ${fit.fontSize}pt below ${floor}`)
        if (fit.shown.length > 0 && fit.secondaryFont < HARD_MIN_SECONDARY)
          failures.push(`${where}: secondary ${fit.secondaryFont}pt below ${HARD_MIN_SECONDARY}`)
        if (fit.secondaryFont > fit.fontSize)
          failures.push(`${where}: secondary ${fit.secondaryFont}pt louder than primary`)
        // the Question is the hero — it is never one of the blocks dropped
        if (fit.shown.length > secondaries.length)
          failures.push(`${where}: rendered more secondaries than asked for`)

        for (const scale of FONT_SCALES) {
          // what the OS actually renders: the user's scale, clamped by the cap
          const applied = Math.min(scale, fit.maxFontSizeMultiplier)
          const stack = oracleStackHeight(
            question.text,
            fit.shown,
            fit.fontSize * applied,
            fit.secondaryFont * applied,
            box.width,
            gap
          )
          if (stack > height + 1e-6)
            failures.push(
              `${where} @${scale}×: ${stack.toFixed(1)}pt in a ${height.toFixed(1)}pt box`
            )
        }
      }

      expect(failures.slice(0, 10)).toEqual([])
      expect(failures).toHaveLength(0)
    })
  }
)

describe('fitStack — the Dynamic Type cap', () => {
  const box = playBox(SE_PORTRAIT)

  it('never caps below 1× — the cap only refuses growth, it never shrinks text', () => {
    for (const question of allQuestions) {
      const fit = fitStack({
        text: question.text,
        secondaries: question.others.slice(0, 2),
        width: box.width,
        height: box.height,
      })
      expect(fit.maxFontSizeMultiplier).toBeGreaterThanOrEqual(1)
    }
  })

  it('still lets a short question grow with the OS text-size setting', () => {
    const fit = fitStack({text: 'Who are you?', secondaries: [], ...box})
    expect(fit.maxFontSizeMultiplier).toBeGreaterThan(1)
  })

  it('caps a box-filling question at 1× rather than letting it overflow', () => {
    // long enough that the fit is already overflow-bound: there is no room to
    // scale into, so the user's setting cannot be honoured beyond 1×
    const fit = fitStack({text: 'word '.repeat(400).trim(), secondaries: [], ...box})
    expect(fit.maxFontSizeMultiplier).toBe(1)
  })
})

describe('fitStack — degrading a stack that cannot fit at any readable size', () => {
  it('keeps every secondary in portrait, where the box can hold them', () => {
    const box = playBox(SE_PORTRAIT)
    for (const question of allQuestions) {
      const secondaries = question.others.slice(0, 2)
      if (secondaries.length < 2) continue
      const fit = fitStack({text: question.text, secondaries, ...box})
      expect(fit.shown).toHaveLength(2)
    }
  })

  it('drops the last secondary in a Tabletop landscape half rather than overflowing', () => {
    // ~64pt per half on an SE in landscape: two secondaries plus their gaps do
    // not fit under the longest questions at any size above the hard floors.
    const box = playBox(SE_LANDSCAPE)
    const height = (box.height - MIRROR_GAP) / 2
    const worst = allQuestions.filter((q) => q.others.length >= 2).toSorted(byStackLength)[0]
    const secondaries = worst.others.slice(0, 2)
    const fit = fitStack({text: worst.text, secondaries, width: box.width, height, compact: true})

    expect(fit.shown.length).toBeLessThan(2)
    // whatever survives is a prefix of what was asked for, so the highest
    // priority secondary is the last to go
    expect(fit.shown).toEqual(secondaries.slice(0, fit.shown.length))
    expect(
      oracleStackHeight(
        worst.text,
        fit.shown,
        fit.fontSize,
        fit.secondaryFont,
        box.width,
        SECONDARY_GAP_MIRRORED
      )
    ).toBeLessThanOrEqual(height)
  })
})

describe('estimateBlockHeight — hand-computed expectations', () => {
  it('counts mid-word wraps for space-less CJK text', () => {
    // 120 full-width chars, 311pt wide, 22pt font → floor(311 / (22 × 1.0)) =
    // 14 chars per line → ceil(120 / 14) = 9 lines → 9 × 22 × 1.15 = 227.7pt.
    // The pre-fix greedy wrap counted this as 2 lines (50.6pt).
    expect(estimateBlockHeight('あ'.repeat(120), 22, 311)).toBeCloseTo(227.7)
  })

  it('counts explicit \\n\\n breaks', () => {
    // At 10pt in a 500pt column every paragraph fits on one line, so the only
    // extra height is the blank line: 3 lines × 10 × 1.15 = 34.5pt.
    expect(estimateBlockHeight('one two\n\nthree', 10, 500)).toBeCloseTo(34.5)
  })

  it('counts edge paragraph breaks, which LanguageBlock renders verbatim', () => {
    // Trimming first would miss these: the component renders the raw string.
    expect(estimateBlockHeight('\nA', 10, 500)).toBeCloseTo(23)
    expect(estimateBlockHeight('A\n', 10, 500)).toBeCloseTo(23)
  })

  it('agrees with the independent oracle across the shipped decks', () => {
    for (const question of allQuestions) {
      for (const size of [8, 12, 22, 48]) {
        expect(estimateBlockHeight(question.text, size, 311)).toBeCloseTo(
          oracleBlockHeight(question.text, size, 311)
        )
      }
    }
  })
})

// --- the component actually wires all of that up ---

describe('QuestionText — rendering', () => {
  const box = playBox(SE_PORTRAIT)

  it('renders the worst stacked question inside its box, with a scaling cap on every block', () => {
    const {getAllByText} = render(
      <QuestionText
        text={worstStack.text}
        language={worstStack.language}
        box={box}
        secondaries={worstSecondaries}
      />
    )
    const primary = getAllByText(worstStack.text)[0].props
    const cap = primary.maxFontSizeMultiplier
    expect(cap).toBeGreaterThanOrEqual(1)

    let stack = oracleBlockHeight(worstStack.text, primary.style.fontSize * cap, box.width)
    for (const secondary of worstSecondaries) {
      const block = getAllByText(secondary.text)[0].props
      expect(block.maxFontSizeMultiplier).toBe(cap)
      expect(block.style.fontSize).toBeGreaterThanOrEqual(HARD_MIN_SECONDARY)
      expect(block.style.fontSize).toBeLessThanOrEqual(primary.style.fontSize)
      stack +=
        SECONDARY_GAP + oracleBlockHeight(secondary.text, block.style.fontSize * cap, box.width)
    }

    expect(primary.style.fontSize).toBeGreaterThanOrEqual(HARD_MIN_PRIMARY)
    expect(stack).toBeLessThanOrEqual(box.height)
  })

  it('keeps allowFontScaling on — the cap bounds the OS setting, it does not disable it', () => {
    const {getAllByText} = render(
      <QuestionText text={worstStack.text} language={worstStack.language} box={box} />
    )
    // undefined means RN's default, which is true
    expect(getAllByText(worstStack.text)[0].props.allowFontScaling).toBeUndefined()
  })

  it('fits both Tabletop halves in landscape with 2 secondaries — the worst case there is', () => {
    const landscape = playBox(SE_LANDSCAPE)
    const half = (landscape.height - MIRROR_GAP) / 2
    const {getAllByText, queryAllByText} = render(
      <QuestionText
        text={worstStack.text}
        language={worstStack.language}
        box={landscape}
        secondaries={worstSecondaries}
        mirrored
      />
    )
    const opts = {includeHiddenElements: true}
    const primary = getAllByText(worstStack.text, opts)[0].props
    // both halves render the same face
    expect(getAllByText(worstStack.text, opts)).toHaveLength(2)
    expect(primary.style.fontSize).toBeGreaterThanOrEqual(HARD_MIN_PRIMARY_MIRRORED)

    const cap = primary.maxFontSizeMultiplier
    let stack = oracleBlockHeight(worstStack.text, primary.style.fontSize * cap, landscape.width)
    for (const secondary of worstSecondaries) {
      // a secondary the half cannot hold at any readable size is dropped
      const blocks = queryAllByText(secondary.text, opts)
      if (blocks.length === 0) continue
      stack +=
        SECONDARY_GAP_MIRRORED +
        oracleBlockHeight(secondary.text, blocks[0].props.style.fontSize * cap, landscape.width)
    }
    expect(stack).toBeLessThanOrEqual(half)
  })
})
