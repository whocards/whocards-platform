/**
 * The bundled Noto CJK faces are subset to the decks' and the app's own words (issue #1), so a
 * deck or catalog change that adds a character must re-run `pnpm -F mobile fonts:cjk` or ship tofu.
 * The UI's `font-sans` follows the same faces (app/_layout.tsx), since iOS falls back elsewhere.
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {getAllDecks} from '@whocards/decks'

import {SCRIPT_FONTS} from '@/components/question-text'
import {NATIVE_LANGUAGE_NAMES} from '@/lib/language-names'

/** Every codepoint a TrueType font maps to a glyph, read from its cmap's format 4 and 12 subtables. */
const mappedCodepoints = (file: string) => {
  const font = readFileSync(file)
  const tables = font.readUInt16BE(4)
  let cmap = -1
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16
    if (font.toString('latin1', record, record + 4) === 'cmap') cmap = font.readUInt32BE(record + 8)
  }
  const mapped = new Set<number>()
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const sub = cmap + font.readUInt32BE(cmap + 8 + i * 8)
    const format = font.readUInt16BE(sub)
    if (format === 4) {
      const segX2 = font.readUInt16BE(sub + 6)
      const ends = sub + 14
      const starts = ends + segX2 + 2
      const deltas = starts + segX2
      const rangeOffsets = deltas + segX2
      for (let s = 0; s < segX2; s += 2) {
        const delta = font.readUInt16BE(deltas + s)
        const rangeOffset = font.readUInt16BE(rangeOffsets + s)
        const start = font.readUInt16BE(starts + s)
        for (let c = start; c <= font.readUInt16BE(ends + s); c++) {
          if (c === 0xffff) break
          const indexed =
            rangeOffset === 0
              ? c
              : font.readUInt16BE(rangeOffsets + s + rangeOffset + 2 * (c - start))
          if (rangeOffset !== 0 && indexed === 0) continue
          if ((indexed + delta) % 0x10000 !== 0) mapped.add(c)
        }
      }
    } else if (format === 12) {
      for (let g = 0; g < font.readUInt32BE(sub + 12); g++) {
        const group = sub + 16 + g * 12
        const start = font.readUInt32BE(group)
        const startGlyph = font.readUInt32BE(group + 8)
        for (let c = start; c <= font.readUInt32BE(group + 4); c++) {
          if (startGlyph + (c - start) !== 0) mapped.add(c)
        }
      }
    }
  }
  return mapped
}

describe.each(Object.keys(SCRIPT_FONTS))('the %s face', (language) => {
  const mapped = mappedCodepoints(
    path.join(__dirname, `../../assets/fonts/${SCRIPT_FONTS[language]}.ttf`)
  )
  const missing = (text: string) =>
    [...new Set(text.replace(/\s/g, ''))]
      .filter((char) => !mapped.has(char.codePointAt(0) ?? 0))
      .join('')

  it('has a glyph for every character the decks show in it', () => {
    const shown = getAllDecks()
      .flatMap((deck) => Object.values(deck.questions).map((question) => question[language] ?? ''))
      .join('')
    expect(shown.length).toBeGreaterThan(0)
    expect(missing(shown)).toBe('')
  })

  it('has a glyph for every character of the app in that language', () => {
    const catalog: Record<string, string> = JSON.parse(
      readFileSync(path.join(__dirname, `../i18n/${language}.json`), 'utf8')
    )
    expect(missing(Object.values(catalog).join('') + NATIVE_LANGUAGE_NAMES[language])).toBe('')
  })
})
