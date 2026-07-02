import {useMemo} from 'react'
import {Text} from 'react-native'
import {getDirection} from '@whocards/decks'

// Per-script question face. golos-text (the brand body face) covers Latin + Cyrillic;
// Hebrew gets its bundled Noto face; CJK (zh/jp) falls back to the system font — full
// glyph coverage on device, and the Noto CJK faces are too heavy to bundle (see
// docs/tickets/0001-mobile-cjk-hebrew-question-fonts.md).
const SYSTEM_FONT_LANGUAGES = new Set(['zh', 'jp'])
const SCRIPT_FONTS: Record<string, string> = {he: 'noto-sans-hebrew'}

/** The font family for a question in `language`, or `undefined` for the system font. */
export const questionFontFamily = (language: string): string | undefined => {
  if (language in SCRIPT_FONTS) return SCRIPT_FONTS[language]
  return SYSTEM_FONT_LANGUAGES.has(language) ? undefined : 'golos-text'
}

// --- dynamic question sizing: grow the text to fill its box, recomputed on rotation ---
export const LINE_HEIGHT_RATIO = 1.15
// average glyph advance / line height as fractions of the font size (semibold sans)
const CHAR_WIDTH_RATIO = 0.54
// fraction of the box the text aims to cover — kept well under 1 so ragged wrapping
// and real-device font metrics (taller than this estimate) still leave breathing room
const FILL = 0.5
const MIN_FONT = 22
const MAX_FONT = 96

/**
 * Largest font that lets `text` fill — without overflowing — a `width`×`height` box.
 * Derived from area (chars × glyph area ≈ filled area, so font ∝ √(area / chars)), then
 * capped so the longest single word still fits on one line. Orientation falls out for
 * free: rotating swaps width/height, the box changes, and the size is recomputed.
 */
export const fitFontSize = (text: string, width: number, height: number) => {
  if (width <= 0 || height <= 0) return MIN_FONT
  const trimmed = text.trim()
  const chars = Math.max(trimmed.length, 1)
  const raw = Math.sqrt((FILL * width * height) / (chars * CHAR_WIDTH_RATIO * LINE_HEIGHT_RATIO))
  // cap so the longest word fills ~90% of the width — a margin on the widest lines too
  const longestWord = trimmed.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 1)
  const widthCap = (width * 0.9) / (longestWord * CHAR_WIDTH_RATIO)
  return Math.round(Math.max(MIN_FONT, Math.min(MAX_FONT, raw, widthCap)))
}

type QuestionTextProps = {
  text: string
  language: string
  /** The measured box the question grows to fill (see fitFontSize). */
  box: {width: number; height: number}
}

/**
 * The question face: one language's text sized to fill its box, with the right
 * script font, bidi base direction, and RTL alignment. Shared by every player
 * so all Games render a Card identically.
 */
export const QuestionText = ({text, language, box}: QuestionTextProps) => {
  const direction = getDirection(language)
  // brand/script face where one exists; system font (with a weight) otherwise
  const questionFont = questionFontFamily(language)
  const fontSize = useMemo(
    () => fitFontSize(text, box.width, box.height),
    [text, box.width, box.height]
  )

  return (
    <Text
      className="text-white"
      style={{
        fontSize,
        lineHeight: fontSize * LINE_HEIGHT_RATIO,
        writingDirection: direction,
        // writingDirection sets the bidi base direction but not paragraph
        // alignment in RN — RTL (Hebrew) needs textAlign to right-align
        textAlign: direction === 'rtl' ? 'right' : 'left',
        ...(questionFont ? {fontFamily: questionFont} : {fontWeight: '600'}),
      }}
    >
      {text}
    </Text>
  )
}
