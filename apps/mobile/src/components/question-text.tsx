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
// hard floors the overflow backstop may shrink to when the soft floors above still overflow
const ABS_MIN_FONT = 12
const ABS_MIN_FONT_MIRRORED = 10
const ABS_MIN_SECONDARY = 8

/**
 * Largest font that lets `text` fill — without overflowing — a `width`×`height` box.
 * Derived from area (chars × glyph area ≈ filled area, so font ∝ √(area / chars)), then
 * capped so the longest single word still fits on one line. Orientation falls out for
 * free: rotating swaps width/height, the box changes, and the size is recomputed.
 *
 * `minFont` overrides the floor (default MIN_FONT) — Tabletop mode (mirrored) passes
 * a lower floor because each half only gets ~50% of the box height.
 */
export const fitFontSize = (
  text: string,
  width: number,
  height: number,
  minFont: number = MIN_FONT
) => {
  if (width <= 0 || height <= 0) return minFont
  const trimmed = text.trim()
  const chars = Math.max(trimmed.length, 1)
  const raw = Math.sqrt((FILL * width * height) / (chars * CHAR_WIDTH_RATIO * LINE_HEIGHT_RATIO))
  // cap so the longest word fills ~90% of the width — a margin on the widest lines too
  const longestWord = trimmed.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 1)
  const widthCap = (width * 0.9) / (longestWord * CHAR_WIDTH_RATIO)
  return Math.round(Math.max(minFont, Math.min(MAX_FONT, raw, widthCap)))
}

// CJK has no spaces (a sentence wraps glyph by glyph) and its glyphs are full-width
const CJK_CHAR_WIDTH_RATIO = 1
const CJK_RE = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/

/**
 * Estimated rendered height of one text block: a greedy word-wrap at fitFontSize's
 * glyph metrics, counting explicit \n breaks (raw text, as LanguageBlock renders it).
 */
export const estimateBlockHeight = (text: string, fontSize: number, width: number) => {
  let lines = 0
  for (const paragraph of text.split('\n')) {
    const ratio = CJK_RE.test(paragraph) ? CJK_CHAR_WIDTH_RATIO : CHAR_WIDTH_RATIO
    const maxChars = Math.max(1, Math.floor(width / (fontSize * ratio)))
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines += 1
      continue
    }
    let lineLen = 0
    for (const word of words) {
      if (word.length > maxChars) {
        if (lineLen > 0) lines += 1
        lines += Math.floor(word.length / maxChars)
        lineLen = word.length % maxChars
        continue
      }
      const needed = lineLen === 0 ? word.length : lineLen + 1 + word.length
      if (needed <= maxChars) {
        lineLen = needed
      } else {
        lines += 1
        lineLen = word.length
      }
    }
    if (lineLen > 0) lines += 1
  }
  return lines * fontSize * LINE_HEIGHT_RATIO
}

// The primary's share of the box height when secondaries are shown — the
// secondaries are support, not focus (DESIGN.md: the Question is the focus).
const PRIMARY_SHARE = [1, 0.65, 0.55] as const
const SECONDARY_MIN = 16
const SECONDARY_MAX = 34

// The secondary's font size is this fraction of the primary's by default —
// support, not focus. Grown by up to SECONDARY_RATIO_HEADROOM_BONUS on a short
// question: fitFontSize's returned size is itself a measure of how much room the
// primary had (a short question doesn't need to grow all the way to MAX_FONT to
// fill its share of the box, so a size well below MAX_FONT — while still well
// above the floor — means there was headroom to spare). A question sized at (or
// near) its floor gets exactly the base ratio — the same value this always used
// — so long questions, and the Tabletop-mirrored floor, are unaffected.
const SECONDARY_RATIO = 0.5
const SECONDARY_RATIO_HEADROOM_BONUS = 0.15

/**
 * The secondary language's font size, as a fraction of the (already-fit) primary
 * `primaryFontSize` — grown toward `SECONDARY_MAX` when the primary sizing had
 * headroom (see the constants above), never adjusting the primary itself.
 * `primaryMinFont` is whichever floor (`MIN_FONT`/`MIN_FONT_MIRRORED`) `fontSize`
 * was fit against, so headroom is measured from the floor that was actually in
 * play.
 */
export const fitSecondaryFontSize = (primaryFontSize: number, primaryMinFont: number) => {
  const headroom = Math.max(
    0,
    Math.min(1, (primaryFontSize - primaryMinFont) / (MAX_FONT - primaryMinFont))
  )
  const ratio = SECONDARY_RATIO + headroom * SECONDARY_RATIO_HEADROOM_BONUS
  return Math.round(Math.max(SECONDARY_MIN, Math.min(SECONDARY_MAX, primaryFontSize * ratio)))
}

