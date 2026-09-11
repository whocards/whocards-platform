/**
 * Renders the design tokens as a Tailwind v4 `@theme` block.
 *
 * Tailwind v4 is CSS-first: a theme is CSS custom properties in a `@theme`
 * block, not a JS `theme.extend` object, and there is no supported way to hand
 * it a plain JS object (`@config` only loads a whole *v3-shaped* config file).
 * So the tokens — still authored in TypeScript, still the single source of
 * truth — are *rendered* to CSS here, and the rendered file (`theme.css`) is
 * committed next to them and imported by both apps. `theme-css.test.ts` fails
 * if the committed file ever drifts from this renderer.
 *
 * That drift check is byte-exact, which is why `.oxfmtrc.json` lists
 * `packages/tokens/theme.css` under `ignorePatterns`: oxfmt rewraps the five
 * long `--font-*` declarations this renderer emits on one line each, and a
 * formatted `theme.css` can never equal `renderThemeCss()` again — the check
 * would fail on a clean checkout and stay failing. Formatting the *generated*
 * file is meaningless anyway; format this renderer instead, and regenerate.
 *
 * Keep in sync with the Tailwind v4 theme namespaces:
 * https://tailwindcss.com/docs/theme#theme-variable-namespaces
 */
import {colors} from './colors'
import {gradients} from './gradients'
import {radius, spacing} from './spacing'
import {fonts} from './typography'

/** `4.5` → `4\.5` — a `.` is a class separator in CSS, so it must be escaped. */
const escapeName = (name: string) => name.replace(/\./g, '\\.')

const line = (namespace: string, name: string, value: string) =>
  `  --${namespace}-${escapeName(name)}: ${value};`

/**
 * Flattens one colour token into its `--color-*` declarations. A nested group
 * renders `group-shade` per shade, with a `DEFAULT` shade rendering as the bare
 * group name (`--color-gray`), matching Tailwind's own `DEFAULT` convention.
 */
const colorLines = (name: string, value: string | Record<string, string>): string[] => {
  if (typeof value === 'string') return [line('color', name, value)]
  return Object.entries(value).map(([shade, hex]) =>
    line('color', shade === 'DEFAULT' ? name : `${name}-${shade}`, hex)
  )
}

const section = (title: string, lines: string[]) => [`  /* ${title} */`, ...lines].join('\n')

/** The tokens as a Tailwind v4 `@theme` block. The body of `theme.css`. */
export const renderThemeCss = (): string => {
  const body = [
    section(
      'Spacing — extra steps beyond Tailwind’s default scale',
      Object.entries(spacing).map(([name, value]) => line('spacing', name, value))
    ),
    section(
      'Border radius',
      Object.entries(radius).map(([name, value]) => line('radius', name, value))
    ),
    section(
      'Colours',
      Object.entries(colors).flatMap(([name, value]) => colorLines(name, value))
    ),
    section(
      'Font families',
      Object.entries(fonts).map(([name, font]) => line('font', name, font.stack.join(', ')))
    ),
    section(
      'Background images',
      Object.entries(gradients).map(([name, value]) =>
        line('background-image', `gradient-${name}`, value)
      )
    ),
  ].join('\n\n')

  return `/*
 * GENERATED FILE — do not edit by hand.
 * Source of truth: packages/tokens/src/*.ts, rendered by src/theme-css.ts.
 * Regenerate with \`pnpm --filter @whocards/tokens generate:theme\`.
 *
 * Imported by every surface that uses Tailwind, so \`bg-yellow-400\`,
 * \`text-mutedOnLight\`, \`rounded-2.5xl\`, \`font-title\`, … resolve to the same
 * value on the website (Tailwind v4) and in the app (NativeWind v5).
 */
@theme {
${body}
}
`
}
