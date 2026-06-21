# Website: break the Game.store ↔ urls circular dependency

**Tags:** web, architecture, refactor
**Surfaces:** web (`apps/website`)
**Status:** open (not started). Raised 2026-06-21 from a `fallow dead-code` finding.

## Context

`fallow dead-code` reports a circular dependency between the game store and the URL
helpers (the second of two it found; the first — a `~utils` barrel re-import in
`urls.ts` — was already fixed in `e71f291`):

```
apps/website/src/stores/Game.store.ts
  → utils/index.ts → utils/urls.ts → Game.store.ts
```

The cycle is two edges:

- `apps/website/src/utils/urls.ts:1` imports `idsStore` from `~stores/Game.store` and
  reads `idsStore.get().current` inside `getCurrentQuestionUrl` (`urls.ts:29`).
- `apps/website/src/stores/Game.store.ts:4` imports `getCurrentQuestionUrl` (via the
  `~utils` barrel) and calls it in `initGame` to set `.play` button hrefs (`Game.store.ts:33`).

Import cycles can cause module-init ordering bugs and block tree-shaking. The deeper
smell is direction: a low-level URL helper reaches **up** into a store, while the store
reaches **down** into the helper.

`getCurrentQuestionUrl` has exactly **two call sites**, both of which already have the
current question id in scope (directly or via `idsStore`):

- `Game.store.ts:33` — `getCurrentQuestionUrl()` inside `initGame`.
- `components/Modal/LanguageSwitcher.tsx:105` — `getCurrentQuestionUrl(props.lang)`.

## Goal

`fallow dead-code` reports **0 circular dependencies**, with no behaviour change to the
play-link URLs or the language switcher, and no new typecheck errors.

## Approach (recommended: parameterize the id out of the helper)

Make `getCurrentQuestionUrl` pure with respect to the store — pass the current question
id in instead of importing the store:

1. `utils/urls.ts`
   - Remove `import {idsStore} from '~stores/Game.store'` (this deletes the
     `urls → Game.store` edge that closes the cycle).
   - Change the signature to `getCurrentQuestionUrl(lang: string | undefined, currentId: QuestionId)`
     and use `currentId` in the `?q=` template instead of `idsStore.get().current`.
2. `stores/Game.store.ts`
   - Call `getCurrentQuestionUrl(undefined, idsStore.get().current)` (the store already
     owns `idsStore`). Keep importing `generateGame` as before; importing the helper is
     now a one-way `Game.store → urls` edge.
3. `components/Modal/LanguageSwitcher.tsx`
   - Import `idsStore` from `~stores/Game.store` (no cycle: this only adds a
     `LanguageSwitcher → Game.store` edge) and call
     `getCurrentQuestionUrl(props.lang, idsStore.get().current)`.

Prefer importing `getCurrentQuestionUrl` from `~utils/urls` directly (not the `~utils`
barrel) at the call sites, consistent with the `e71f291` fix.

If a cleaner separation emerges (e.g. moving the `.play` href side-effect out of the
store action, which is itself a smell — a store mutating the DOM), that's acceptable as
long as the cycle is gone and behaviour is preserved; document the choice.

## Scope by surface

### WEB (`apps/website`)

- `src/utils/urls.ts` — drop the store import; add the `currentId` param.
- `src/stores/Game.store.ts` — pass `idsStore.get().current` at the call site.
- `src/components/Modal/LanguageSwitcher.tsx` — supply the current id.

## Acceptance

- `pnpm dlx fallow@2.100.0 dead-code` reports **0 circular dependencies** (down from 1).
- The deep-link URL produced for `.play` buttons and the language switcher is byte-for-byte
  the same as before for the same page/state (same `?lang=…&q=…`).
- Website `typecheck` shows **no new errors** (12 pre-existing, unchanged) — the app is
  excluded from oxlint/oxfmt, so `astro check` is the gate.
- No simulator/runtime needed; this is a pure web refactor, but note it was not
  browser-verified here.

## Notes / out of scope

- Out of scope: the remaining `fallow` findings (unused exports/types, dependency hygiene)
  — most are framework false positives (Astro `Props`, iconify icon sets, `sharp`,
  `babel-plugin-react-compiler`, RN web/css-interop) and were deliberately left alone.
- Keep the change minimal: only the three files above should need edits.

## References

- The fixed barrel cycle: commit `e71f291`
- Cycle participants: `apps/website/src/utils/urls.ts`, `apps/website/src/stores/Game.store.ts`
- Call site: `apps/website/src/components/Modal/LanguageSwitcher.tsx:105`
- fallow explanation: https://docs.fallow.tools/explanations/dead-code#circular-dependencies
