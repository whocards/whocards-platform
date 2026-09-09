/**
 * `theme.css` is a generated artifact — the TypeScript tokens rendered as a
 * Tailwind v4 `@theme` block (see theme-css.ts for why it has to be rendered at
 * all). This file is both the drift guard and the generator:
 *
 *   - normally it asserts the committed file matches the renderer, so a token
 *     change that forgets to regenerate fails CI;
 *   - with `GENERATE_THEME_CSS=1` (`pnpm --filter @whocards/tokens
 *     generate:theme`) it writes the file instead.
 *
 * Deliberately one file rather than a script plus a separate check: a
 * standalone Node script can't load this package's extensionless TypeScript
 * imports without adding a runner dependency, and a generator that shares no
 * code with its own check can drift from it.
 */
import {readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

import {renderThemeCss} from './theme-css'

const themeCssPath = fileURLToPath(new URL('../theme.css', import.meta.url))

describe('theme.css', () => {
  it('matches the tokens it is generated from', () => {
    const rendered = renderThemeCss()

    if (process.env.GENERATE_THEME_CSS) writeFileSync(themeCssPath, rendered)

    expect(readFileSync(themeCssPath, 'utf8')).toBe(rendered)
  })
})