// --- Tabletop mode (issue #148, a Display setting): the Card splits horizontally,
// the top half rotated 180° so the two sides of a phone lying flat on the table
// each read one language (issue #366). Each half only gets ~50% of the box height
// (minus MIRROR_GAP), so it fits against a lower floor than a full face.
const MIN_FONT_MIRRORED = 16
export const MIRROR_GAP = 28
// the mt-4 above each secondary block
export const SECONDARY_GAP = 16

type LanguageText = {language: string; text: string}

// iOS' largest accessibility text size is ~3.1×, so 4 is effectively uncapped
const MAX_FONT_SCALE = 4
const FONT_SCALE_STEP = 0.05

const estimateStackHeight = (
  text: string,
  shown: LanguageText[],
  fontSize: number,
  secondaryFont: number,
  width: number
) =>
  estimateBlockHeight(text, fontSize, width) +
  shown.reduce(
    (sum, s) => sum + SECONDARY_GAP + estimateBlockHeight(s.text, secondaryFont, width),
    0
  )

/**
 * Font sizes for one question face, plus the OS text-scaling cap that keeps it in its box.
 *
 * fitFontSize's area estimate and soft floors can still overflow a small box, so the whole
 * stack is wrap-estimated and both sizes walk down together to the hard floors. RN Text
 * scales with the OS text size by default, so `maxFontSizeMultiplier` is the largest scale
 * (never below 1) at which the fitted stack still fits: Dynamic Type stays on, but can't
 * push a question off the card.
 */
export const fitStack = ({
  text,
  secondaries,
  width,
  height,
  compact = false,
}: {
  text: string
  secondaries: LanguageText[]
  width: number
  height: number
  compact?: boolean
}) => {
  const minFont = compact ? MIN_FONT_MIRRORED : MIN_FONT
  const absMinFont = compact ? ABS_MIN_FONT_MIRRORED : ABS_MIN_FONT
  const share = PRIMARY_SHARE[Math.min(secondaries.length, PRIMARY_SHARE.length - 1)] ?? 1
  let fontSize = fitFontSize(text, width, height * share, minFont)
  let secondaryFont = fitSecondaryFontSize(fontSize, minFont)
  if (width <= 0 || height <= 0) return {fontSize, secondaryFont, maxFontSizeMultiplier: 1}

  const ratio = secondaryFont / fontSize
  const fits = (scale: number) =>
    estimateStackHeight(text, secondaries, fontSize * scale, secondaryFont * scale, width) <= height
  while (fontSize > absMinFont && !fits(1)) {
    fontSize -= 1
    secondaryFont = Math.max(ABS_MIN_SECONDARY, Math.round(fontSize * ratio))
  }

  let scale = MAX_FONT_SCALE
  while (scale > 1 && !fits(scale)) scale = Math.round((scale - FONT_SCALE_STEP) * 100) / 100
  return {fontSize, secondaryFont, maxFontSizeMultiplier: Math.max(1, scale)}
}

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
  /**
   * Tabletop mode (issue #148, a Display setting): split the box horizontally —
   * the primary on the bottom half, the first secondary (or the primary again)
   * rotated 180° on the top half — so each side of a flat phone reads its own.
   * Never changes which Card is drawn, only how this one looks (CONTEXT.md).
   */
  mirrored?: boolean
  /**
   * Classic play (issue #173, final): the question sits directly on the themed
   * canvas — it is not a card — so its text follows the Theme Display setting
   * (near-black `darker` in Light, the owner's explicit pick over brand violet;
   * white in Dark). Card surfaces (Pick a Card's faces, pick-player.tsx) omit
   * this and keep the default: the Card itself is always dark in both themes, so
   * its text stays hardcoded white regardless of Theme.
   */
  themedText?: boolean
}

