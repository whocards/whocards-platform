# Mobile: platform conventions & chrome polish — predictive back, status bar, sheet, splash

**Tags:** mobile, ux, platform
**Surfaces:** mobile (`apps/mobile`)
**Status:** open

## Context

Several small, high-signal "this is a native app" conventions are currently off or rough in the
mobile app:

- **Android predictive back is explicitly disabled** (`apps/mobile/app.json:22`,
  `predictiveBackGestureEnabled: false`). Modern Android (13+) expects the predictive back
  gesture; its absence reads as non-native. The player already routes back through
  `router.back()` (`play/[deck].tsx:210`), so it should work once enabled.
- **The status bar is hardcoded `light` globally** (`apps/mobile/src/app/_layout.tsx:35`), but
  the language modal is a **white** sheet (`language-modal.tsx:32`). Light-on-white status icons
  are invisible there (especially on Android).
- **The language-modal close control is a `Text "✕"`** (`language-modal.tsx:36`) rather than the
  crisp `Ionicons` used everywhere else.
- **The splash→landing handoff is a hard cut** — `SplashScreen.hideAsync()` pops straight to the
  first screen (`_layout.tsx:28`) with no fade.

These are quick, mostly-config changes that complement the motion/haptics work in ticket 0007.

## Goal

The Android back swipe is predictive and native, the status bar adapts to the surface beneath it
(light over the dark player/landing, dark over the white sheet), the language sheet uses a proper
icon (and a native grabber where cheap), and the app fades in from the splash instead of cutting.

## Approach

### 1. Android predictive back

- Set `predictiveBackGestureEnabled: true` in `app.json`.
- Verify the back swipe drives expo-router navigation correctly (landing ⇄ player). If SDK 56's
  experimental native-stack v5 is required for smooth predictive back with expo-router, evaluate
  enabling it; otherwise the flag alone is sufficient. Document what was needed.

### 2. Per-surface status bar / edge-to-edge

- Stop forcing a single global `light` bar. Keep light content over the dark player and landing;
  set **dark** status-bar content for the white language modal (an `expo-status-bar` `StatusBar`
  inside the modal, or set it on open/close).
- Confirm edge-to-edge (default in modern Expo) lays out with safe-area insets on every screen —
  the player bar already uses `useSafeAreaInsets` (`player-bar.tsx`); make sure the landing and the
  modal header don't collide with the status bar / nav bar.

### 3. Language-modal polish

- Replace the `Text "✕"` close control with `Ionicons name="close"` (size/color consistent with
  the player's close button), keeping the `accessibilityLabel` and `hitSlop`.
- If low-effort with the installed `react-native-screens`, add a native sheet grabber / detents to
  the iOS `pageSheet`; otherwise leave the current `presentationStyle="pageSheet"` as-is (it is
  already a native sheet with swipe-to-dismiss).

### 4. Splash → landing fade

- Soften the hard cut: either use `expo-splash-screen`'s fade options or a brief Reanimated
  fade-in of the first screen after `hideAsync()`, so the app eases in rather than popping. Keep
  the existing behaviour of holding the splash until the brand fonts are loaded
  (`_layout.tsx:20-31`).

## Scope by surface

### MOBILE (`apps/mobile`)

- `app.json` — `predictiveBackGestureEnabled: true`.
- `src/app/_layout.tsx` — per-surface status-bar handling; splash fade-in.
- `src/components/language-modal.tsx` — `Ionicons` close; dark status bar while open; optional
  native grabber/detents.

## Acceptance

- On Android, the system back gesture is predictive (peek/animation) and navigates correctly
  (player → landing → exit).
- The status bar is legible on every surface — light over the dark screens, dark over the white
  language sheet.
- The language-modal close is an `Ionicons` glyph; the modal still dismisses by swipe and button.
- The app fades in from the splash instead of cutting.
- `pnpm check` is green **modulo the known pre-existing `website#typecheck` debt** (zero NEW
  errors); mobile `typecheck` + `lint` clean.

## Notes / out of scope

- Out of scope: gestures, Reanimated migration, haptics, and button press-feedback — that is
  **ticket 0007** (disjoint file set: 0007 owns `play/[deck].tsx`, `player-bar.tsx`, `index.tsx`;
  0008 owns `app.json`, `_layout.tsx`, `language-modal.tsx`).
- No new runtime dependencies expected (`expo-status-bar`, `react-native-screens`,
  `@expo/vector-icons` are already installed).

## References

- App config: `apps/mobile/app.json`
- Root layout / splash / status bar: `apps/mobile/src/app/_layout.tsx`
- Language sheet: `apps/mobile/src/components/language-modal.tsx`
- Expo SDK 56 (Stack v5, Android predictive back): https://expo.dev/changelog/sdk-56
- app.json `predictiveBackGestureEnabled`: https://docs.expo.dev/versions/latest/config/app/
