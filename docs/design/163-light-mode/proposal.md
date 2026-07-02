# Light mode — design exploration (#163)

Status: **proposal, not implementation**. This is the reviewable design pass the issue asks
for; no app code changes here. HITL sign-off happens before any build ticket is cut.

Mocks live in [`mocks/`](./mocks/index.html) (open `mocks/index.html` for a gallery, or any
file directly) and rendered PNGs are in [`mocks/renders/`](./mocks/renders/).

## Summary

The app today is dark-only: a deep-aubergine canvas (`background`/`darkest`) with white text
and the yellow→violet brand accent. The existing native page-sheets (Language, Game, Share)
are **already light** — `bg-white`, `text-darker`, `border-gray-lighter`, `text-primary-dark`
for selection, `text-gray-dark` for secondary copy. That's not a coincidence to work around;
it's the starting point. **The light theme this proposal describes largely extends that
already-shipped sheet palette to the rest of the app** (canvas, card faces, chrome), rather
than inventing a new one. Four new near-white tokens cover the depth/elevation ladder that the
sheets didn't need (they're always the topmost layer); everything else reuses tokens that are
already live in production today.

Recommendation up front: **ship System-follow as the default, with a manual Light/Dark
override**, surfaced as a new "Display" entry next to the existing "Game" chip on the Library
screen (see [§ Theme selection](#theme-selection)). The app icon is unaffected — it's
explicitly out of scope per the issue and stays dark-only.

## Palette

### Method

Rather than picking new hex values by eye, each new light token was derived to reproduce the
**same WCAG contrast step off its screen's canvas** that the equivalent dark token already has
off *its* canvas (`background`, `#0d051f`). That keeps the light theme's sense of depth
(how far a card "lifts" off the page) perceptually equivalent to the dark theme's, instead of
just guessing at "light-mode-y" colors.

| Elevation role                                             | Dark token | Dark hex  | Contrast vs. dark canvas | Light hex (new) | Contrast vs. light canvas |
| ------------------------------------------------------------ | ---------- | --------- | ------------------------: | ---------------- | --------------------------: |
| Canvas (screen background)                                   | `background` | `#0d051f` | —                          | `#F6F2FB`         | —                            |
| Deep canvas (nav chrome, native sheets)                       | `darkest`  | `#08001a` | 1.03 : 1                  | `#FFFFFF`         | 1.10 : 1                    |
| Mid surface (revealed question card, PlayerBar, close chip)   | `darker`   | `#111516` | 1.08 : 1                  | `#EFEAF7`         | 1.07 : 1                    |
| Raised surface (deck-peek layers, card back, pressed card)    | `dark`     | `#262432` | 1.30 : 1                  | `#DED4EC`         | 1.29 : 1                    |

`darkest`(light) lands exactly on `#FFFFFF` — which is the value the Language/Game/Share sheets
already use. That's the tell that this derivation is on the right track: it rediscovers the
already-shipped sheet color from first principles instead of contradicting it.

### Full token mapping

| Role                                  | Dark token                  | Dark value | Light proposal                | Light value | Note |
| -------------------------------------- | ---------------------------- | ---------: | ------------------------------ | -----------: | ---- |
| Canvas                                  | `background`                 | `#0d051f`  | `background` (light)           | `#F6F2FB`   | pale lavender-white; keeps the brand's violet hue at ~90% lightness instead of going neutral-gray |
| Deep canvas / nav / native sheets       | `darkest`                    | `#08001a`  | `darkest` (light)              | `#FFFFFF`   | == the white the sheets already use |
| Mid surface                             | `darker`                     | `#111516`  | `darker` (light)               | `#EFEAF7`   | revealed Pick-a-Card face, PlayerBar fill, close chip |
| Raised surface                          | `dark`                       | `#262432`  | `dark` (light)                 | `#DED4EC`   | deck-peek layers, card back, any "pressed forward" panel |
| Primary text (on dark canvas / surfaces)| `white`                      | `#f5f5f5`  | reuse `darker`                 | `#111516`   | already proven as sheet body text |
| Muted / secondary text                  | `gray-dark`                  | `#9698af`  | `gray-dark-on-light` (new)     | `#6B6D82`   | see [contrast finding](#contrast-check) — the un-deepened value only just fails AA |
| Hairline rule / border                  | `gray-lighter`                | `#dcdee9`  | reuse as-is                    | `#dcdee9`   | already the sheets' border color |
| Primary accent (buttons)                | `yellow-400` / `primary.light`| `#f9d75f`  | unchanged                      | `#f9d75f`   | button always carries its own dark text; theme-independent |
| Secondary accent, decorative/icon scale | `primary-dark`                | `#c058d2`  | unchanged for glyphs ≥ large-text size | `#c058d2` | the "?" corner mark, a checkmark — non-text or graphical, 3:1 threshold |
| Secondary accent, text scale            | `primary-dark`                | `#c058d2`  | `primary-dark-on-light` (new)  | `#9A3AAC`   | any place violet is set as legible copy (e.g. a "Selected" label) |
| Error, icon/border scale                | `red`                         | `#ee1e23`  | unchanged                      | `#ee1e23`   | |
| Error, text scale                       | `red`                         | `#ee1e23`  | `red-on-light` (new)           | `#C9151A`   | error copy needs AA; the flat token doesn't clear it on white |
| Selection tint                          | `bg-yellow-300/40`            | —          | unchanged                      | —           | already used on the white sheets today |
| Brand gradient (wordmark, display text) | `gradients.primary`           | yellow→violet | unchanged                    | —           | works on either canvas — see [wordmark](#wordmark--the-maze-texture) below |

A neat discovery while deriving the deepened-yellow case: `colors.yellow[100]` (`#7e7552`)
already exists in `packages/tokens/src/colors.ts` and is **currently unused** anywhere in the
app. It gives 4.18:1 on the new light canvas — almost exactly what a "deepened yellow for
light-surface text" needs. It's used below for the card-back wordmark's "WHO". Whoever added it
to the token file seems to have anticipated exactly this need.

### Naming caution for implementation

The table above is deliberately literal — it maps each dark token to a light equivalent 1:1, as
asked. But `darker`, `gray-dark`, `primary-dark`, and `red` are each used **two different ways**
today: as a light-*surface* background scale (dark mode has no such use) and as a *text* color
on the existing white sheets. A literal in-place edit of `colors.ts` (e.g. redefining `darker`
per-theme) would silently break the sheets' `text-darker` usage the moment a "dark" theme
selection also flips those values. **Recommendation:** don't overload the existing primitives —
add a small themed elevation scale (e.g. `colors.surface = {canvas, deepCanvas, mid, raised}`
each with `{light, dark}`) and keep `white` / `darker` / `gray-dark` / `primary-dark` / `red` as
static, non-theme-switching text/accent primitives, exactly as they behave today. This is an
implementation note for the eventual build ticket, not something this proposal needs to resolve.

## Wordmark & the maze texture

- **Wordmark** (`apps/mobile/assets/images/logo.png`, copied to `mocks/assets/wordmark.png`, the
  hero mark on Library): unchanged. It's a yellow→violet
  gradient raster — a logotype, which WCAG's contrast rules exempt (1.4.3). Rendered at full
  size (240px+) on the new pale canvas it reads cleanly (see the render below); the palette
  doesn't need a separate light-mode export. A muted alternate using `yellow.100` as the
  gradient start was test-generated (`mocks/assets/wordmark-light.png`) but looks muddier and
  isn't recommended — flagging only because it was considered.
- **Card-back wordmark** (`pick-player.tsx`'s coded "WHO?CARDS", not the raster logo): this one
  *does* need a change. Today `CARDS` is hardcoded `text-white` — invisible on a light card
  back. Proposal: `WHO` → `yellow.100` (`#7e7552`, 4.18:1), `?` → `primary-dark-on-light`
  (`#9A3AAC`, 4.12:1 on the raised-surface fill), `CARDS` → `darker` (`#111516`).
- **Maze texture** (`assets/images/background.png`, sourced from `apps/website/public/background.svg`):
  recolored, not redrawn — same path data, new gradient stops (`#08001A → #fff` becomes
  `#EDE6F6 → #C9B8E0`) and `fill-opacity` lifted from `.1` to `.16` so the linework stays a
  "whisper" at the new, much higher base lightness instead of disappearing. See
  `mocks/assets/background-light.svg`; the render below shows it under the Library and Play
  mocks and full-bleed on a card back.

## Mocks

Open [`mocks/index.html`](./mocks/index.html) for the interactive gallery. Static renders:

| Surface | Render |
| --- | --- |
| Library / landing | `mocks/renders/library.png` |
| Play — Classic (Global Game) | `mocks/renders/play-classic.png` |
| Pick a Card — deck + revealed card | `mocks/renders/pick-a-card.png` |
| Share sheet (in context + palette reference) | `mocks/renders/share-sheet.png` |
| Display setting — entry point + sheet | `mocks/renders/display-setting.png` |

Card geometry, spacing, and type choices in the mocks are pulled from the real components, not
guessed: `CARD_ASPECT` (0.72), `CARD_PADDING_X/Y` (28/44), the deck-peek rotation/offset
constants, and font families (`golos-text`, `aptly`) all come straight from
`apps/mobile/src/components/pick-player.tsx` and `packages/tokens/src/typography.ts`. The
sample questions are real Pool content from `packages/decks/src/pool/questions.json`.

### Library / landing

The screen the issue calls "Library" is today's single-Deck landing (`app/index.tsx`) — per
`docs/DESIGN.md`'s "Mobile v1 launch alignment", true Library browsing doesn't exist yet, so
this mock is that same landing screen re-themed, not a new browse UI.

Canvas `#F6F2FB` + the recolored maze texture, wordmark unchanged, tagline flips from
`text-white/80` to `text-darker` at 80% opacity, meta text and the "Game" chip move to the
deepened muted/border tokens. The yellow Play button is byte-for-byte the same component — it
carries its own colors regardless of theme.

### Play — Classic / Global Game

No card frame in this Game today (the question sits directly on the canvas+texture); that's
unchanged. Question text flips `text-white` → `text-darker`. The bottom PlayerBar was
`bg-darker/80` on a dark canvas; the light equivalent is `rgba(255,255,255,.86)` over
`border-t border-darker/10` — translucent-light rather than translucent-dark, same idea.

### Pick a Card

Two states, since the issue calls out "the Pick a Card deck" as its own surface:

- **Deck (face-down)**: card back uses the raised-surface tone (`#DED4EC`), not the canvas —
  see the note below on why a literal 1:1 (`bg-darkest` → canvas color) doesn't work here.
- **Revealed question face**: mid-surface tone (`#EFEAF7`), texture at the same 0.4 opacity,
  the big corner "?" in the deepened violet.

**One deliberate deviation from strict 1:1, called out explicitly (trade-off, per the ask):**
in dark mode `CardBack` is `bg-darkest` — literally the same value as the screen canvas behind
it (`ScreenBackground`'s `background`/`darkest` pairing is already a near-match at ~L 0.001–0.003).
That works because at that end of the lightness scale, even a tiny luminance gap plus the
texture and a `border-white/10` hairline read clearly. Mapping that literally in light mode
(`background-light` card back on `background-light` canvas, both `#F6F2FB`) measures out to a
**1.0:1 contrast — the deck reads as flat and washed-out**, leaning entirely on the hairline
border and the faint texture with no tonal help (rendered for comparison at
`mocks/renders/pick-a-card-literal-1to1-not-recommended.png` — worth a look side-by-side with
the recommended version). Using the raised-surface tone
(`#DED4EC`, 1.29:1 off canvas) instead keeps the deck reading as a physical stack sitting on the
table, matching the *intent* of the dark design rather than its literal hex value.

### Share sheet

Two renders: the sheet in its real context (over the light Play canvas, with a scrim), and the
sheet's palette isolated for reference. The palette itself is **unchanged** — `bg-white`,
`text-darker`, `text-gray-dark`, icon strokes in `darker`. The only new consideration: because
the light canvas is now much closer in lightness to the sheet's white than the old dark canvas
was, the "sheet floats above the screen" depth cue leans more on the shadow and the sheet's
rounded top corners than it used to (in dark mode, the dark-canvas-to-white-sheet jump alone
was enough). Recommend keeping (or slightly increasing) the existing sheet shadow when the
underlying theme is light.

### Display setting

Mocked as a new **"Display"** chip beside the existing "Game: Global Game" chip on the Library
screen, opening a page-sheet in the same house style as Language/Game (`sheet-header`, hairline
rule, `aptly` section titles). See [§ Theme selection](#theme-selection) for the reasoning.

## Contrast check

Computed with the standard WCAG relative-luminance formula (sRGB → linear → `0.2126R +
0.7152G + 0.0722B`, ratio = `(L1+.05)/(L2+.05)`). AA thresholds: **4.5:1** normal text, **3:1**
large text (≥ 24px, or ≥ 18.66px bold) and graphical/UI objects.

| Pair | Ratio | AA normal text | AA large text / UI |
| --- | ---: | :---: | :---: |
| `darker` (#111516) text on canvas `#F6F2FB` | 16.64 : 1 | pass | pass |
| `darker` text on mid surface `#EFEAF7` (Pick-a-Card question face) | 15.56 : 1 | pass | pass |
| `darker` text on raised surface `#DED4EC` (card back) | 12.89 : 1 | pass | pass |
| `darker` text on white sheet `#FFFFFF` (existing, unchanged) | 18.38 : 1 | pass | pass |
| `darker` text on yellow-400 button `#f9d75f` (unchanged either theme) | 13.05 : 1 | pass | pass |
| Muted text, **existing** `gray-dark` (#9698af) on white sheet | 2.84 : 1 | **fail** | fail |
| Muted text, **deepened** `gray-dark-on-light` (#6B6D82) on canvas | 4.60 : 1 | pass | pass |
| Muted text, **deepened** `gray-dark-on-light` (#6B6D82) on white | 5.08 : 1 | pass | pass |
| Violet, **existing** `primary-dark` (#c058d2) on white (today's checkmark) | 3.77 : 1 | fail | pass |
| Violet, **existing** `primary-dark` on raised surface `#DED4EC` (Pick-a-Card "?") | 2.65 : 1 | fail | **fail** |
| Violet, **deepened** `primary-dark-on-light` (#9A3AAC) on raised surface | 4.12 : 1 | pass | pass |
| Violet, **deepened** `primary-dark-on-light` (#9A3AAC) on mid surface `#EFEAF7` | 4.97 : 1 | pass | pass |
| Error, **existing** `red` (#ee1e23) on white | 4.33 : 1 | fail (barely) | pass |
| Error, **deepened** `red-on-light` (#C9151A) on white | 5.82 : 1 | pass | pass |
| `yellow.100` (#7e7552, card-back "WHO") on canvas | 4.18 : 1 | fail (barely) | pass |
| `yellow.100` on raised surface `#DED4EC` (actual card-back fill) | 3.24 : 1 | fail | pass |
| *Reference*: `white` (#f5f5f5) text on `darkest` (#08001a) — today's dark-mode baseline | 18.79 : 1 | pass | pass |

**Findings:**

1. **Body/question text is excellent everywhere** (12.9–18.4:1) — `darker`-on-light-surface has
   a lot of headroom, unsurprising since it's the same pairing the sheets already ship.
2. **The existing `gray-dark` muted-text token is already borderline today** — 2.84:1 on the
   white sheets (game descriptions, "Also show" helper text) is under both the normal-text and
   large-text AA floor. That's a **pre-existing gap in the shipped dark-theme app**, not
   something this proposal introduces; worth its own follow-up regardless of the light-mode
   decision. This proposal's light theme uses the deepened `#6B6D82` throughout and clears AA
   with margin (4.6–5.1:1).
3. **The un-deepened violet and error tokens don't reliably clear AA as text** on the new light
   surfaces — expected, since neither was designed against a light background before (they only
   ever sat on dark canvases, or as small icon-scale marks on white). The deepened variants
   (`#9A3AAC`, `#C9151A`) fix this and are what the mocks use everywhere violet/red appears as
   copy. The flat originals remain fine for large glyphs / icons / borders, where the 3:1
   threshold applies instead of 4.5:1.
4. **`yellow.100` (card-back "WHO") is close but technically under AA-normal** on both candidate
   backgrounds (4.18:1, 3.24:1) — it clears AA-*large* only. Given the letters render well
   above 24px in the actual card back (see `mocks/renders/pick-a-card.png`), this is acceptable
   as a large-text/decorative use, but it's the one place in this palette I'd flag as "good
   enough, not exemplary" if a future pass wants to push it further.

## Theme selection

**Recommendation: System-follow by default, with a manual override.** Three states — System /
Light / Dark — not a plain two-way toggle.

- `apps/mobile/app.json` already declares `"userInterfaceStyle": "automatic"` — the app was set
  up to respect the OS appearance from day one, even though there's been no light theme to
  switch to. This proposal is closing a gap that was already anticipated, not opening a new one.
- Per `CONTEXT.md`'s **Display setting** definition, this is explicitly "a per-Device
  presentation choice... that never affects which Card is drawn or whose progress is
  remembered" — not a Game, and not a decision that should live in the play engine. It composes
  freely with any Game and any language selection, exactly like the existing secondary-language
  Display setting.
- Persist device-locally (the same `AsyncStorage` pattern as `lib/game-store.ts` and
  `lib/language-store.ts` — a new `lib/theme-store.ts`), read on boot alongside those two, and
  apply through NativeWind's `dark:` variant / `useColorScheme` mechanism, which is already the
  app's styling system — no new theming library needed.

**Where it lives:** a new **"Display"** entry, styled identically to the existing "Game: Global
Game" quiet outline chip on the Library screen (mocked in `mocks/display-setting.html`), opening
a page-sheet in the same house style as Language/Game/Share. Rationale for chip-over-buried-menu:
there is no settings screen in the app today, and Language/Game are already surfaced as
peer quiet controls rather than tucked into a menu — Display should match that existing pattern,
not introduce a new information architecture. Inside the sheet: a "Theme" segmented control
(System/Light/Dark) up top, with room for the existing secondary-language "Also show" section
below it — both are Display settings and can reasonably share one sheet, though splitting them
is a fine alternative if the sheet gets crowded once Custom Decks/accounts land.

**Trade-offs considered:**

| Option | Pro | Con |
| --- | --- | --- |
| **System-follow default + manual override (recommended)** | Zero-decision for most users; matches the OS-wide preference `app.json` already primes for; standard, expected pattern (iOS/Android/most apps) | Three states (not two) to build and test; needs a "System" value distinct from "Light"/"Dark" in storage |
| Manual-only, no System option | Simpler storage/UI (one flag) | Ignores an explicit OS-level signal the user already set; more taps for the common case of "just match my phone" |
| Follow-system only, no manual override | Simplest possible implementation | No escape hatch for someone who wants WhoCards dark while their OS is light (or vice versa) — worse than what most comparable apps offer today |

**Scope note on the modals:** Language/Game/Share sheets need **no change for the dark theme**
(unchanged — they're already exactly today's app) and **no change for the light theme either**
(the light palette above *is* their existing palette, just extended outward). The only sheet-side
implementation consideration is the shadow/elevation point under [§ Share sheet](#share-sheet).

## Out of scope

- The app icon stays dark-only, per the issue. Not touched, not mocked.
- No app code changes. `packages/tokens`, NativeWind config, and every component referenced
  above are read-only inputs to this proposal.
- Store screenshots / marketing assets are not updated here; `docs/DESIGN.md`'s "Mobile v1
  launch alignment" section governs those separately and would need its own pass once a theme
  ships.
