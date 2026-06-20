# Mobile: persist the selected language across app reloads

**Tags:** mobile, ux, persistence
**Surfaces:** mobile (`apps/mobile`)
**Status:** open (not started). Raised 2026-06-21.

## Context

On mobile, the chosen question language is **session-only**: it lives in
`useState(defaultLanguage)` in the player and resets to the deck's first language on
every cold start / reload.

- `apps/mobile/src/app/play/[deck].tsx` — `const [language, setLanguage] = useState(defaultLanguage)`
  (`defaultLanguage = languages[0]`); the value is never read from or written to storage.
- The language picker (`apps/mobile/src/components/language-modal.tsx`) only calls the in-memory
  `setLanguage` via its `onSelect` handler.

The **web already persists this**: `apps/website/src/components/Play/Play.tsx` reads/writes a
`languageStorageKey` (default `'play-language'`) in `localStorage` (`getStoredLanguage`), validated
against the deck's `languages`, with a `?lang=` deep-link override. Mobile should reach parity so a
returning player keeps the language they last chose.

Mobile already has the right primitive: `@react-native-async-storage/async-storage` is a dependency
and is used exactly this way for the Device id in `apps/mobile/src/lib/device-id.ts` (get → fallback
→ set, with an in-memory cache). This ticket mirrors that pattern for language.

## Goal

A player who picks a language, then kills and reopens the app (or the deck), returns to that same
language. An unset or now-invalid stored value falls back cleanly to the deck default.

## Approach

### 1. A small persisted-language helper (`apps/mobile/src/lib/language-store.ts`)

- `getStoredLanguage(deckSlug)` / `setStoredLanguage(deckSlug, language)` over AsyncStorage,
  following the `device-id.ts` shape (await get, in-memory cache optional).
- **Per-deck key** so different decks remember independently, e.g. `whocards-language:${deckSlug}`.
  (Web uses one `languageStorageKey` per deck config — same intent.) Keep the key naming consistent
  with the other `whocards-*` AsyncStorage keys.

### 2. Wire it into the player (`play/[deck].tsx`)

- AsyncStorage is async, so it can't seed `useState` synchronously like the web's `localStorage`.
  Initialize state to `defaultLanguage`, then in a mount effect load the stored value and
  `setLanguage` if it's present **and still in this deck's `languages`** (guard against a stored code
  the deck no longer offers).
- Persist on change: when the language modal's `onSelect` fires, write through
  `setStoredLanguage(deckSlug, next)` alongside the existing `setLanguage(next)`.

### 3. First-paint behaviour

- A brief flash of `defaultLanguage` before the stored value resolves is acceptable, but prefer to
  avoid it where cheap — e.g. resolve the stored language before the first card paints, or hold the
  initial render until the read settles (it's a single fast AsyncStorage hit). Decide and document
  which; do not regret-ship a visible language flip on every launch.

## Scope by surface

### MOBILE (`apps/mobile`)

- `src/lib/language-store.ts` — new AsyncStorage helper (get/set, per-deck key).
- `src/app/play/[deck].tsx` — seed language from storage on mount; persist on change.
- `src/components/language-modal.tsx` — no API change expected; persistence is wired at the
  `onSelect` call site in the player.

## Acceptance

- Select a non-default language, fully quit and relaunch the app → the deck opens in the
  previously-selected language.
- A deck with a single language is unaffected (no picker, default used).
- A stored language code that is no longer in the deck's `languages` falls back to the deck default
  (no crash, no blank text).
- No persistent flash of the wrong language on every launch (per the first-paint decision above).
- `pnpm check` green **modulo the known pre-existing `website#typecheck` debt** (zero NEW errors);
  mobile `typecheck` + `lint` clean.

## Notes / out of scope

- Out of scope: a `?lang=` / deep-link override (web has one; mobile deep-linking is a separate
  concern), and any cross-device sync of the preference.
- No new runtime dependencies — `@react-native-async-storage/async-storage` is already installed.
- Consider folding the per-deck key convention into a shared place if a second persisted player
  preference appears later (e.g. last card index); not needed now.

## References

- Mobile player language state: `apps/mobile/src/app/play/[deck].tsx` (`useState(defaultLanguage)`)
- Mobile language picker: `apps/mobile/src/components/language-modal.tsx` (`onSelect`)
- AsyncStorage pattern to mirror: `apps/mobile/src/lib/device-id.ts`
- Web parity (localStorage persistence): `apps/website/src/components/Play/Play.tsx`
  (`getStoredLanguage`, `languageStorageKey`)
