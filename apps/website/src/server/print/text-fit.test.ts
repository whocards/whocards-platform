import {describe, expect, it} from 'vitest'

import {fitText, wrapToWidth, type FontMetrics} from './text-fit'

// A fake monospace-ish metric: width = size * 0.6 per character. Deterministic
// and gives full control over wrap points without needing a real font.
const monoFont: FontMetrics = {
  widthOfTextAtSize: (text, size) => text.length * size * 0.6,
}

describe('wrapToWidth', () => {
  it('keeps a short line intact', () => {
    expect(wrapToWidth('hi there', monoFont, 10, 1000)).toEqual(['hi there'])
  })

  it('wraps long text onto multiple lines within the width budget', () => {
    const lines = wrapToWidth('one two three four five six', monoFont, 10, 30)
    for (const line of lines) {
      expect(monoFont.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(30)
    }
    expect(lines.join(' ')).toBe('one two three four five six')
  })

  it('respects existing newlines as hard breaks', () => {
    const lines = wrapToWidth('short\n\nsecond part', monoFont, 10, 1000)
    expect(lines).toEqual(['short', '', 'second part'])
  })

  it('never drops a single very long word even if it overflows', () => {
    const lines = wrapToWidth('supercalifragilisticexpialidocious', monoFont, 10, 5)
    expect(lines).toEqual(['supercalifragilisticexpialidocious'])
  })

  // CJK text has no spaces, so 'word' mode (splitting on whitespace) would
  // treat a whole paragraph as one unbreakable "word" and never wrap it (#41).
  it('(word mode) never breaks a space-less CJK line, even though it overflows', () => {
    const lines = wrapToWidth('你最近學到最有趣的事物是什麼', monoFont, 10, 20)
    expect(lines).toEqual(['你最近學到最有趣的事物是什麼'])
  })

  it("('cjk' mode) wraps per character within the width budget", () => {
    const text = '你最近學到最有趣的事物是什麼'
    const lines = wrapToWidth(text, monoFont, 10, 20, 'cjk')
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(monoFont.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(20)
    }
    expect(lines.join('')).toBe(text)
  })

  it("('cjk' mode) still respects existing newlines as hard breaks", () => {
    const lines = wrapToWidth('短い\n\n二番目の部分', monoFont, 10, 1000, 'cjk')
    expect(lines).toEqual(['短い', '', '二番目の部分'])
  })
})

describe('fitText', () => {
  it('picks the max size when the text fits comfortably', () => {
    const {size, lines} = fitText('hi', monoFont, {
      maxWidth: 500,
      maxHeight: 500,
      minSize: 8,
      maxSize: 24,
      lineHeightMultiplier: 1.2,
    })
    expect(size).toBe(24)
    expect(lines).toEqual(['hi'])
  })

  it('shrinks the font until long text fits the box', () => {
    const longText = 'word '.repeat(60).trim()
    const {size, lines, lineHeight} = fitText(longText, monoFont, {
      maxWidth: 200,
      maxHeight: 150,
      minSize: 6,
      maxSize: 40,
      lineHeightMultiplier: 1.2,
    })
    expect(size).toBeLessThan(40)
    expect(lines.length * lineHeight).toBeLessThanOrEqual(150)
  })

  it('falls back to minSize instead of throwing when nothing fits', () => {
    const hugeText = 'word '.repeat(500).trim()
    const {size} = fitText(hugeText, monoFont, {
      maxWidth: 50,
      maxHeight: 20,
      minSize: 6,
      maxSize: 12,
      lineHeightMultiplier: 1.2,
    })
    expect(size).toBe(6)
  })

  it("shrinks and wraps a space-less CJK question in 'cjk' mode (#41)", () => {
    const text = '你最近學到最有趣的事物是什麼'.repeat(3)
    const {size, lines, lineHeight} = fitText(text, monoFont, {
      maxWidth: 200,
      maxHeight: 150,
      minSize: 6,
      maxSize: 40,
      lineHeightMultiplier: 1.2,
      mode: 'cjk',
    })
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.length * lineHeight).toBeLessThanOrEqual(150)
    for (const line of lines) {
      expect(monoFont.widthOfTextAtSize(line, size)).toBeLessThanOrEqual(200)
    }
    expect(lines.join('')).toBe(text)
  })
})
