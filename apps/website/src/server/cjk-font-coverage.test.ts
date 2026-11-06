import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {create} from '@pdf-lib/fontkit'
import {pool} from '@whocards/decks/pool'
import {describe, expect, it} from 'vitest'
import {decompress} from 'wawoff2'

// A code point missing from the cmap is what renders as a .notdef tofu box on a
// Share Card, so checking every Pool question against the cmap covers every render.
const FONTS = {
  zh: 'noto-sans-chinese',
  jp: 'noto-sans-japanese',
} as const

const fontDir = join(import.meta.dirname, '..', '..', 'public', 'fonts')

describe.each(Object.entries(FONTS))('%s Pool questions', (language, font) => {
  it.each(['regular', 'bold'])(`have every glyph in ${font}_%s`, async (weight) => {
    const ttf = await decompress(await readFile(join(fontDir, `${font}_${weight}.woff2`)))
    const fontFile = create(ttf)
    const missing = Object.entries(pool).flatMap(([id, texts]) => {
      const chars = [...new Set(texts[language] ?? '')].filter(
        (char) => !/\s/.test(char) && !fontFile.hasGlyphForCodePoint(char.codePointAt(0)!)
      )
      return chars.length ? [`${id}: ${chars.join(' ')}`] : []
    })
    expect(missing).toEqual([])
  })
})
