/**
 * Guard for the local `<Icon name="...">` collection in this directory.
 *
 * astro-icon's loader (astro-icon/dist/loaders/loadLocalCollection.js) runs
 * every file here through @iconify/tools — but on a parse failure it only
 * `console.error`s and then *drops* the icon from the collection. The build
 * doesn't fail there; it fails much later, and much less legibly, with
 * "Unable to locate <name> icon!" from whichever page happened to use it.
 *
 * That swallowing cost two round trips on the astro-icon 1.1.5 -> 1.2.0 bump
 * (@iconify/tools 4.x -> 5.x), whose stricter XML parser rejects
 * single-quoted attribute values: the first build surfaced only the root
 * `<svg viewBox='...'>`, and fixing that revealed a second failure on a
 * `<linearGradient id='...'>` further down the same file.
 *
 * So: run the same pipeline with nothing swallowed. Any icon the current
 * @iconify/tools can't parse fails here, by name, in milliseconds — instead
 * of surviving into a green `pnpm test` and dying in a 50s astro build.
 */
import {readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

import {cleanupSVG, importDirectory, parseColors, runSVGO} from '@iconify/tools'
import {describe, expect, it} from 'vitest'

const iconsDir = fileURLToPath(new URL('.', import.meta.url))

const iconNames = readdirSync(iconsDir)
  .filter((file) => file.endsWith('.svg'))
  .map((file) => file.slice(0, -'.svg'.length))
  .toSorted()

describe('local icon collection', () => {
  it('finds the icons on disk (a rename/move must not silently empty this suite)', () => {
    expect(iconNames.length).toBeGreaterThan(0)
  })

  it('parses every icon with the same pipeline astro-icon uses', async () => {
    // mirrors loadLocalCollection's importDirectory options, except
    // ignoreImportErrors: astro-icon warns, we fail.
    const collection = await importDirectory(iconsDir, {
      prefix: 'local',
      keepTitles: true,
      includeSubDirs: true,
      ignoreImportErrors: false,
      keyword: (file) => file.subdir + file.file,
    })

    await collection.forEach((name, type) => {
      if (type !== 'icon') return
      const svg = collection.toSVG(name)
      expect(svg, `${name}: @iconify/tools could not build an SVG`).not.toBeNull()
      if (svg === null) return
      // The clean-up/optimise pass, where the <linearGradient> id error threw —
      // importDirectory alone parses happily, so this half is load-bearing.
      cleanupSVG(svg, {keepTitles: true})
      // parseColors is sync in @iconify/tools 5.x (astro-icon's `await` on it
      // is vestigial) — the throw we're after is raised synchronously.
      parseColors(svg, {defaultColor: 'currentColor', callback: (_, colorStr) => colorStr})
      runSVGO(svg, {plugins: ['preset-default']})
    })

    // The real assertion: nothing got dropped along the way.
    expect(Object.keys(collection.export(true).icons).toSorted()).toEqual(iconNames)
  })
})
