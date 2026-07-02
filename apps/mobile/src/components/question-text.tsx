import {useMemo} from 'react'
import {Text, View} from 'react-native'
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

// The primary's share of the box height when secondaries are shown — the
// secondaries are support, not focus (DESIGN.md: the Question is the focus).
const PRIMARY_SHARE = [1, 0.65, 0.55] as const
const SECONDARY_MIN = 16
const SECONDARY_MAX = 34

type LanguageText = {language: string; text: string}

type QuestionTextProps = {
  text: string
  language: string
  /** The measured box the question grows to fill (see fitFontSize). */
  box: {width: number; height: number}
  /**
   * Secondary display languages rendered under the primary (a Display setting).
   * Each renders as its own text block with its own script font and bidi base
   * direction, so an RTL secondary under an LTR primary just works.
   */
  secondaries?: LanguageText[]
}

/** One language's text block with the right script font, bidi direction, and alignment. */
const LanguageBlock = ({
  text,
  language,
  fontSize,
  muted,
}: LanguageText & {fontSize: number; muted?: boolean}) => {
  const direction = getDirection(language)
  // brand/script face where one exists; system font (with a weight) otherwise
  const font = questionFontFamily(language)

  return (
    <Text
      className={muted ? 'text-white/70' : 'text-white'}
      style={{
        fontSize,
        lineHeight: fontSize * LINE_HEIGHT_RATIO,
        writingDirection: direction,
        // writingDirection sets the bidi base direction but not paragraph
        // alignment in RN — RTL (Hebrew) needs textAlign to right-align
        textAlign: direction === 'rtl' ? 'right' : 'left',
        ...(font ? {fontFamily: font} : {fontWeight: '600'}),
      }}
    >
      {text}
    </Text>
  )
}

/**
 * The question face: the primary language sized to fill its box, with any
 * secondary display languages rendered smaller and muted below it. Shared by
 * every player so all Games render a Card identically. A secondary missing a
 * translation renders nothing.
 */
export const QuestionText = ({text, language, box, secondaries = []}: QuestionTextProps) => {
  const shown = secondaries.filter((entry) => entry.text)
  const share = PRIMARY_SHARE[Math.min(shown.length, PRIMARY_SHARE.length - 1)] ?? 1
  const fontSize = useMemo(
    () => fitFontSize(text, box.width, box.height * share),
    [text, box.width, box.height, share]
  )
  const secondaryFont = Math.round(Math.max(SECONDARY_MIN, Math.min(SECONDARY_MAX, fontSize * 0.5)))

  if (shown.length === 0) {
    return <LanguageBlock text={text} language={language} fontSize={fontSize} />
  }

  return (
    <View>
      <LanguageBlock text={text} language={language} fontSize={fontSize} />
      {shown.map((entry) => (
        <View key={entry.language} className="mt-4">
          <LanguageBlock
            text={entry.text}
            language={entry.language}
            fontSize={secondaryFont}
            muted
          />
        </View>
      ))}
    </View>
  )
}