/** One language's text block with the right script font, bidi direction, and alignment. */
const LanguageBlock = ({
  text,
  language,
  fontSize,
  maxFontSizeMultiplier,
  muted,
  themedText,
}: LanguageText & {
  fontSize: number
  maxFontSizeMultiplier: number
  muted?: boolean
  themedText?: boolean
}) => {
  const direction = getDirection(language)
  // brand/script face where one exists; system font (with a weight) otherwise
  const font = questionFontFamily(language)

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      className={
        themedText
          ? muted
            ? 'text-darker/70 dark:text-white/70'
            : 'text-darker dark:text-white'
          : muted
            ? 'text-white/70'
            : 'text-white'
      }
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

type QuestionFaceProps = {
  text: string
  language: string
  box: {width: number; height: number}
  shown: LanguageText[]
  /** The lower font floor of a Tabletop-mirrored half (see MIN_FONT_MIRRORED). */
  compact?: boolean
  /** See QuestionTextProps.themedText. */
  themedText?: boolean
}

/** One primary+secondaries stack, sized to fill `box`. The unit both faces share. */
const QuestionFace = ({
  text,
  language,
  box,
  shown,
  compact = false,
  themedText,
}: QuestionFaceProps) => {
  // `shown` is a fresh array every render, so the memo keys on its content
  const shownKey = shown.map((s) => `${s.language}:${s.text}`).join('\n')
  const {fontSize, secondaryFont, maxFontSizeMultiplier} = useMemo(
    () => fitStack({text, secondaries: shown, width: box.width, height: box.height, compact}),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shownKey stands in for shown
    [text, box.width, box.height, compact, shownKey]
  )
  const primary = (
    <LanguageBlock
      text={text}
      language={language}
      fontSize={fontSize}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      themedText={themedText}
    />
  )

  if (shown.length === 0) return primary

  return (
    <View>
      {primary}
      {shown.map((entry) => (
        <View key={entry.language} className="mt-4">
          <LanguageBlock
            text={entry.text}
            language={entry.language}
            fontSize={secondaryFont}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            muted
            themedText={themedText}
          />
        </View>
      ))}
    </View>
  )
}

/**
 * The seam between Tabletop mode's two mirrored halves (issue #189). A flat
 * `bg-white/10` hairline read as an afterthought, disconnected from the rest of
 * the face. This blends it with the face's own brand accent instead: three
 * same-color bars (`primary-dark`, the same violet as the corner "?" glyph on
 * the card's question face — see pick-player.tsx) at decreasing width and
 * increasing opacity, sharing a center. The outer bar alone is barely visible;
 * the overlap toward the middle reads as the bright center of a fade. That's a
 * deliberate choice over reusing the maze texture image here too: the face
 * already tiles that texture behind the primary/secondary text (at 0.4 opacity,
 * see pick-player.tsx), so a second image layer right at the flip seam would
 * compete with the texture already there rather than read as a seam. The
 * brand's other gradient (`@whocards/tokens` `gradients.primary`) is a CSS
 * `linear-gradient()` string — a web-only value, not something an RN `View`
 * can render without an SVG/gradient dependency this two-line polish item
 * doesn't justify pulling in. Purely decorative, so it carries no
 * accessibility role.
 */
const TabletopDivider = () => (
  <View style={{height: MIRROR_GAP}} className="items-center justify-center">
    <View className="items-center justify-center" style={{width: 96, height: 4}}>
      <View className="bg-primary-dark/10 absolute h-full w-full rounded-full" />
      <View className="bg-primary-dark/25 absolute h-full rounded-full" style={{width: 56}} />
      <View className="bg-primary-dark/50 absolute h-full rounded-full" style={{width: 22}} />
    </View>
  </View>
)

/**
 * The question face: the primary language sized to fill its box, with any
 * secondary display languages rendered smaller and muted below it. Shared by
 * every player so all Games render a Card identically. A secondary missing a
 * translation renders nothing.
 *
 * With `mirrored` (Tabletop mode), the box splits in half: the primary alone on
 * the bottom, and on top, rotated 180°, the first secondary alone (issue #366),
 * or the primary again when there is none. A rotated copy of the primary is
 * hidden from screen readers so it is announced once; a rotated secondary stays
 * readable, so the second language is still heard.
 */
export const QuestionText = ({
  text,
  language,
  box,
  secondaries = [],
  mirrored = false,
  themedText = false,
}: QuestionTextProps) => {
  const shown = secondaries.filter((entry) => entry.text)

  if (!mirrored) {
    return (
      <QuestionFace
        text={text}
        language={language}
        box={box}
        shown={shown}
        themedText={themedText}
      />
    )
  }

  const halfBox = {width: box.width, height: Math.max(0, (box.height - MIRROR_GAP) / 2)}
  const far = shown[0]
  // both halves take the same height so the divider stays centred whatever each language wraps to
  const half = {height: halfBox.height, justifyContent: 'center'} as const

  return (
    <View>
      <View
        accessibilityElementsHidden={!far}
        importantForAccessibility={far ? 'auto' : 'no-hide-descendants'}
        style={[half, {transform: [{rotate: '180deg'}]}]}
      >
        <QuestionFace
          text={far?.text ?? text}
          language={far?.language ?? language}
          box={halfBox}
          shown={[]}
          compact
          themedText={themedText}
        />
      </View>
      <TabletopDivider />
      <View style={half}>
        <QuestionFace
          text={text}
          language={language}
          box={halfBox}
          shown={[]}
          compact
          themedText={themedText}
        />
      </View>
    </View>
  )
}
