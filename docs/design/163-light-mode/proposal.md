# Light mode — design proposal + implementation (#163)

Status: **implemented**, approved by Avi with two amendments to the original design pass (see
[§ Amendments](#amendments-from-review) below). This doc keeps the original palette derivation
and contrast work (still the basis for what shipped) and layers the amendments and the build
summary on top, rather than rewriting history.

Mocks live in [`mocks/`](./mocks/index.html) (open `mocks/index.html` for a gallery, or any
file directly) and rendered PNGs are in [`mocks/renders/`](./mocks/renders/).

## Summary

The app today is dark-only: a deep-aubergine canvas (`background`/`darkest`) with white text
and the yellow→violet brand accent. The existing native page-sheets (Language, Game, Share) were
**already light** — `bg-white`, `text-darker`, `border-gray-lighter`, `text-primary-dark` for
selection, `text-gray-dark` for secondary copy — and the first pass of this proposal leaned on
that palette as the light theme's starting point. Review corrected two things (below): the
sheets now **follow the theme** (dark surface in dark mode, light in light mode) rather than
always being light, and **Card faces never theme** — Classic play's question card and the Pick a
Card deck/faces stay dark in both themes, since the Card is the brand object. What actually
themes is the chrome around the Card: the Library screen, nav, modals.

**Shipped:** System-follow default with a manual Light/Dark override, a new "Theme" chip next
to "Game" on the Library screen (named "Theme," not "Display" — see
[§ Overlapping in-flight work](#overlapping-in-flight-work-and-how-it-was-reconciled) — a later
PR added a differently-scoped "Display settings" sheet elsewhere), NativeWind's built-in `dark:` variant + `colorScheme` API (no
new theming library), and a `theme_changed` observability event. The app icon is unaffected — out
of scope per the issue, stays dark-only.

## Amendments from review

Avi reviewed the mocks and approved implementation with two corrections to the original design:

1. **Modals/sheets theme with the app, including dark mode.** The original proposal treated the
   sheets as a fixed, always-light reference palette ("no change needed for the dark theme").
   That's wrong once sheets are expected to look native in a dark-themed app: a bright white
   sheet popping out of a dark app reads as a bug, not a design choice. Sheets now render a dark
   surface in dark mode and the original light surface in light mode. This _partially_ undercuts
   the original "we're just extending the already-shipped white-sheet palette" framing — dark
   mode gets a genuinely new sheet treatment (see [§ Sheet surfaces](#sheet-surfaces-both-themes)) — but the light-mode sheet is still exactly the pre-existing white/darker/gray-dark/primary-dark palette, so half of that framing holds.
2. **Card faces are always dark**, in both themes. Classic play's question card and the Pick a
   Card deck/faces (back and revealed) keep today's exact dark treatment regardless of the Theme
   setting — the Card is the brand object, not chrome. This **removes the "mid surface" /
   "raised surface" card-elevation tokens from scope** (the original palette derived light values
   for the revealed-card fill, the card back, and the deck-peek layers — none of that ships,
   since none of those surfaces theme anymore). What's left of the original elevation ladder is
   just the Library canvas and the sheet surface. It also means **Pick a Card needed zero code
   changes** — `pick-player.tsx` is untouched, which matters because
   `feat/pick-a-card-deck-flip` was owned by another agent at the time; see
   [§ Overlapping in-flight work](#overlapping-in-flight-work-and-how-it-was-reconciled).

The palette derivation, wordmark treatment, and contrast method below are unchanged from the
original pass **except** where a section is marked "amended" — the elevation-ladder tokens for
card surfaces (`darker`(light), `dark`(light) as card-face/card-back fills) are kept in this doc
struck through for the record, but nothing in `packages/tokens` or the app implements them.

## Palette

### Method

Rather than picking new hex values by eye, each new light token was derived to reproduce the
**same WCAG contrast step off its screen's canvas** that the equivalent dark token already has
off _its_ canvas (`background`, `#0d051f`). That keeps the light theme's sense of depth
perceptually equivalent to the dark theme's, instead of just guessing at "light-mode-y" colors.

| Elevation role                                                  | Dark token                | Dark hex      | Contrast vs. dark canvas | Light hex                                                     | Contrast vs. light canvas | Shipped?                              |
| --------------------------------------------------------------- | ------------------------- | ------------- | -----------------------: | ------------------------------------------------------------- | ------------------------: | :------------------------------------ |
| Canvas (Library screen background)                              | `darkest`                 | `#08001a`     |                        — | `canvasLight` `#F6F2FB`                                       |                         — | **yes**                               |
| Sheet surface (Language/Game/Share/Theme modals)                | n/a (was hardcoded white) | —             |                        — | dark: reuse `dark` `#262432` · light: reuse `white` `#FFFFFF` |             1.29:1 (dark) | **yes** — amended, see below          |
| ~~Mid surface (revealed question card, PlayerBar, close chip)~~ | ~~`darker`~~              | ~~`#111516`~~ |               ~~1.08:1~~ | ~~`#EFEAF7`~~                                                 |                ~~1.07:1~~ | **no — card stays dark, amendment 2** |
| ~~Raised surface (deck-peek layers, card back)~~                | ~~`dark`~~                | ~~`#262432`~~ |               ~~1.30:1~~ | ~~`#DED4EC`~~                                                 |                ~~1.29:1~~ | **no — card stays dark, amendment 2** |

`ScreenBackground`'s dark canvas is actually `colors.darkest` (`#08001a`), not `background` — the
original doc's role table (matching `docs/DESIGN.md`'s naming) rounded that to `background`;
the implementation follows the real code, so the Library canvas's `dark:` companion is `darkest`,
unchanged, and the new `canvasLight` token pairs with it.

### Sheet surfaces (both themes)

This is the amended piece. Each sheet (Language, Game, Share, Theme) now has two surfaces:

| Element                     | Dark theme                                          | Light theme                                         |
| --------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Sheet fill                  | `dark` `#262432` (existing token — reused, not new) | `white` `#FFFFFF` (existing, unchanged from before) |
| Title / row text            | `white` `#f5f5f5` (existing)                        | `darker` `#111516` (existing)                       |
| Muted / description text    | `gray-dark` `#9698af` (existing)                    | `mutedOnLight` `#6B6D82` (new)                      |
| Selected-row tint           | `bg-yellow-300/40` (existing, unchanged)            | `bg-yellow-300/40` (existing, unchanged)            |
| Checkmark / selected accent | `accentOnDark` `#D485E2` (new)                      | `accentOnLight` `#9A3AAC` (new)                     |
| Error text (Share sheet)    | `errorOnDark` `#FF5B5F` (new)                       | `errorOnLight` `#C9151A` (new)                      |
| Border / hairline           | `border-white/10` (existing)                        | `gray-lighter` `#dcdee9` (existing)                 |
| Status bar icons            | light                                               | dark                                                |

`dark` (`#262432`) as the dark-mode sheet fill is a deliberate reuse, not a new token: it's
already the lightest member of the dark elevation family (`dark` > `darker` > `darkest` in
luminance — "raised = lighter" is the existing convention for the PlayerBar/close-chip/deck-peek
layers), so a sheet — the topmost, most-raised layer in the app — landing on it is consistent
with how everything else already reads elevation in dark mode.

`accentOnDark` and `errorOnDark` are new: nothing in the app rendered `primary-dark` or `red` as
_text_ on a dark surface before now (the sheets were always white, so violet/red text only ever
needed to work on white). Checked directly rather than assumed — see the amended
[contrast table](#contrast-check).

### Full token mapping

| Role                                                 | Dark token                     |    Dark value | Light proposal                                          |           Light value | Note                                                                                        |
| ---------------------------------------------------- | ------------------------------ | ------------: | ------------------------------------------------------- | --------------------: | ------------------------------------------------------------------------------------------- |
| Library canvas                                       | `darkest`                      |     `#08001a` | `canvasLight` (new)                                     |             `#F6F2FB` | Library/landing screen only — Play and Pick a Card force dark, see amendment 2              |
| Sheet surface                                        | n/a (was always white)         |             — | reuse `dark` (dark theme) / reuse `white` (light theme) | `#262432` / `#FFFFFF` | amended — see above                                                                         |
| Primary text (sheets, Library)                       | `white`                        |     `#f5f5f5` | reuse `darker`                                          |             `#111516` | already proven as sheet body text                                                           |
| Muted / secondary text                               | `gray-dark`                    |     `#9698af` | `mutedOnLight` (new)                                    |             `#6B6D82` | the un-deepened value only just fails AA on light — see [contrast finding](#contrast-check) |
| Hairline rule / border                               | `gray-lighter`                 |     `#dcdee9` | reuse as-is                                             |             `#dcdee9` | already the sheets' border color                                                            |
| Primary accent (buttons)                             | `yellow-400` / `primary.light` |     `#f9d75f` | unchanged                                               |             `#f9d75f` | button always carries its own dark text; theme-independent                                  |
| Secondary accent (checkmark, selection) — dark theme | `primary-dark`                 |     `#c058d2` | `accentOnDark` (new)                                    |             `#D485E2` | new combination — violet text never sat on a dark sheet before                              |
| Secondary accent — light theme                       | `primary-dark`                 |     `#c058d2` | `accentOnLight` (new)                                   |             `#9A3AAC` | any place violet is set as legible copy                                                     |
| Error, text scale — dark theme                       | `red`                          |     `#ee1e23` | `errorOnDark` (new)                                     |             `#FF5B5F` | new combination — error copy never sat on a dark sheet before                               |
| Error, text scale — light theme                      | `red`                          |     `#ee1e23` | `errorOnLight` (new)                                    |             `#C9151A` | error copy needs AA; the flat token doesn't clear it on white                               |
| Selection tint                                       | `bg-yellow-300/40`             |             — | unchanged                                               |                     — | works on both the white and the dark `#262432` sheet fill                                   |
| Brand gradient (wordmark, display text)              | `gradients.primary`            | yellow→violet | unchanged                                               |                     — | works on either canvas — see [wordmark](#wordmark--the-maze-texture) below                  |
| ~~Card mid/raised surfaces~~                         | ~~`darker`/`dark`~~            |             — | ~~`#EFEAF7`/`#DED4EC`~~                                 |                     — | **not shipped** — card stays dark in both themes (amendment 2)                              |

A neat discovery while deriving the deepened-yellow case: `colors.yellow[100]` (`#7e7552`)
already existed in `packages/tokens/src/colors.ts`, unused anywhere in the app. It wasn't needed
in the end (the card-back wordmark that would have used it no longer themes, per amendment 2),
but it's worth knowing it's there for a future light-surface yellow-text need.

### Naming — what actually shipped

The original doc flagged a naming risk: several dark tokens (`darker`, `gray-dark`,
`primary-dark`, `red`) are used both as background scale members and as text colors, and an
in-place edit would collide. The implementation avoids this entirely by **adding new, separately-named
tokens** (`canvasLight`, `mutedOnLight`, `accentOnLight`, `accentOnDark`, `errorOnLight`,
`errorOnDark`) rather than redefining any existing token — `white`, `darker`, `gray-dark`,
`dark`, `darkest`, `primary-dark`, `red` all keep their current values and current call sites
unchanged. Every themed surface picks between an existing token and a new one via NativeWind's
`dark:` variant (e.g. `className="bg-white dark:bg-dark"`) or a small conditional in JS
(`useColorScheme()` from `nativewind`) for props that take a raw color (`Ionicons` `color`,
`StatusBar` `style`, `Image` `source`).

## Wordmark & the maze texture

- **Wordmark** (`apps/mobile/assets/images/logo.png`, the hero mark on Library): unchanged. It's
  a yellow→violet gradient raster — a logotype, which WCAG's contrast rules exempt (1.4.3).
  Rendered at full size (240px+) on the new pale canvas it reads cleanly (see the render below).
- ~~**Card-back wordmark** change~~: not shipped. `pick-player.tsx`'s coded "WHO?CARDS" (`WHO`
  yellow-400, `?` primary-dark, `CARDS` white) is untouched — the card back stays dark in both
  themes (amendment 2), so `text-white` for `CARDS` is still correct.
- **Maze texture** (new asset: `apps/mobile/assets/images/background-light.png`, used by
  `ScreenBackground` on the Library screen only): recolored from the same source path data as
  the dark texture (`apps/website/public/background.svg`), gradient stops shifted from
  `#08001A → #fff` to `#EDE6F6 → #C9B8E0` at `fill-opacity .16`. **Implementation note from
  building the actual asset:** rasterizing this SVG with ImageMagick's SVG delegate produced
  wrong output twice — first an accidental grayscale PNG (lost the tint entirely, fixed with
  `-type TrueColor -define png:color-type=2`), then solid black artifacts on some paths once
  opacity was pushed to 1 while iterating (ImageMagick's SVG delegate appears to mishandle the
  source SVG's inert `feDisplacementMap`/`feTurbulence` filter — `apps/website/public/background.svg`'s `disFilter`, `display="none"` but still present in the defs). The dark asset was presumably
  rasterized some other way originally, since it doesn't hit this. Fix: render through the same
  Chromium/Playwright pipeline already used for the mock screenshots (which handles the filter
  fine) instead of ImageMagick's SVG rasterizer, then flatten and re-encode. See
  `apps/mobile/assets/images/background-light.png`.

## Mocks

Open [`mocks/index.html`](./mocks/index.html) for the interactive gallery. Static renders:

| Surface                                                                        | Render                              |
| ------------------------------------------------------------------------------ | ----------------------------------- |
| Library / landing — light + dark, side by side                                 | `mocks/renders/library.png`         |
| Play — Classic (always dark, both themes — unchanged)                          | `mocks/renders/play-classic.png`    |
| Pick a Card — deck + revealed card (always dark, both themes, untouched)       | `mocks/renders/pick-a-card.png`     |
| Share sheet — light + dark, side by side (compact bottom sheet, PR #166 shape) | `mocks/renders/share-sheet.png`     |
| Display setting — entry point + Theme sheet, light + dark                      | `mocks/renders/display-setting.png` |

### Library / landing

The screen the issue calls "Library" is today's single-Deck landing (`app/index.tsx`) — per
`docs/DESIGN.md`'s "Mobile v1 launch alignment", true Library browsing doesn't exist yet, so this
mock is that same landing screen re-themed, not a new browse UI. This is the **only** screen
whose canvas actually themes. Canvas `#F6F2FB` (light) / `#08001a` (dark, unchanged) + the
matching maze texture, wordmark unchanged in both, tagline/meta/chip text and borders swap via
`dark:` variants. The yellow Play button is byte-for-byte the same component in both themes — it
carries its own colors regardless of theme.

### Play — Classic, and Pick a Card

**Amendment 2: both stay exactly as they are today, in both themes.** No card frame in Classic
(the question sits directly on the dark canvas+texture); the Pick a Card deck and revealed-card
faces keep their existing dark treatment. The mocks for these two surfaces show today's actual
(dark) app, relabeled to make the "unchanged" decision explicit rather than showing the
since-reverted light treatment from the first pass.

### Sheets (Language / Game / Share / Theme)

Now theme with the app (amendment 1). Dark theme reuses the `dark` (`#262432`) surface already
established by the PlayerBar/close-chip/deck-peek elevation family; light theme is exactly the
pre-existing white sheet palette. See [§ Sheet surfaces](#sheet-surfaces-both-themes) for the
full token table. Status bar icons flip with the sheet (dark sheet → light icons, light sheet →
dark icons) — each sheet sets its own `<StatusBar>` override rather than relying on a single
global default, since Play/Pick a Card need the opposite of Library regardless of the Theme
setting (see [§ Theming mechanism](#theming-mechanism)).

### Theme setting

A new **"Theme"** chip beside the existing "Game: Global Game" chip on the Library screen,
opening a page-sheet in the same house style as Language/Game (`sheet-header`, hairline rule,
`aptly` section titles), containing a **Theme** segmented control (System / Light / Dark) and
explanatory copy that it's presentation-only. See [§ Theme selection](#theme-selection) and
[§ Overlapping in-flight work](#overlapping-in-flight-work-and-how-it-was-reconciled) for why it's
named "Theme" and not "Display."

## Contrast check

Computed with the standard WCAG relative-luminance formula (sRGB → linear → `0.2126R +
0.7152G + 0.0722B`, ratio = `(L1+.05)/(L2+.05)`). AA thresholds: **4.5:1** normal text, **3:1**
large text (≥ 24px, or ≥ 18.66px bold) and graphical/UI objects.

### Library canvas (light theme)

| Pair                                                      |                                                                      Ratio | AA normal text |
| --------------------------------------------------------- | -------------------------------------------------------------------------: | :------------: |
| `darker` (#111516) text on canvas `canvasLight` `#F6F2FB` |                                                                  16.64 : 1 |      pass      |
| Tagline `darker/80` on canvas                             | ~14+ : 1 (opacity reduces effective contrast slightly; comfortably passes) |      pass      |
| `mutedOnLight` (#6B6D82) on canvas                        |                                                                   4.60 : 1 |      pass      |

### Sheet surfaces (amended — both themes checked)

| Pair                                                                            |     Ratio |                                 AA normal text                                 | AA large/UI |
| ------------------------------------------------------------------------------- | --------: | :----------------------------------------------------------------------------: | :---------: |
| `darker` text on white sheet `#FFFFFF` (light theme, existing)                  | 18.38 : 1 |                                      pass                                      |    pass     |
| `white` text on dark sheet `#262432` (dark theme, new combination)              | 13.95 : 1 |                                      pass                                      |    pass     |
| `mutedOnLight` (#6B6D82) on white sheet (light theme)                           |  5.08 : 1 |                                      pass                                      |    pass     |
| `gray-dark` (#9698af) on dark sheet `#262432` (dark theme)                      |  5.36 : 1 |                                      pass                                      |    pass     |
| **Existing** `gray-dark` (#9698af) on white sheet — pre-existing app, unchanged |  2.84 : 1 |                                    **fail**                                    |    fail     |
| `accentOnLight` (#9A3AAC) on white sheet (light theme)                          |  5.87 : 1 |                                      pass                                      |    pass     |
| **Existing** `primary-dark` (#c058d2) on white — today's checkmark, unchanged   |  3.77 : 1 |                                      fail                                      |    pass     |
| `accentOnDark` (#D485E2) on dark sheet `#262432` (dark theme, new combination)  |  5.98 : 1 |                                      pass                                      |    pass     |
| **Un-deepened** `primary-dark` (#c058d2) on dark sheet `#262432` — rejected     |  4.03 : 1 | fail (barely; checkmark is 18px bold, just under the 18.66px large-text floor) |    pass     |
| `errorOnLight` (#C9151A) on white sheet (light theme)                           |  5.82 : 1 |                                      pass                                      |    pass     |
| **Existing** `red` (#ee1e23) on white — pre-existing app, unchanged             |  4.33 : 1 |                                 fail (barely)                                  |    pass     |
| `errorOnDark` (#FF5B5F) on dark sheet `#262432` (dark theme, new combination)   |  5.01 : 1 |                                      pass                                      |    pass     |
| **Un-deepened** `red` (#ee1e23) on dark sheet `#262432` — rejected              |  3.51 : 1 |                                      fail                                      |    pass     |

**Findings:**

1. **Body/title text is excellent everywhere** (13.9–18.4:1) on both sheet surfaces — `white`
   was already designed for dark surfaces and `darker` for light ones, so reusing them here (no
   new tokens) was correct.
2. **The existing `gray-dark` muted-text and `primary-dark`/`red` accent tokens are already
   borderline-to-failing on the light (white) sheet today** (2.84:1, 3.77:1, 4.33:1) — a
   **pre-existing gap in the shipped app**, not something this proposal introduces. This
   implementation's light theme uses the deepened variants (`mutedOnLight`, `accentOnLight`,
   `errorOnLight`) throughout and clears AA with margin.
3. **The un-deepened accent/error tokens also don't clear AA as text on the new dark sheet
   surface** (`primary-dark` 4.03:1, `red` 3.51:1) — expected, since neither was ever rendered on
   a `#262432` surface before (sheets were always white). `gray-dark` and `white` happen to
   already clear AA on `#262432` without changes (5.36:1, 13.95:1) because dark-family muted/text
   tokens were already tuned against dark canvases generally. The two that didn't
   (`primary-dark`, `red`) get their own lightened `OnDark` variants, mirroring the `OnLight`
   treatment the original proposal used for the opposite direction.

## Theme selection

**Shipped: System-follow by default, with a manual override.** Three states — System / Light /
Dark — not a plain two-way toggle.

- `apps/mobile/app.json` already declares `"userInterfaceStyle": "automatic"` — the app was set
  up to respect the OS appearance from day one.
- Per `CONTEXT.md`'s **Display setting** definition, this is explicitly "a per-Device
  presentation choice... that never affects which Card is drawn or whose progress is
  remembered" — not a Game, and not a decision that lives in the play engine.
- Persisted device-locally via `lib/theme-store.ts` (mirrors `lib/game-store.ts`'s pattern: a
  global `whocards-theme` AsyncStorage key, in-memory cache, default fallback), read on boot in
  `_layout.tsx` and applied via NativeWind's `colorScheme.set()`.

**Where it lives:** a new **"Theme"** chip, styled identically to the existing "Game: Global
Game" quiet outline chip on the Library screen, opening a page-sheet in the same house style as
Language/Game/Share. Inside: a "Theme" segmented control (System/Light/Dark) plus explanatory
copy. Secondary display languages and Tabletop mode stay where they are today (inside the
per-deck Language modal, opened from the player) — the mock in the first pass showed a combined
sheet, but that data is deck-scoped (or, for Tabletop, session-contextual) and the Library screen
has no deck context, so the shipped sheet is Theme-only. Named "Theme," not "Display," to avoid
colliding with the per-deck sheet's "Display settings" name (PR #168, merged mid-implementation —
see [§ Overlapping in-flight work](#overlapping-in-flight-work-and-how-it-was-reconciled)).

## Theming mechanism

**NativeWind's built-in `dark:` variant + `colorScheme` API** — no new theming library, no
Tailwind config changes needed.

- `apps/mobile/tailwind.config.ts` needed no changes: NativeWind v4 wires the `dark:` class
  variant to a runtime `colorScheme` observable automatically. Out of the box, with nothing
  called, it already follows `Appearance` (confirmed by reading
  `react-native-css-interop`'s `appearance-observables.js` — `systemColorScheme` tracks
  `Appearance.getColorScheme()` and `colorScheme.get()` falls back to it whenever no explicit
  override has been set). "System-follow" is the _default_ behavior, not something this
  implementation had to build.
- `colorScheme.set('light' | 'dark' | 'system')` (imperative, from `'nativewind'`) sets or clears
  a manual override. `useColorScheme()` (also from `'nativewind'`) returns the live resolved
  `{colorScheme: 'light' | 'dark'}` for the rare JS-level conditional (an `Ionicons` `color` prop,
  a `StatusBar` `style`, picking which `Image` source to `require`) that can't be expressed as a
  `dark:` class.
- `apps/mobile/src/hooks/use-theme-setting.ts` is the one new piece of glue: on mount, reads
  `getStoredTheme()` and calls `colorScheme.set()` with it; exposes a `select(next)` that updates
  the colorScheme, persists it, and fires the `theme_changed` observability event.
- **Status bar handling, deliberately NOT made globally theme-aware:** `_layout.tsx`'s root
  `<StatusBar style="light" />` default is untouched. Play and Pick a Card are _always_ dark
  (amendment 2) and need light status-bar icons regardless of the Theme setting — if the root
  default became theme-aware, a person in Light theme opening Pick a Card would get dark icons on
  a dark screen (wrong), and fixing that would require editing `pick-player.tsx`, which is
  off-limits (see below). Instead, only the screens that actually theme set their own local
  `<StatusBar>` override (Library, and each sheet) — `expo-status-bar` already resolves this by
  "last mounted wins, revert on unmount," so this composes correctly with zero root-layout risk.
- **Card surfaces read no theme state at all.** `question-text.tsx`, `player-bar.tsx` (as used
  by Play/Pick a Card), and all of `pick-player.tsx` are untouched — they still hardcode the same
  dark classes they did before this issue.

## Overlapping in-flight work, and how it was reconciled

Several other branches merged to `origin/main` while this issue was being implemented.
`origin/main` was merged into this branch before touching any file another PR had just changed,
each time, so the theming below is written against the current shape of each component, not a
stale one.

- **PR #166** rebuilt `share-modal.tsx` into a compact bottom sheet (transparent `Modal`, dimmed
  backdrop, drag handle, `ScrollView` cap) — the theming in this issue targets that structure,
  not the old `presentationStyle="pageSheet"` version described in the first pass of this doc.
- **PR #160** (`feat/pick-a-card-deck-flip`, the branch the first pass of this doc was careful
  not to touch) merged to `main` before this branch's amendments landed. That branch is no longer
  "open" or "owned by another agent" — but amendment 2 (cards always dark) means the outcome is
  identical either way: `pick-player.tsx` still needed zero changes, now for a pure design reason
  (the Card stays dark) rather than a merge-conflict-avoidance one.
- **PR #168** (issue #148, Tabletop mode) added a second "Display" surface: the per-deck
  `LanguageModal` now doubles as a **"Display settings"** sheet for single-language decks (its
  title changes when there's no language choice to make), hosting Tabletop mode (a global,
  device-wide Display setting, like Theme) and reachable from the player via a bottom-bar button
  now labeled "Display" (`options-outline`) when there's no language choice. This **does**
  overlap conceptually with this issue's own "Display" naming — reconciled as follows:
  - **`language-modal.tsx` was themed** (dark surface in dark mode / light in light mode, same as
    every other sheet) since it's chrome, same as any other modal — amendment 1 covers it
    regardless of what content it hosts. This is a pure styling change; none of its Tabletop
    logic, props, or copy changed.
  - **Theme was _not_ added into that sheet.** Tabletop mode belongs there because it only makes
    sense mid-session (you lay the phone flat while playing) and is naturally reached from the
    player's bottom bar. Theme is relevant _before_ any Deck is open too — it's what the Library
    screen itself looks like — so it keeps its own entry point there, consistent with how Game
    already works (a pre-session, device-global choice surfaced from Library, not from inside a
    Deck).
  - **The new Library entry point is named "Theme," not "Display,"** specifically to avoid
    colliding with the per-deck sheet's "Display settings" name — two different sheets, in two
    different places, doing two different things, would be confusing if both were literally
    called "Display." "Theme" is unambiguous and scoped correctly. Icon is `contrast-outline`,
    distinct from the per-deck button's `options-outline`.
  - Both are legitimately "Display settings" in the CONTEXT.md sense (presentation-only, never
    affects draws or progress) — they just don't need to share one UI surface, the same way Game
    and Language don't share a UI surface despite both being pre-play choices.

## Out of scope

- The app icon stays dark-only, per the issue. Not touched, not mocked.
- Card faces (Classic play, Pick a Card) — always dark, per amendment 2. `pick-player.tsx`,
  `question-text.tsx` untouched.
- Store screenshots / marketing assets; `docs/DESIGN.md`'s "Mobile v1 launch alignment" section
  governs those separately and would need its own pass once a theme ships.
- On-device verification (iOS/Android simulators, system-scheme switching, VoiceOver/TalkBack
  over the new sheet colors) — this branch was built and typechecked/tested/linted, but not run
  on a simulator or device. See the PR description for the on-device checklist.
