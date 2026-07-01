// Pure text-wrapping + auto-shrink-to-fit for the print card question text
// (epic #19, ticket #38; CJK wrap mode added in #41). Only depends on a
// font's width metrics — not on pdf-lib itself — so it's unit-testable
// without ever creating a PDFDocument.

/** The slice of `PDFFont`'s API this module actually needs. */
export type FontMetrics = {
  widthOfTextAtSize: (text: string, size: number) => number
}

/**
 * `word` breaks on whitespace (every Latin/Cyrillic/Hebrew Pool language).
 * `cjk` breaks per character — Mandarin/Japanese text has no spaces between
 * "words", so whitespace-wrapping would never break a long line at all.
 */
export type WrapMode = 'word' | 'cjk'

export type FitTextOptions = {
  /** Max width a wrapped line may take, in the same unit as font sizes (pt). */
  maxWidth: number
  /** Max total height the stacked lines may take (pt). */
  maxHeight: number
  minSize: number
  maxSize: number
  /** Line height as a multiple of font size (e.g. 1.2). */
  lineHeightMultiplier: number
  /** @default 'word' */
  mode?: WrapMode
}

export type FitTextResult = {
  lines: string[]
  size: number
  lineHeight: number
}

// Some Pool languages write a real space before terminal punctuation (French
// "… ?", Hebrew "… ?"), which `split(/\s+/)` turns into a standalone token.
const PURE_PUNCTUATION = /^[\p{P}\p{S}]+$/u

const wrapWordParagraph = (
  paragraph: string,
  font: FontMetrics,
  size: number,
  maxWidth: number
): string[] => {
  const out: string[] = []
  const words = paragraph.split(/\s+/).filter(Boolean)
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    // A pure-punctuation token never starts a line of its own — glue it to the
    // previous word even past maxWidth; `fitText`'s width check absorbs the
    // overflow by shrinking the size.
    const glue = current !== '' && PURE_PUNCTUATION.test(word)
    if (current && !glue && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      out.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) out.push(current)
  return out
}

// CJK text has no word boundaries, so wrap greedily per character instead
// (`Array.from` so any glyph outside the BMP splits on code points, not
// UTF-16 code units).
const wrapCjkParagraph = (
  paragraph: string,
  font: FontMetrics,
  size: number,
  maxWidth: number
): string[] => {
  const out: string[] = []
  let current = ''
  for (const char of Array.from(paragraph)) {
    const candidate = current + char
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      out.push(current)
      current = char
    } else {
      current = candidate
    }
  }
  if (current) out.push(current)
  return out
}

/**
 * Greedily wrap `text` into lines no wider than `maxWidth` at the given size.
 * Existing `\n` breaks (the Pool uses `\n\n` between a question and its
 * parenthetical sub-clause) are always respected as hard line breaks.
 */
export const wrapToWidth = (
  text: string,
  font: FontMetrics,
  size: number,
  maxWidth: number,
  mode: WrapMode = 'word'
): string[] => {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('')
      continue
    }
    out.push(
      ...(mode === 'cjk'
        ? wrapCjkParagraph(paragraph, font, size, maxWidth)
        : wrapWordParagraph(paragraph, font, size, maxWidth))
    )
  }
  return out
}

/**
 * Pick the largest font size in `[minSize, maxSize]` whose wrapped lines fit
 * within the box. Falls back to `minSize` (possibly overflowing slightly)
 * rather than throwing — a too-long question shouldn't break the whole PDF.
 */
export const fitText = (text: string, font: FontMetrics, opts: FitTextOptions): FitTextResult => {
  const {maxWidth, maxHeight, minSize, maxSize, lineHeightMultiplier, mode = 'word'} = opts
  for (let size = maxSize; size >= minSize; size -= 1) {
    const lines = wrapToWidth(text, font, size, maxWidth, mode)
    const lineHeight = size * lineHeightMultiplier
    const widest = Math.max(...lines.map((line) => font.widthOfTextAtSize(line, size)))
    if (lines.length * lineHeight <= maxHeight && widest <= maxWidth) {
      return {lines, size, lineHeight}
    }
  }
  const lines = wrapToWidth(text, font, minSize, maxWidth, mode)
  return {lines, size: minSize, lineHeight: minSize * lineHeightMultiplier}
}
