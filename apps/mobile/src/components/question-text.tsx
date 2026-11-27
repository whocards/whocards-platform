import {useEffect, useMemo, useRef, useState} from 'react'
import {Text, View} from 'react-native'
import type {SharedValue} from 'react-native-reanimated'
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {getDirection} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import {useIsDark} from '@/lib/color-scheme'
import {MOTION_DURATION, MOTION_EASING, motionDuration} from '@/lib/motion'

// Per-script question face. golos-text (the brand body face) covers Latin + Cyrillic;
// Hebrew and CJK get their bundled Noto faces, the CJK ones subset to the decks' glyphs
// (scripts/subset-cjk-fonts.py).
export const SCRIPT_FONTS: Record<string, string> = {
  he: 'noto-sans-hebrew',
  zh: 'noto-sans-chinese',
  jp: 'noto-sans-japanese',
}

/** The font family for a question in `language`. */
export const questionFontFamily = (language: string): string =>
  SCRIPT_FONTS[language] ?? 'golos-text'

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
 *
 * `minFont` overrides the floor (default MIN_FONT) — split halves (2 languages or
 * Tabletop) pass a lower floor because each half gets ~50% of the box height.
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

/** Greedy word-wrap height at fitFontSize's glyph metrics, on the raw text LanguageBlock renders. */
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

const PRIMARY_SHARE = [1, 0.65, 0.55] as const
const SECONDARY_MIN = 16
const SECONDARY_MAX = 34
const SECONDARY_RATIO = 0.5
const SECONDARY_RATIO_HEADROOM_BONUS = 0.15

/**
 * The secondary language's font size, as a fraction of the (already-fit) primary
 * `primaryFontSize` — kept exported for existing sizing invariants.
 */
export const fitSecondaryFontSize = (primaryFontSize: number, primaryMinFont: number) => {
  const headroom = Math.max(
    0,
    Math.min(1, (primaryFontSize - primaryMinFont) / (MAX_FONT - primaryMinFont))
  )
  const ratio = SECONDARY_RATIO + headroom * SECONDARY_RATIO_HEADROOM_BONUS
  return Math.round(Math.max(SECONDARY_MIN, Math.min(SECONDARY_MAX, primaryFontSize * ratio)))
}

// --- Split layout (shared by 2 languages and Tabletop mode): the box splits evenly
// around the violet divider, so both halves sit at the exact same symmetric distance
// from the bar. Tabletop simply rotates the top half 180° (or mirrors primary if 1 lang).
const MIN_FONT_MIRRORED = 16
export const MIRROR_GAP = 28
export const SECONDARY_GAP = 14

type LanguageText = {language: string; text: string}

const MAX_FONT_SCALE = 4
const FONT_SCALE_STEP = 0.05
const CAP_HEADROOM = 0.85

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

/** Font sizes for one face, plus the largest OS text scale (never below 1) that still fits its box. */
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
  const share = PRIMARY_SHARE[Math.min(secondaries.length, PRIMARY_SHARE.length - 1)] ?? 1
  const fontSize = fitFontSize(text, width, height * share, minFont)
  const secondaryFont = fitSecondaryFontSize(fontSize, minFont)
  const fits = (scale: number) =>
    estimateStackHeight(text, secondaries, fontSize * scale, secondaryFont * scale, width) <=
    height * CAP_HEADROOM
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
   * Secondary display language rendered in the unified 50/50 split layout.
   */
  secondaries?: LanguageText[]
  /**
   * Tabletop mode (issue #148, a Display setting): rotates the top half 180° so two
   * sides of a flat phone can each read one half (secondary on top when set, or
   * mirrored primary when playing in one language).
   */
  mirrored?: boolean
  /**
   * Classic play (issue #173, final): follows the Theme Display setting (`darker` in
   * Light, `white` in Dark). Card surfaces omit this and stay white on the dark Card.
   */
  themedText?: boolean
  /**
   * Optional 0→1 Game-switch progress (`0 = Classic`, `1 = Card`): smoothly morphs text
   * ink from themed Classic (`darker` in Light) to Card `white` with zero fade.
   */
  morphColor?: SharedValue<number>
  /**
   * Optional 0→1 Classic mid-flip peak (`0 = resting`, `1 = 90° edge-on`): when the
   * split divider is visible, shrinks it horizontally into the quiet vertical mid-flip bar.
   */
  flipMid?: SharedValue<number>
  /** Reports the rendered content height so Classic's 1-language flip spine matches the text. */
  onContentHeight?: (height: number) => void
}

