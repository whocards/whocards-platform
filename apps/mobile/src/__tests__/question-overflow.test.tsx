/**
 * Regression test for questions overflowing the question box on small screens.
 * The face has no numberOfLines / adjustsFontSizeToFit / scroll, so fitStack is
 * the only thing keeping text inside its box, including when the OS text size
 * is turned up (RN Text scales with it by default).
 *
 * Every shipped question, in every language, on an iPhone SE in both orientations,
 * normal and Tabletop, with 0/1/2 secondaries, is checked against an independent
 * line-breaking oracle (wrapLines) rather than the component's own estimator.
 */
import React from 'react'
import {render} from '@testing-library/react-native'
import {getAllDecks} from '@whocards/decks'

import {resolvedStyle} from '@/test-utils/resolved-style'
import {
  estimateBlockHeight,
  fitStack,
  MIRROR_GAP,
  QuestionText,
  SECONDARY_GAP,
} from '../components/question-text'

// iPhone SE (3rd gen), the smallest iPhone the app targets, in pt.
const SE_PORTRAIT = {width: 375, height: 667}
const SE_LANDSCAPE = {width: 667, height: 375}

// play/[deck].tsx's first-paint budget box: px-8 gutters and 220pt of chrome.
const playBox = (win: {width: number; height: number}) => ({
  width: win.width - 64,
  height: win.height - 220,
})

// iOS' largest accessibility text size lands around 3.1×; Android's "Largest" is 2.0.
const FONT_SCALES = [1, 1.15, 1.5, 2, 3.1]

// --- the independent oracle: re-encoded on purpose, so retuning the model fails here ---
const ORACLE_CHAR_ADVANCE = 0.54
const ORACLE_CJK_ADVANCE = 1
const ORACLE_LINE_HEIGHT = 1.15
const ORACLE_CJK_RE = /[　-ヿ㐀-鿿豈-﫿＀-￯]/
const HARD_MIN_PRIMARY = 12
const HARD_MIN_PRIMARY_MIRRORED = 10
const HARD_MIN_SECONDARY = 8

