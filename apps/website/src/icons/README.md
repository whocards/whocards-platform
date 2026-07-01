# src/icons

Local SVGs consumed through [astro-icon](https://www.astroicon.dev/) — `<Icon name="…" />`
(and, in one event layout, a direct `~icons/*.svg` import). Remote icon sets (`mdi:`,
`fa-solid:`, `ic:`, `ri:`, `zondicons:`, `entypo-social:`) are configured in
`astro.config.ts` and are **not** files in this directory — don't add local SVGs for
names that already resolve through one of those prefixes.

## Before adding a new file here

- Prefer a remote set (`mdi:`, `fa-solid:`, etc., see `astro.config.ts`) if the glyph
  already exists there — no need to vendor an SVG we don't own.
- Keep the `fill="none"` + `viewBox` + gradient-via-`<defs>` shape used by the existing
  files where it applies, so icons stay visually consistent.
- If a shape needs to be recolored by its consumer (rather than carrying its own fixed
  gradient), omit the `stroke`/`fill` color on the inner shape and let it inherit the
  color from a Tailwind class (`stroke-*`, `fill-*`, `text-*`) applied via the `class`
  prop on `<Icon>` — SVG's `stroke`/`fill` are inherited properties. See `usage-ring.svg` /
  `Usage.astro` for an example of stacking multiple `<Icon>` instances of the same file
  to build a stateful ring (each instance gets its own `class`/`data-*`/`style`, since
  `<Icon>` spreads arbitrary attributes onto its root `<svg>`).

## React islands can't use `<Icon>`

`astro-icon`'s `<Icon>` is an **Astro** component — it resolves `virtual:astro-icon` and
reads this directory at build/render time. That only works inside `.astro` files, not
inside a React island (`.tsx`).

`@iconify-icon/react` (see `LanguageSwitcher.tsx`, `Print.tsx`) doesn't bridge that gap
either — it's a web-component wrapper around Iconify's **remote** collections (`mdi:`,
`zondicons:`, `majesticons:`, …), not a way to render files from this directory inside
React.

If a React island needs a one-off glyph that isn't in a remote Iconify collection, the
pattern is a hoisted inline JSX `<svg>` const, colocated with the component that uses it
(see `Play.tsx`'s `PrevArrowIcon`/`NextArrowIcon`). Don't reach for a new one-off
mechanism (SVGR, `?react` imports, etc.) unless several React islands need to share the
same set of custom local icons — none of that tooling is wired up in this project today.
