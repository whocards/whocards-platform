import {useEffect, useMemo, useRef, useState} from 'react'
import {Text, View} from 'react-native'
import type {SharedValue} from 'react-native-reanimated'
import Animated, {
  cancelAnimation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
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
// Wait briefly for the in-play Settings sheet to clear before animating layout splits/flips.
const SHEET_REVEAL_DELAY_MS = 160

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
   * Stable Question identity (e.g. questionId). Changing `questionKey` updates the face
   * immediately (Classic Flip/Slide owns that transition); keeping `questionKey` while
   * changing language/secondaries/mirrored animates only the changed half cleanly.
   */
  questionKey?: string
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
 * at 90° during a Classic flip, the horizontal bar smoothly shrinks into the quiet
 * vertical mid-violet bar rendered outside the rotating layer.
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

type SplitSnapshot = {
  questionKey: string | undefined
  text: string
  language: string
  secondaryText: string | undefined
  secondaryLang: string | undefined
  mirrored: boolean
  isSplit: boolean
}

const halvesOf = (snap: SplitSnapshot) => {
  // Language assignment (issue #366):
  // - Tabletop (`mirrored`): near/bottom upright = primary, far/top rotated 180° = secondary (or mirrored primary).
  // - Upright 2 languages: top = primary, bottom = secondary.
  const topText = snap.mirrored ? (snap.secondaryText ?? snap.text) : snap.text
  const topLang = snap.mirrored ? (snap.secondaryLang ?? snap.language) : snap.language
  const bottomText = snap.mirrored ? snap.text : (snap.secondaryText ?? snap.text)
  const bottomLang = snap.mirrored ? snap.language : (snap.secondaryLang ?? snap.language)
  const topIsDuplicate = snap.mirrored && snap.secondaryText === undefined
  return {topText, topLang, bottomText, bottomLang, topIsDuplicate}
}

const sameSnapshot = (a: SplitSnapshot, b: SplitSnapshot) =>
  a.questionKey === b.questionKey &&
  a.text === b.text &&
  a.language === b.language &&
  a.secondaryText === b.secondaryText &&
  a.secondaryLang === b.secondaryLang &&
  a.mirrored === b.mirrored &&
  a.isSplit === b.isSplit

/**
 * The question face: single language fills its box; with a second language or
 * Tabletop mode, the box splits evenly around the violet divider with exact
 * symmetric spacing above and below the bar.
 *
 * Minimum-movement transitions across all 4 states (1-lang, 1-lang Tabletop,
 * 2-lang upright, 2-lang Tabletop):
 * - Entering split from 1 language: the existing primary stays visible and gently
 *   settles into its half (unclipped) while ONLY the new half slides cleanly out
 *   from behind the seam and the divider draws in once clear.
 * - Leaving split back to 1 language: the departing half tucks back behind the seam,
 *   the divider retracts, and primary glides back to center.
 * - Changing settings while already split (Tabletop on/off, adding/removing 2nd lang
 *   in Tabletop, switching primary or secondary language): any unchanged half stays
 *   0px still; ONLY the half(ves) whose content/orientation changed do a quiet rotateX
 *   flip, swapping at 90° edge-on with zero frame-0 flash or teleport.
 */
export const QuestionText = ({
  text,
  language,
  box,
  questionKey,
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

  const incoming: SplitSnapshot = useMemo(
    () => ({
      questionKey,
      text,
      language,
      secondaryText: secondaryEntry?.text,
      secondaryLang: secondaryEntry?.language,
      mirrored,
      isSplit,
    }),
    [questionKey, text, language, secondaryEntry?.text, secondaryEntry?.language, mirrored, isSplit]
  )

  // `displayed` holds the currently rendered layout/content so frame 0 of a Tabletop or
  // language change never flashes the new state before a flip reaches 90° or a collapse finishes.
  const [displayed, setDisplayed] = useState<SplitSnapshot>(incoming)
  const displayedRef = useRef<SplitSnapshot>(incoming)

  // Sync immediately when navigating to a different Question (Classic Flip/Slide owns that motion).
  const isNewQuestion =
    questionKey !== undefined
      ? displayed.questionKey !== questionKey
      : displayed.text !== text && displayed.language === language

  const activeSnap = isNewQuestion ? incoming : displayed

  // Only clip the emerging/departing half during S1 ↔ split slide animations so primary
  // text and rotateX flips never get clipped by half-box bounds.
  const [clipSide, setClipSide] = useState<'none' | 'top' | 'bottom'>('none')

  // 0 = collapsed behind seam, 1 = full resting split.
  const splitProgress = useSharedValue(activeSnap.isSplit ? 1 : 0)
  // Which half is the emerging/departing one during S1 ↔ split:
  // +1 = bottom emerges (S1 ↔ 2-lang upright: top primary stays anchored)
  // -1 = top emerges (S1 ↔ Tabletop: bottom upright primary stays anchored)
  const emergingSide = useSharedValue<number>(activeSnap.mirrored ? -1 : 1)
  // Quiet rotateX flips (0 = face-on, ±1 = ±90° edge-on) independently per half so an
  // unchanged half stays 100% still.
  const topFlip = useSharedValue(0)
  const bottomFlip = useSharedValue(0)

  useEffect(() => {
    const prev = displayedRef.current
    if (sameSnapshot(prev, incoming)) return

    const commit = (next: SplitSnapshot) => {
      displayedRef.current = next
      setDisplayed(next)
    }

    const dur = motionDuration(MOTION_DURATION.layoutSplit, reduceMotion)
    const navigated =
      incoming.questionKey !== undefined
        ? prev.questionKey !== incoming.questionKey
        : prev.text !== incoming.text && prev.language === incoming.language

    // Different Question or Reduce Motion: snap cleanly with zero split/flip animation.
    if (navigated || dur === 0) {
      cancelAnimation(splitProgress)
      cancelAnimation(topFlip)
      cancelAnimation(bottomFlip)
      splitProgress.set(incoming.isSplit ? 1 : 0)
      emergingSide.set(incoming.mirrored ? -1 : 1)
      topFlip.set(0)
      bottomFlip.set(0)
      setClipSide('none')
      commit(incoming)
      return
    }

    const delay = motionDuration(SHEET_REVEAL_DELAY_MS, reduceMotion)

    // Case 1: Single → Split (S1 → S2 / S3 / S4)
    // Existing primary stays unclipped and settles gently into its half while ONLY the new
    // half slides out from behind the seam.
    if (!prev.isSplit && incoming.isSplit) {
      cancelAnimation(splitProgress)
      cancelAnimation(topFlip)
      cancelAnimation(bottomFlip)
      topFlip.set(0)
      bottomFlip.set(0)
      emergingSide.set(incoming.mirrored ? -1 : 1)
      setClipSide(incoming.mirrored ? 'top' : 'bottom')
      splitProgress.set(0)
      commit(incoming)
      splitProgress.set(
        withDelay(
          delay,
          withTiming(1, {duration: dur, easing: MOTION_EASING.standard}, (finished) => {
            'worklet'
            if (finished) runOnJS(setClipSide)('none')
          })
        )
      )
      return
    }

    // Case 2: Split → Single (S2 / S3 / S4 → S1)
    // Keep the departing split mounted while the leaving half tucks cleanly back behind primary.
    if (prev.isSplit && !incoming.isSplit) {
      cancelAnimation(splitProgress)
      cancelAnimation(topFlip)
      cancelAnimation(bottomFlip)
      topFlip.set(0)
      bottomFlip.set(0)
      emergingSide.set(prev.mirrored ? -1 : 1)
      setClipSide(prev.mirrored ? 'top' : 'bottom')
      splitProgress.set(1)
      splitProgress.set(
        withDelay(
          delay,
          withTiming(0, {duration: dur, easing: MOTION_EASING.standard}, (finished) => {
            'worklet'
            if (finished) {
              runOnJS(setClipSide)('none')
              runOnJS(commit)(incoming)
            }
          })
        )
      )
      return
    }

    // Case 3: Split → Split (S2 ↔ S4, S3 ↔ S4, or language change while split)
    // Keep any unchanged half 100% still; flip ONLY the half(ves) whose text/orientation changed!
    if (prev.isSplit && incoming.isSplit) {
      const prevH = halvesOf(prev)
      const nextH = halvesOf(incoming)
      const topChanged =
        prevH.topText !== nextH.topText ||
        prevH.topLang !== nextH.topLang ||
        prev.mirrored !== incoming.mirrored
      const bottomChanged =
        prevH.bottomText !== nextH.bottomText || prevH.bottomLang !== nextH.bottomLang

      if (!topChanged && !bottomChanged) {
        commit(incoming)
        return
      }

      const half = Math.round(dur / 2)
      const swap = () => {
        commit(incoming)
        if (topChanged) {
          topFlip.set(-1)
          topFlip.set(withTiming(0, {duration: half, easing: MOTION_EASING.enter}))
        }
        if (bottomChanged) {
          bottomFlip.set(-1)
          bottomFlip.set(withTiming(0, {duration: half, easing: MOTION_EASING.enter}))
        }
      }

      cancelAnimation(topFlip)
      cancelAnimation(bottomFlip)
      if (topChanged) {
        topFlip.set(0)
        topFlip.set(
          withDelay(
            delay,
            withTiming(1, {duration: half, easing: MOTION_EASING.exit}, (finished) => {
              'worklet'
              if (finished) runOnJS(swap)()
            })
          )
        )
      }
      if (bottomChanged) {
        bottomFlip.set(0)
        bottomFlip.set(
          withDelay(
            delay,
            withTiming(1, {duration: half, easing: MOTION_EASING.exit}, (finished) => {
              'worklet'
              // Only drive `swap` from bottomFlip when topFlip isn't already driving it.
              if (finished && !topChanged) runOnJS(swap)()
            })
          )
        )
      }
      return
    }

    // Case 4: Single → Single (primary language changed while in 1-language view)
    commit(incoming)
  }, [incoming, reduceMotion, splitProgress, emergingSide, topFlip, bottomFlip])

  const halfHeight = Math.max(0, (box.height - MIRROR_GAP) / 2)
  const halfBox = {width: box.width, height: halfHeight}

  // Anchor half settles gently without crossing the seam; emerging/departing half travels
  // the full halfHeight so even multi-line Questions tuck 100% cleanly behind the seam with
  // zero overlap or peeking lines.
  const slideOffset = halfHeight
  const anchorSettle = Math.min(14, halfHeight * 0.1)

  const topHalfStyle = useAnimatedStyle(() => {
    const p = splitProgress.get()
    const flip = topFlip.get()
    // If top is emerging (emergingSide < 0, Tabletop), slide up from +slideOffset;
    // otherwise top is the upright primary anchor and settles gently from +anchorSettle.
    const startY = emergingSide.get() < 0 ? slideOffset : anchorSettle
    return {
      transform: [
        {perspective: 800},
        {translateY: interpolate(p, [0, 1], [startY, 0], 'clamp')},
        {rotateX: `${flip * 90}deg`},
      ],
    }
  })

  const bottomHalfStyle = useAnimatedStyle(() => {
    const p = splitProgress.get()
    const flip = bottomFlip.get()
    // If bottom is emerging (emergingSide > 0, 2-lang upright), slide down from -slideOffset;
    // otherwise bottom is the upright primary anchor and settles gently from -anchorSettle.
    const startY = emergingSide.get() > 0 ? -slideOffset : -anchorSettle
    return {
      transform: [
        {perspective: 800},
        {translateY: interpolate(p, [0, 1], [startY, 0], 'clamp')},
        {rotateX: `${flip * 90}deg`},
      ],
    }
  })

  if (!activeSnap.isSplit) {
    return (
      <View
        onLayout={
          onContentHeight ? (event) => onContentHeight(event.nativeEvent.layout.height) : undefined
        }
      >
        <QuestionFace
          text={activeSnap.text}
          language={activeSnap.language}
          box={box}
          themedText={themedText}
          morphColor={morphColor}
        />
      </View>
    )
  }

  const {topText, topLang, bottomText, bottomLang, topIsDuplicate} = halvesOf(activeSnap)

  return (
    <View
      onLayout={
        onContentHeight ? (event) => onContentHeight(event.nativeEvent.layout.height) : undefined
      }
    >
      <View
        accessibilityElementsHidden={topIsDuplicate}
        importantForAccessibility={topIsDuplicate ? 'no-hide-descendants' : 'auto'}
        style={{
          height: halfHeight,
          justifyContent: 'flex-end',
          overflow: clipSide === 'top' ? 'hidden' : 'visible',
        }}
      >
        <Animated.View style={topHalfStyle}>
          <View style={activeSnap.mirrored ? {transform: [{rotate: '180deg'}]} : undefined}>
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
      <View
        style={{
          height: halfHeight,
          justifyContent: 'flex-start',
          overflow: clipSide === 'bottom' ? 'hidden' : 'visible',
        }}
      >
        <Animated.View style={bottomHalfStyle}>
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