/** One language's text block with the right script font, bidi direction, and alignment. */
const LanguageBlock = ({
  text,
  language,
  fontSize,
  maxFontSizeMultiplier,
  themedText,
  morphColor,
}: LanguageText & {
  fontSize: number
  maxFontSizeMultiplier: number
  themedText?: boolean
  morphColor?: SharedValue<number>
}) => {
  const direction = getDirection(language)
  const isDark = useIsDark()

  const animatedColor = useAnimatedStyle(() => {
    if (!morphColor) return {}
    return {
      color: isDark
        ? colors.white
        : interpolateColor(morphColor.get(), [0.18, 0.68], [colors.darker, colors.white]),
    }
  })

  const textAlign: 'right' | 'left' = direction === 'rtl' ? 'right' : 'left'
  const baseStyle = {
    fontSize,
    lineHeight: fontSize * LINE_HEIGHT_RATIO,
    writingDirection: direction,
    // writingDirection sets the bidi base direction but not paragraph
    // alignment in RN — RTL (Hebrew) needs textAlign to right-align
    textAlign,
    fontFamily: questionFontFamily(language),
  }

  if (morphColor) {
    return (
      <Animated.Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[baseStyle, animatedColor]}
      >
        {text}
      </Animated.Text>
    )
  }

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      className={themedText ? 'text-darker dark:text-white' : 'text-white'}
      style={baseStyle}
    >
      {text}
    </Text>
  )
}

type QuestionFaceProps = {
  text: string
  language: string
  box: {width: number; height: number}
  /** The lower font floor of a split half (see MIN_FONT_MIRRORED). */
  compact?: boolean
  themedText?: boolean
  morphColor?: SharedValue<number>
}

/** One language sized to fill `box`. Shared by single-language and split halves. */
const QuestionFace = ({
  text,
  language,
  box,
  compact = false,
  themedText,
  morphColor,
}: QuestionFaceProps) => {
  const {fontSize, maxFontSizeMultiplier} = useMemo(
    () => fitStack({text, secondaries: [], width: box.width, height: box.height, compact}),
    [text, box.width, box.height, compact]
  )
  return (
    <LanguageBlock
      text={text}
      language={language}
      fontSize={fontSize}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      themedText={themedText}
      morphColor={morphColor}
    />
  )
}

/**
 * The seam between split halves (2 languages or Tabletop). Three concentric violet
 * bars create soft tapered ends without a gradient dependency. When `flipMid` peaks
 * at 90° during a Classic flip, the horizontal bar smoothly shrinks into a quiet
 * vertical bar in the same mid-violet colour.
 */
export const SplitDivider = ({
  reveal,
  flipMid,
}: {
  reveal?: SharedValue<number>
  flipMid?: SharedValue<number>
}) => {
  const horizStyle = useAnimatedStyle(() => {
    const rev = reveal ? interpolate(reveal.get(), [0.55, 0.95], [0, 1], 'clamp') : 1
    const mid = flipMid ? flipMid.get() : 0
    return {
      opacity: rev * Math.max(0, 1 - mid * 1.15),
      transform: [{scaleX: Math.max(0.04, rev * (1 - mid * 0.95))}],
    }
  })

  return (
    <View style={{height: MIRROR_GAP}} className="items-center justify-center">
      <Animated.View
        className="items-center justify-center"
        style={[{width: 96, height: 4}, horizStyle]}
      >
        <View className="bg-primary-dark/10 absolute h-full w-full rounded-full" />
        <View className="bg-primary-dark/25 absolute h-full rounded-full" style={{width: 56}} />
        <View className="bg-primary-dark/50 absolute h-full rounded-full" style={{width: 22}} />
      </Animated.View>
    </View>
  )
}

/**
 * The question face: single language fills its box; with a second language or
 * Tabletop mode, the box splits evenly around the violet divider with exact
 * symmetric spacing above and below the bar.
 *
 * Animations (3A-i / 3B / 3C):
 * - Adding a 2nd language (or enabling 1-lang Tabletop): the emerging half slides
 *   out from behind the primary text and the divider draws only once the gap clears.
 * - Toggling Tabletop while 2 languages are active: the top half performs the same
 *   quiet 3D flip (`rotateX`) to invert cleanly in place.
 */
