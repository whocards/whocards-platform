// Pure text-wrapping + auto-shrink-to-fit for the print card question text
// (epic #19, ticket #38). Only depends on a font's width metrics — not on
// pdf-lib itself — so it's unit-testable without ever creating a PDFDocument.

/** The slice of `PDFFont`'s API this module actually needs. */
export type FontMetrics = {
  widthOfTextAtSize: (text: string, size: number) => number
}

export type FitTextOptions = {
  /** Max width a wrapped line may take, in the same unit as font sizes (pt). */
  maxWidth: number
  /** Max total height the stacked lines may take (pt). */
  maxHeight: number
  minSize: number
  maxSize: number
  /** Line height as a multiple of font size (e.g. 1.2). */
  lineHeightMultiplier: number
}

export type FitTextResult = {
  lines: string[]
  size: number
  lineHeight: number
}

/**
 * Greedily wrap `text` into lines no wider than `maxWidth` at the given size.
 * Existing `\n` breaks (the Pool uses `\n\n` between a question and its
 * parenthetical sub-clause) are always respected as hard line breaks.
 */
export const wrapToWidth = (text: string, font: FontMetrics, size: number, maxWidth: number): string[] => {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('')
      continue
    }
    const words = paragraph.split(/\s+/).filter(Boolean)
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        out.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) out.push(current)
  }
  return out
}

/**
 * Pick the largest font size in `[minSize, maxSize]` whose wrapped lines fit
 * within the box. Falls back to `minSize` (possibly overflowing slightly)
 * rather than throwing — a too-long question shouldn't break the whole PDF.
 */
export const fitText = (text: string, font: FontMetrics, opts: FitTextOptions): FitTextResult => {
  const {maxWidth, maxHeight, minSize, maxSize, lineHeightMultiplier} = opts
  for (let size = maxSize; size >= minSize; size -= 1) {
    const lines = wrapToWidth(text, font, size, maxWidth)
    const lineHeight = size * lineHeightMultiplier
    const widest = Math.max(...lines.map((line) => font.widthOfTextAtSize(line, size)))
    if (lines.length * lineHeight <= maxHeight && widest <= maxWidth) {
      return {lines, size, lineHeight}
    }
  }
  const lines = wrapToWidth(text, font, minSize, maxWidth)
  return {lines, size: minSize, lineHeight: minSize * lineHeightMultiplier}
}
