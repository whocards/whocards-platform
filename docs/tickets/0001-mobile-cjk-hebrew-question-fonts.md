# Mobile: brand-faithful fonts for CJK + Hebrew questions

**Tags:** mobile, languages
**Status:** open (decide later)

## Context

The mobile app loads the brand faces via `expo-font` — `golos-text` (body) and
`aptly` (display) — and applies them across the UI and the question text (commit
`634fd9f`). `golos-text` covers Latin + Cyrillic, so it serves all languages
except the non-Latin scripts.

For **`zh` (Mandarin), `jp` (Japanese), `he` (Hebrew)** the question falls back to
the **device system font** (see `SYSTEM_FONT_LANGUAGES` in
`apps/mobile/src/app/play/[deck].tsx`). That renders correctly — full glyph
coverage, no tofu — but it is **not the website's typeface**. The web uses Noto
faces for these scripts (`noto-sans-chinese` / `noto-sans-japanese` /
`noto-sans-hebrew`, defined in `apps/website/src/styles/base.css` and the
`@whocards/tokens` font tokens). So on those three languages mobile and web diverge,
and the CJK rendering varies by device (iOS PingFang/Hiragino vs Android Noto).

The blocker to just bundling them: the Noto CJK `.ttf`s are **huge** —
`noto-sans-chinese` ≈ 2.0 MB, `noto-sans-japanese` ≈ 2.6 MB (Hebrew is tiny,
≈ 33 KB). Adding ~4.6 MB to every install for a feature most users never hit is the
trade-off we deferred.

Source `.woff2` files already live in `apps/website/public/fonts/`; converting to
`.ttf` for RN is a one-liner with `fontTools` (as done for the brand faces).

## Options

1. **Keep the system fallback (status quo).**
   Cost: 0 KB, no work. Renders fine everywhere. Downside: not the Noto typeface,
   and CJK looks different per device. Fine if we accept "correct but not pixel-matched."

2. **Bundle all three Noto faces.**
   Exact web match, offline, trivial (`useFonts` + a per-language family map).
   Downside: **+~4.6 MB** in every build for 3 of 14 languages.

3. **Bundle Hebrew only; system fallback for CJK.**
   Hebrew is ~33 KB, so we get an exact match for `he` essentially for free and leave
   the heavy CJK on system. Cheap, partial parity. Downside: still no parity for zh/jp.

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

- If we want web parity: **option 4 (subset)** — tiny and exact — or **option 2** if we
  want it dead-simple and don't mind the size.
- **Option 3** is a near-free immediate win for Hebrew regardless of what we pick for CJK.
- **Option 1** is a fine no-op if "correct but system-rendered CJK" is acceptable.

## References

- Brand-font loading: `apps/mobile/src/app/_layout.tsx`, commit `634fd9f`
- Per-language fallback: `SYSTEM_FONT_LANGUAGES` in `apps/mobile/src/app/play/[deck].tsx`
- Font tokens + families: `packages/tokens/src/typography.ts`
- Web reference (per-`:lang` font + `@font-face`): `apps/website/src/styles/base.css`
- Source faces: `apps/website/public/fonts/noto-sans-*.woff2`
