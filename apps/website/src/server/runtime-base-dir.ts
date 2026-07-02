import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

/**
 * On-demand renderers (the print PDF, Share Card images) read bundled assets
 * (fonts, SVGs) off disk at request time. Those assets are declared in
 * astro.config.ts's `netlify({includeFiles: [...]})`, but `process.cwd()`
 * alone is NOT a reliable base to find them at runtime: it matches the astro
 * project root (apps/website) in dev/build/tests, but the deployed Netlify
 * Function's cwd is the function bundle root — one level above where
 * `includeFiles` actually land, since their paths are relative to the astro
 * project root, not the function root (confirmed locally: a build puts them
 * at `.netlify/v1/functions/ssr/apps/website/public/fonts/...`, nested under
 * `apps/website`, while the function's own entry sits at
 * `.netlify/v1/functions/ssr/`).
 *
 * So instead of assuming one base, probe a short list of candidates for a
 * file we know ships in every build, and cache whichever one actually has
 * it. Both src/server/print/render.ts and src/server/card-image.ts hit this
 * exact problem independently — shared here instead of two drifting copies.
 */
export const createBaseDirResolver = (options: {
  /** Path (relative to the resolved base) to a file that ships in every build. */
  probeRelativePath: string
  /** The calling module's own `import.meta.url` — seeds the directory walk-up. */
  moduleUrl: string
  /** Short label for the thrown error, e.g. `'print renderer'` or `'card-image'`. */
  label: string
}): (() => string) => {
  const {probeRelativePath, moduleUrl, label} = options
  let resolvedBaseDir: string | undefined

  const candidateBaseDirs = (): string[] => {
    const bases = new Set<string>()
    bases.add(process.cwd())
    try {
      // The calling module's own compiled location. Walking a few levels up
      // from there works regardless of how the bundler nests chunks, and
      // doesn't depend on cwd being set to anything in particular.
      let dir = dirname(fileURLToPath(moduleUrl))
      for (let i = 0; i < 8; i += 1) {
        bases.add(dir)
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    } catch {
      // import.meta.url isn't always a resolvable file: URL in every runtime —
      // cwd/LAMBDA_TASK_ROOT are tried regardless.
    }
    // Netlify Functions run on AWS Lambda, which exposes the function's
    // extraction root via LAMBDA_TASK_ROOT.
    if (process.env['LAMBDA_TASK_ROOT']) bases.add(process.env['LAMBDA_TASK_ROOT'])
    // Each base might already BE the astro project root, or might be the
    // function/monorepo root one level above it — try both.
    return [...bases].flatMap((base) => [base, join(base, 'apps', 'website')])
  }

  return () => {
    if (resolvedBaseDir) return resolvedBaseDir
    const probed: string[] = []
    for (const base of candidateBaseDirs()) {
      const probe = join(base, probeRelativePath)
      probed.push(probe)
      if (existsSync(probe)) {
        resolvedBaseDir = base
        return base
      }
    }
    throw new Error(
      `${label}: couldn't locate bundled assets under any candidate base dir. Probed:\n${probed.join('\n')}`
    )
  }
}
