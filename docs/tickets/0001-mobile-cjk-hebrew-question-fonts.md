# Mobile: brand-faithful fonts for CJK questions

**Tags:** mobile, languages
**Status:** open for CJK (Hebrew done — Noto Sans Hebrew bundled, ~33 KB)

## Context

The mobile app loads the brand faces via `expo-font` — `golos-text` (body) and
`aptly` (display) — and applies them across the UI and the question text (commit
`634fd9f`). `golos-text` covers Latin + Cyrillic, so it serves all languages
except the non-Latin scripts.

**Hebrew (`he`) is now matched** — `noto-sans-hebrew` (≈ 33 KB) is bundled and applied
to Hebrew questions (`SCRIPT_FONTS` in `apps/mobile/src/app/play/[deck].tsx`). That was
option 3 below; it was cheap enough to just do.

The remaining gap is **`zh` (Mandarin)** and **`jp` (Japanese)**, which fall back to the
**device system font** (see `SYSTEM_FONT_LANGUAGES`). That renders correctly — full
glyph coverage, no tofu — but it is **not the website's Noto typeface**, and CJK
rendering varies by device (iOS PingFang/Hiragino vs Android Noto).

The blocker to just bundling them: the Noto CJK `.ttf`s are **huge** —
`noto-sans-chinese` ≈ 2.0 MB, `noto-sans-japanese` ≈ 2.6 MB. Adding ~4.6 MB to every
install for a feature most users never hit is the trade-off we deferred.

Source `.woff2` files already live in `apps/website/public/fonts/`; converting to
`.ttf` for RN is a one-liner with `fontTools` (as done for the brand faces).

## Options

1. **Keep the system fallback (status quo).**
   Cost: 0 KB, no work. Renders fine everywhere. Downside: not the Noto typeface,
   and CJK looks different per device. Fine if we accept "correct but not pixel-matched."

2. **Bundle all three Noto faces.**
   Exact web match, offline, trivial (`useFonts` + a per-language family map).
   Downside: **+~4.6 MB** in every build for 3 of 14 languages.

3. **Bundle Hebrew only; system fallback for CJK.** ✅ **Done.**
   Hebrew is ~33 KB, so we got an exact match for `he` essentially for free and left the
   heavy CJK on system. Remaining decision is purely about zh/jp.

4. **Subset the Noto faces to the glyphs the decks actually use.**
   Run `fontTools` subsetting against the real `zh`/`jp`/`he` question text → likely
   tens of KB per face instead of MBs. Exact match, bundled, small.
   Downside: needs a build/codegen step that **re-subsets when deck content changes**;
   a new glyph added without re-running would render as tofu. Best long-term parity.

5. **Lazy-load Noto on first use.**
   Host the `.ttf`s (CDN or `expo-asset`) and `Font.loadAsync` the relevant face the
   first time a user selects zh/jp/he. Base bundle stays tiny.
   Downside: needs a hosting location, network on first use, and a loading state —
   the most moving parts.

## Lean (not decided)

- Hebrew is handled (option 3). The open question is **zh/jp only**.
- If we want web parity for CJK: **option 4 (subset)** — tiny and exact — or **option 2**
  if we want it dead-simple and don't mind the ~4.6 MB.
- **Option 1** is a fine no-op if "correct but system-rendered CJK" is acceptable.

## References

- Brand-font loading: `apps/mobile/src/app/_layout.tsx`, commit `634fd9f`
- Per-language fallback: `SYSTEM_FONT_LANGUAGES` in `apps/mobile/src/app/play/[deck].tsx`
- Font tokens + families: `packages/tokens/src/typography.ts`
- Web reference (per-`:lang` font + `@font-face`): `apps/website/src/styles/base.css`
- Source faces: `apps/website/public/fonts/noto-sans-*.woff2`