/** The wrapped lines as strings, a separate implementation from estimateBlockHeight's count. */
const wrapLines = (text: string, fontSize: number, width: number): string[] => {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const advance = ORACLE_CJK_RE.test(paragraph) ? ORACLE_CJK_ADVANCE : ORACLE_CHAR_ADVANCE
    const perLine = Math.max(1, Math.floor(width / (fontSize * advance)))
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of words) {
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

const oracleStackHeight = (
  text: string,
  shown: LanguageText[],
  fontSize: number,
  secondaryFont: number,
  width: number
) =>
  oracleBlockHeight(text, fontSize, width) +
  shown.reduce((sum, s) => sum + SECONDARY_GAP + oracleBlockHeight(s.text, secondaryFont, width), 0)

type Question = {language: string; text: string; others: LanguageText[]}

const allQuestions: Question[] = getAllDecks().flatMap((deck) =>
  Object.values(deck.questions).flatMap((entry) =>
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

const stackLength = (q: Question) =>
  q.others.slice(0, 2).reduce((n, o) => n + o.text.length, q.text.length)
const worstStack = allQuestions
  .filter((q) => q.others.length >= 2)
  .toSorted((a, b) => stackLength(b) - stackLength(a))[0]
const worstSecondaries = worstStack.others.slice(0, 2)

// A Tabletop half shows one language alone, in half the box minus the divider.
const layouts = [
  ['portrait', SE_PORTRAIT, false],
  ['portrait, tabletop', SE_PORTRAIT, true],
  ['landscape', SE_LANDSCAPE, false],
  ['landscape, tabletop', SE_LANDSCAPE, true],
] as const

describe.each(layouts)('no shipped question overflows an iPhone SE: %s', (_name, win, mirrored) => {
  const box = playBox(win)
  const height = mirrored ? (box.height - MIRROR_GAP) / 2 : box.height
  const floor = mirrored ? HARD_MIN_PRIMARY_MIRRORED : HARD_MIN_PRIMARY
  const counts = mirrored ? [0] : [0, 1, 2]

  it.each(counts)('fits every question with %i secondary language(s)', (count) => {
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

      if (fit.fontSize < floor) failures.push(`${where}: primary ${fit.fontSize}pt below ${floor}`)
      if (count > 0 && fit.secondaryFont < HARD_MIN_SECONDARY)
        failures.push(`${where}: secondary ${fit.secondaryFont}pt below ${HARD_MIN_SECONDARY}`)
      if (fit.secondaryFont > fit.fontSize)
        failures.push(`${where}: secondary ${fit.secondaryFont}pt louder than primary`)

      for (const scale of FONT_SCALES) {
        const applied = Math.min(scale, fit.maxFontSizeMultiplier)
        const stack = oracleStackHeight(
          question.text,
          secondaries,
          fit.fontSize * applied,
          fit.secondaryFont * applied,
          box.width
        )
        if (stack > height + 1e-6)
          failures.push(
            `${where} @${scale}×: ${stack.toFixed(1)}pt in a ${height.toFixed(1)}pt box`
          )
      }
    }
    expect(failures.slice(0, 10)).toEqual([])
  })
})

describe('fitStack: the Dynamic Type cap', () => {
  const box = playBox(SE_PORTRAIT)

  it('never caps below 1×', () => {
    for (const question of allQuestions) {
      const fit = fitStack({text: question.text, secondaries: question.others.slice(0, 2), ...box})
      expect(fit.maxFontSizeMultiplier).toBeGreaterThanOrEqual(1)
    }
  })

  it('still lets a short question grow with the OS text size', () => {
    expect(
      fitStack({text: 'Who are you?', secondaries: [], ...box}).maxFontSizeMultiplier
    ).toBeGreaterThan(1)
  })

  it('caps a box-filling question at 1×', () => {
    const fit = fitStack({text: 'word '.repeat(400).trim(), secondaries: [], ...box})
    expect(fit.maxFontSizeMultiplier).toBe(1)
  })
})

describe('estimateBlockHeight: hand-computed expectations', () => {
  it('counts mid-word wraps for space-less CJK text', () => {
    // floor(311 / 22) = 14 chars per line → ceil(120 / 14) = 9 lines × 22 × 1.15
    expect(estimateBlockHeight('あ'.repeat(120), 22, 311)).toBeCloseTo(227.7)
  })

  it('counts explicit \\n\\n breaks', () => {
    expect(estimateBlockHeight('one two\n\nthree', 10, 500)).toBeCloseTo(34.5)
  })

  it('counts edge paragraph breaks, which LanguageBlock renders verbatim', () => {
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

describe('QuestionText: rendering', () => {
  const box = playBox(SE_PORTRAIT)

  it('renders the worst stacked question inside its box, with one cap on every block', async () => {
    const screen = await render(
      <QuestionText
        text={worstStack.text}
        language={worstStack.language}
        box={box}
        secondaries={worstSecondaries}
      />
    )
    const primary = screen.getByText(worstStack.text)
    const cap = primary.props.maxFontSizeMultiplier
    const primarySize = Number(resolvedStyle(primary).fontSize)
    expect(cap).toBeGreaterThanOrEqual(1)
    expect(primarySize).toBeGreaterThanOrEqual(HARD_MIN_PRIMARY)
    // RN's default, true: the cap bounds the OS setting rather than disabling it
    expect(primary.props.allowFontScaling).toBeUndefined()

    let stack = oracleBlockHeight(worstStack.text, primarySize * cap, box.width)
    for (const secondary of worstSecondaries) {
      const block = screen.getByText(secondary.text)
      const size = Number(resolvedStyle(block).fontSize)
      expect(block.props.maxFontSizeMultiplier).toBe(cap)
      expect(size).toBeLessThanOrEqual(primarySize)
      stack += SECONDARY_GAP + oracleBlockHeight(secondary.text, size * cap, box.width)
    }
    expect(stack).toBeLessThanOrEqual(box.height)
  })
})
