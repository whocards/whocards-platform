# Mobile: native touch & motion — interactive gestures, Reanimated, haptics, press feedback

**Tags:** mobile, ux, performance
**Surfaces:** mobile (`apps/mobile`)
**Status:** **DONE** (`2597ce1` impl + `d667531` review-fix; merged to `main`). Reviewer APPROVED;
`pnpm check` green modulo the 12 known `website#typecheck` errors. On-device feel (haptics, 60/120fps
swipe, Reduce-Motion, web no-op) still needs a real device/simulator pass — see Acceptance.

## Context

The mobile player already ships the right libraries — `react-native-reanimated@4`,
`react-native-worklets`, and `react-native-gesture-handler` are all dependencies — but the
play screen does not use them for motion. Today:

- The swipe is `Gesture.Pan().runOnJS(true)` with a 60px threshold that fires only at
  `onEnd` (`apps/mobile/src/app/play/[deck].tsx:222-232`). The gesture is handled on the **JS
  thread**, and the card **does not follow the finger** — it jumps after a separate 260ms
  slide plays.
- Card-enter and the auto-hiding chrome fade use the **legacy `Animated` API** from
  `react-native` (`play/[deck].tsx:5,155-194`), not Reanimated.
- There are **no haptics anywhere** (`expo-haptics` is not installed).
- Buttons give only `active:opacity` / `active:bg` feedback — no press depression
  (`index.tsx:58`, `player-bar.tsx:22`).

The result reads as "web app in a shell." Moving the touch→transform loop onto the UI thread
(Reanimated + Gesture Handler), adding haptics, and giving buttons a press-spring is the
single biggest lift toward a native feel — and it reuses libraries already in the bundle.

The shared headless engine (`navReducer` / `getInitialNav` from `@whocards/decks`, ADR-0003)
must stay pure and unchanged — this ticket changes only _how_ navigation is triggered and
animated, not the navigation logic itself.

## Goal

The play card tracks the finger during a swipe, commits or springs back on release with one
continuous motion at 60/120fps, every meaningful touch has a subtle haptic, buttons visibly
depress, and all of it respects the OS "Reduce Motion" setting. No legacy `Animated` (from
`react-native`) remains in the play screen.

## Approach

### 1. Interactive, UI-thread swipe (the headline)