export const QuestionText = ({
  text,
  language,
  box,
  secondaries = [],
  mirrored = false,
  themedText = false,
  morphColor,
  flipMid,
  onContentHeight,
}: QuestionTextProps) => {
  const reduceMotion = useReducedMotion()
  const shown = secondaries.filter((entry) => entry.text)
  const secondaryEntry = shown[0]
  const isSplit = mirrored || secondaryEntry !== undefined

  // Smooth split entrance (0 → 1) when entering 2-language or 1-lang Tabletop from single view.
  const splitProgress = useSharedValue(isSplit ? 1 : 0)
  const prevSplitRef = useRef(isSplit)

  // Quiet rotateX flip when toggling Tabletop while already split (3B).
  // `overrideMirrored` only holds the outgoing orientation mid-flip; at rest it is null
  // so `displayedMirrored` tracks the `mirrored` prop directly with no sync setState in effects.
  const [overrideMirrored, setOverrideMirrored] = useState<boolean | null>(null)
  const tabletopFlip = useSharedValue(0)
  const prevMirroredRef = useRef(mirrored)
  const displayedMirrored = overrideMirrored ?? mirrored

  useEffect(() => {
    const wasSplit = prevSplitRef.current
    const wasMirrored = prevMirroredRef.current
    prevSplitRef.current = isSplit
    prevMirroredRef.current = mirrored

    const dur = motionDuration(MOTION_DURATION.layoutSplit, reduceMotion)

    if (isSplit !== wasSplit) {
      if (isSplit) {
        splitProgress.set(0)
        splitProgress.set(withTiming(1, {duration: dur, easing: MOTION_EASING.standard}))
      } else {
        splitProgress.set(0)
      }
      return undefined
    }

    if (isSplit && mirrored !== wasMirrored && dur > 0) {
      const half = Math.round(dur / 2)
      const swap = () => {
        setOverrideMirrored(null)
        tabletopFlip.set(-1)
        tabletopFlip.set(withTiming(0, {duration: half, easing: MOTION_EASING.enter}))
      }
      const raf = requestAnimationFrame(() => setOverrideMirrored(wasMirrored))
      tabletopFlip.set(0)
      tabletopFlip.set(
        withTiming(1, {duration: half, easing: MOTION_EASING.exit}, (finished) => {
          'worklet'
          if (finished) runOnJS(swap)()
        })
      )
      return () => cancelAnimationFrame(raf)
    }
    return undefined
  }, [isSplit, mirrored, reduceMotion, splitProgress, tabletopFlip])

  const halfHeight = Math.max(0, (box.height - MIRROR_GAP) / 2)
  const halfBox = {width: box.width, height: halfHeight}

  // Primary glides subtly from center into its split half; emerging half slides out from behind it.
  const slideOffset = Math.min(90, halfHeight * 0.5)
  const topEmergingStyle = useAnimatedStyle(() => {
    const p = splitProgress.get()
    const flip = tabletopFlip.get()
    return {
      transform: [
        {perspective: 800},
        {translateY: interpolate(p, [0, 1], [slideOffset, 0], 'clamp')},
        {rotateX: `${flip * 90}deg`},
      ],
    }
  })

  const bottomEmergingStyle = useAnimatedStyle(() => {
    const p = splitProgress.get()
    return {
      transform: [{translateY: interpolate(p, [0, 1], [-slideOffset, 0], 'clamp')}],
    }
  })

  if (!isSplit) {
    return (
      <View
        onLayout={
          onContentHeight ? (event) => onContentHeight(event.nativeEvent.layout.height) : undefined
        }
      >
        <QuestionFace
          text={text}
          language={language}
          box={box}
          themedText={themedText}
          morphColor={morphColor}
        />
      </View>
    )
  }

  // Unified 50/50 split geometry:
  // - Top half sits flush above the divider (`justifyContent: 'flex-end'`).
  // - Bottom half sits flush below the divider (`justifyContent: 'flex-start'`).
  // - `SplitDivider` (`height: MIRROR_GAP`) centers the 4px violet bar dead between them,
  //   so both blocks always sit at the exact same symmetric distance from the line.
  //
  // Language assignment:
  // - Tabletop (`displayedMirrored`): far/top rotated 180° is secondary (or mirrored primary),
  //   near/bottom upright is primary (issue #366).
  // - Upright 2 languages: primary on top, secondary on bottom.
  const topText = displayedMirrored ? (secondaryEntry?.text ?? text) : text
  const topLang = displayedMirrored ? (secondaryEntry?.language ?? language) : language
  const bottomText = displayedMirrored ? text : (secondaryEntry?.text ?? text)
  const bottomLang = displayedMirrored ? language : (secondaryEntry?.language ?? language)
  const topIsDuplicate = displayedMirrored && !secondaryEntry

  return (
    <View
      onLayout={
        onContentHeight ? (event) => onContentHeight(event.nativeEvent.layout.height) : undefined
      }
    >
      <View
        accessibilityElementsHidden={topIsDuplicate}
        importantForAccessibility={topIsDuplicate ? 'no-hide-descendants' : 'auto'}
        style={{height: halfHeight, justifyContent: 'flex-end', overflow: 'hidden'}}
      >
        <Animated.View style={topEmergingStyle}>
          <View style={displayedMirrored ? {transform: [{rotate: '180deg'}]} : undefined}>
            <QuestionFace
              text={topText}
              language={topLang}
              box={halfBox}
              compact
              themedText={themedText}
              morphColor={morphColor}
            />
          </View>
        </Animated.View>
      </View>
      <SplitDivider reveal={splitProgress} flipMid={flipMid} />
      <View style={{height: halfHeight, justifyContent: 'flex-start', overflow: 'hidden'}}>
        <Animated.View style={bottomEmergingStyle}>
          <QuestionFace
            text={bottomText}
            language={bottomLang}
            box={halfBox}
            compact
            themedText={themedText}
            morphColor={morphColor}
          />
        </Animated.View>
      </View>
    </View>
  )
}
