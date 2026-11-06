// Every shipped question on an iPhone SE: main's sizes at 1×, and an OS text-scale cap that keeps it in its box.
import React from 'react'
import {render} from '@testing-library/react-native'
import {getAllDecks} from '@whocards/decks'

import {resolvedStyle} from '@/test-utils/resolved-style'
import {
  estimateBlockHeight,
  fitFontSize,
  fitSecondaryFontSize,
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

// pick-player.tsx's card: a 0.72-aspect card under a 68pt hint band, minus 28×44 padding.
const pickBox = (win: {width: number; height: number}) => {
  const play = playBox(win)
  const cardWidth = Math.round(Math.min(play.width, (play.height - 68) * 0.72))
  return {width: cardWidth - 56, height: Math.round(cardWidth / 0.72) - 88}
}

// iOS' largest accessibility text size lands around 3.1×; Android's "Largest" is 2.0.
const FONT_SCALES = [1, 1.15, 1.5, 2, 3.1]

// --- the independent oracle: re-encoded on purpose, so retuning the model fails here ---
const ORACLE_CHAR_ADVANCE = 0.54
const ORACLE_CJK_ADVANCE = 1
const ORACLE_LINE_HEIGHT = 1.15
const ORACLE_CJK_RE = /[　-ヿ㐀-鿿豈-﫿＀-￯]/
const HEADROOM = 0.85
// main's QuestionFace: floors and the primary's share of the box with one secondary
const MAIN_MIN_FONT = 22
const MAIN_MIN_FONT_MIRRORED = 16
const MAIN_PRIMARY_SHARE = [1, 0.65]

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

const worstStack = allQuestions
  .filter((q) => q.others.length >= 1)
  .toSorted(
    (a, b) => b.text.length + b.others[0].text.length - a.text.length - a.others[0].text.length
  )[0]
const worstSecondaries = worstStack.others.slice(0, 1)

// A Tabletop half shows one language alone, in half the box minus the divider.
const layouts = [
  ['play, portrait', playBox(SE_PORTRAIT), false],
  ['play, portrait, tabletop', playBox(SE_PORTRAIT), true],
  ['play, landscape', playBox(SE_LANDSCAPE), false],
  ['play, landscape, tabletop', playBox(SE_LANDSCAPE), true],
  ['pick, portrait', pickBox(SE_PORTRAIT), false],
  ['pick, portrait, tabletop', pickBox(SE_PORTRAIT), true],
] as const

describe.each(layouts)('every shipped question on an iPhone SE: %s', (_name, box, mirrored) => {
  const height = mirrored ? (box.height - MIRROR_GAP) / 2 : box.height
  const minFont = mirrored ? MAIN_MIN_FONT_MIRRORED : MAIN_MIN_FONT
  const counts = mirrored ? [0] : [0, 1]

  it.each(counts)('with %i secondary language(s)', (count) => {
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

      const mainFont = fitFontSize(
        question.text,
        box.width,
        height * MAIN_PRIMARY_SHARE[count],
        minFont
      )
      if (
        fit.fontSize !== mainFont ||
        fit.secondaryFont !== fitSecondaryFontSize(mainFont, minFont)
      )
        failures.push(`${where}: ${fit.fontSize}/${fit.secondaryFont}pt differs from main at 1×`)

      const stackAt = (scale: number) =>
        oracleStackHeight(
          question.text,
          secondaries,
          fit.fontSize * scale,
          fit.secondaryFont * scale,
          box.width
        )
      // main's sizes already overflow at 1× here: pre-existing, so the cap just pins at 1
      if (stackAt(1) > height * HEADROOM) {
        if (fit.maxFontSizeMultiplier !== 1)
          failures.push(`${where}: overflows at 1× yet caps above 1`)
        continue
      }
      for (const scale of FONT_SCALES) {
        const applied = Math.min(scale, fit.maxFontSizeMultiplier)
        const stack = stackAt(applied)
        if (stack > height * HEADROOM + 1e-6)
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
      const fit = fitStack({text: question.text, secondaries: question.others.slice(0, 1), ...box})
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
    expect(stack).toBeLessThanOrEqual(box.height * HEADROOM)
  })
})
