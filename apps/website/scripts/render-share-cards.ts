import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {renderCardPng} from '../src/server/card-image'

/**
 * Dev-only tool for issue #161: render a representative matrix of Share Card
 * PNGs to disk so a design pass can be judged against real output instead of
 * guessing at CSS. Not part of the build — run from apps/website with:
 *
 *   pnpm exec tsx scripts/render-share-cards.ts <outDir>
 *
 * `outDir` is relative to apps/website (pnpm --filter website exec's cwd).
 * The repo's design-review PNGs live outside apps/website, at the repo-root
 * docs/design/<issue>/{before,after} (see docs/design/163-light-mode for the
 * established convention) — pass e.g. `../../docs/design/161-share-card-polish/after`.
 *
 * Matrix: short + long question, English + Hebrew (RTL) + Mandarin (CJK) +
 * Japanese (CJK), at all three card sizes (og/story/post).
 */

const OUT_DIR = process.argv[2]
if (!OUT_DIR) {
  console.error('Usage: tsx scripts/render-share-cards.ts <outDir>')
  process.exit(1)
}

const CASES: {id: string; language: string; label: string}[] = [
  {id: '6', language: 'en', label: 'short-en'},
  {id: '29', language: 'en', label: 'long-en'},
  {id: '6', language: 'he', label: 'short-he'},
  {id: '29', language: 'he', label: 'long-he'},
  {id: '6', language: 'zh', label: 'short-zh'},
  {id: '29', language: 'zh', label: 'long-zh'},
  {id: '6', language: 'jp', label: 'short-jp'},
  {id: '29', language: 'jp', label: 'long-jp'},
]

const SIZES = ['og', 'story', 'post'] as const

async function main() {
  await mkdir(OUT_DIR, {recursive: true})
  for (const {id, language, label} of CASES) {
    for (const size of SIZES) {
      const png = await renderCardPng(language, id, size)
      const file = join(OUT_DIR, `${label}-${size}.png`)
      await writeFile(file, png)
      console.log(`wrote ${file} (${png.byteLength} bytes)`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
