/**
 * Regression test for question overflow on small screens (iOS user report,
 * 2026-07): the question face has no numberOfLines / adjustsFontSizeToFit /
 * scroll — fitFontSize's estimate is the only thing keeping text inside its
 * box, and its MIN_FONT floor can push a long question past the box edge.
 *
 * Renders QuestionText with the longest question shipped in the real deck data
 * inside the play screen's budget box on the smallest supported iPhone
 * (iPhone SE, 375×667pt), portrait and landscape, and asserts the chosen font
 * sizes cannot overflow the box under the component's own text-metrics model
 * (CHAR_WIDTH_RATIO / LINE_HEIGHT_RATIO): a greedy word-wrap of the text at
 * the rendered size — honoring the explicit \n\n breaks some pool questions
 * carry, which fitFontSize's area estimate ignores — must fit the box height,
 * and the longest word must fit the box width.
 */
import React from 'react'
import {render} from '@testing-library/react-native'
import {getAllDecks} from '@whocards/decks'

import {CHAR_WIDTH_RATIO, estimateBlockHeight, QuestionText} from '../components/question-text'

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

// mt-4 between the primary block and each secondary block (question-text.tsx)
const SECONDARY_GAP = 16

const longestWordLength = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .reduce((max, word) => Math.max(max, word.length), 1)

// --- worst-case questions from the real shipped deck data ---

type Candidate = {text: string; language: string; translations: Record<string, string>}

const allQuestions: Candidate[] = getAllDecks().flatMap((deck) =>
  Object.values(deck.questions).flatMap((entry) =>
    Object.entries(entry).map(([language, text]) => ({text, language, translations: entry}))
  )
)

const byLength = (a: Candidate, b: Candidate) => b.text.length - a.text.length

// The single longest question text shipped in any deck, any language.
const longest = allQuestions.toSorted(byLength)[0]

// The longest question that has at least 3 translations — rendered with its two
// longest translations as secondaries, the worst stacked-height case the
// Display settings allow (primary share drops to 0.55 with 2 secondaries).
const longestTranslated = [...allQuestions]
  .filter((q) => Object.keys(q.translations).length >= 3)
  .toSorted(byLength)[0]
const secondaries = Object.entries(longestTranslated.translations)
  .filter(([language]) => language !== longestTranslated.language)
  .map(([language, text]) => ({language, text}))
  .toSorted((a, b) => b.text.length - a.text.length)
  .slice(0, 2)

describe.each([
  ['portrait', playBox(SE_PORTRAIT)],
  ['landscape', playBox(SE_LANDSCAPE)],
])('QuestionText — longest question fits an iPhone SE in %s (%o)', (_orientation, box) => {
  it(`fits the longest shipped question (${longest.language} ${longest.text.length} chars), primary only`, () => {
    const {getAllByText} = render(
      <QuestionText text={longest.text} language={longest.language} box={box} />
    )
    const fontSize = getAllByText(longest.text)[0].props.style.fontSize

    expect(longestWordLength(longest.text) * fontSize * CHAR_WIDTH_RATIO).toBeLessThanOrEqual(
      box.width
    )
    expect(estimateBlockHeight(longest.text, fontSize, box.width)).toBeLessThanOrEqual(box.height)
  })

  it(`fits the longest translated question (${longestTranslated.language} ${longestTranslated.text.length} chars) with 2 secondaries`, () => {
    const {getAllByText} = render(
      <QuestionText
        text={longestTranslated.text}
        language={longestTranslated.language}
        box={box}
        secondaries={secondaries}
      />
    )
    const primarySize = getAllByText(longestTranslated.text)[0].props.style.fontSize

    let stackHeight = estimateBlockHeight(longestTranslated.text, primarySize, box.width)
    for (const secondary of secondaries) {
      const secondarySize = getAllByText(secondary.text)[0].props.style.fontSize
      expect(
        longestWordLength(secondary.text) * secondarySize * CHAR_WIDTH_RATIO
      ).toBeLessThanOrEqual(box.width)
      stackHeight += SECONDARY_GAP + estimateBlockHeight(secondary.text, secondarySize, box.width)
    }

    expect(
      longestWordLength(longestTranslated.text) * primarySize * CHAR_WIDTH_RATIO
    ).toBeLessThanOrEqual(box.width)
    expect(stackHeight).toBeLessThanOrEqual(box.height)
  })
})