- Replace the `runOnJS(true)` pan with a worklet-driven `Gesture.Pan()`:
  - A `translateX` shared value updated in `onUpdate` so the card follows the finger.
  - A `useAnimatedStyle` on the card applies `translateX` plus a slight opacity falloff as it
    leaves.
  - `onEnd`: if `|translationX|` (or velocity) passes threshold, animate the card off-screen in
    that direction (`withTiming`/`withSpring`) and `runOnJS` the `dispatch({type:'next'|'previous'})`;
    otherwise spring back to 0.
  - The incoming card animates in from the opposite edge so navigation is one continuous motion,
    not a detached after-animation.
  - **Rubber-band at the deck ends:** the reducer already clamps `previous` at the first card —
    mirror that in the gesture (resist / reduced translation when there's nowhere to go) so the
    card doesn't slide freely off a boundary.
- Keep tap-to-reveal-chrome: compose the `Gesture.Tap()` with the pan (`Gesture.Race` /
  `Gesture.Exclusive`). `revealChrome` still fires on gesture begin.
- Preserve current semantics: swipe left → next, swipe right → previous (matches the web
  `<Play>` and the existing thresholds).

### 2. Migrate chrome fade + card-enter off legacy `Animated`

- `chromeOpacity` → a shared value driven by `withTiming`; the close button and `PlayerBar`
  wrappers become `Animated.View` from **`react-native-reanimated`**.
- Remove the `Animated` import from `react-native` in the play screen entirely.

### 3. Press-scale springs on buttons

- Add a small reusable `components/pressable-scale.tsx`: a `Pressable` that springs `scale` to
  ~0.96 on `pressIn` and back on `pressOut` (Reanimated), forwarding all accessibility props
  (`accessibilityRole`, `accessibilityLabel`, `hitSlop`, `className`, `onPress`).
- Use it for the landing **Play** button (`index.tsx:55`) and the player-bar `BarButton`
  (`player-bar.tsx:16`). This also covers the earlier "give the landing Play button the same
  feedback as everything else" note.

### 4. Haptics

- `npx expo install expo-haptics` (let Expo pick the SDK-56-aligned version).
- Add `lib/haptics.ts`: thin helpers (`selection()`, `impact('light'|'medium'|'rigid')`) that
  **no-op on web** (`Platform.OS === 'web'`) and **never throw** (swallow errors, matching the
  `@whocards/logger` "never throw" philosophy). expo-haptics already respects the system
  silent switch and Low Power Mode.
- Fire:
  - `selection()` on card change and on language select (`language-modal` `onSelect`).
  - `impact('light')` on the Play button and each player-bar button press.
  - `impact('medium')` (or `rigid`) at the moment a swipe **commits** to the next/previous card.
- Do not fire haptics on cold-start / first paint.

### 5. Respect Reduce Motion

- Read `AccessibilityInfo.isReduceMotionEnabled()` once and subscribe to
  `reduceMotionChanged`. When enabled, zero the slide travel and use near-instant transitions
  (navigation still works, just without the animated travel). Keep the gesture itself usable.

## Scope by surface

### MOBILE (`apps/mobile`)

- `src/app/play/[deck].tsx` — the gesture rewrite, Reanimated migration, commit/selection
  haptics, reduce-motion gate.
- `src/components/player-bar.tsx` — `BarButton` → press-scale + light-impact haptic.
- `src/app/index.tsx` — landing **Play** button → press-scale + light-impact haptic.
- `src/components/pressable-scale.tsx` — **new**, reusable press-spring wrapper.
- `src/lib/haptics.ts` — **new**, web-safe, never-throwing haptics wrapper.
- `package.json` — add `expo-haptics`.

## Acceptance

- The card visibly follows the finger during a drag; releasing past threshold advances with
  continuous motion; releasing under threshold springs back; you cannot drag past the first card.
- On device: a haptic fires on swipe-commit, on card change, on language select, and on each
  button press.
- The Play button and player-bar buttons visibly depress on touch.
- With OS "Reduce Motion" on, navigation still works without the slide travel.
- No `Animated` import from `react-native` remains in `play/[deck].tsx`.
- Web target still runs (haptics/press-scale degrade gracefully; no thrown errors).
- `pnpm check` is green **modulo the known pre-existing `website#typecheck` debt** (zero NEW
  errors); mobile `typecheck` + `lint` clean.

## Notes / out of scope

- **Do not modify the headless engine** (`navReducer`, `getInitialNav`, `getDirection` in
  `@whocards/decks`) — ADR-0003 keeps it pure; this is a presentation-layer change only.
- The Answer-record `enqueue`/`flush` wiring (`play/[deck].tsx:115-138`) is unrelated — leave its
  behaviour intact (it keys on `questionId`).
- Out of scope: platform-convention/chrome work (predictive back, status bar, language-modal
  icon, splash fade) — that is **ticket 0008**, disjoint file set.

## References

- Play screen: `apps/mobile/src/app/play/[deck].tsx`
- Buttons: `apps/mobile/src/components/player-bar.tsx`, `apps/mobile/src/app/index.tsx`
- Gesture Handler v2 + Reanimated (UI-thread gestures):
  https://docs.swmansion.com/react-native-gesture-handler/
- Reanimated 4 (UI-thread 60/120fps): https://docs.swmansion.com/react-native-reanimated/
- Expo Haptics (SDK 56): https://docs.expo.dev/versions/v56.0.0/sdk/haptics/
