# Share logic and tokens, not a cross-platform UI layer

**Status:** accepted

Web and mobile share the _headless_ parts only — the deck/Pool data and play engine (`packages/decks`) and the design tokens (`packages/tokens`) — and each app builds its own view: the web keeps its Astro/React-DOM UI, mobile rebuilds the equivalent screens in React Native primitives styled with NativeWind against the same tokens. We deliberately reject a shared cross-platform component layer (react-native-web, Tamagui, or a single design system rendering to both).

## Considered Options

- **Share logic + tokens, rebuild view per platform (chosen).** "Keep the design close" is honoured via shared tokens and a faithful re-implementation, without forcing the existing Astro web UI through a cross-platform abstraction.
- **Shared cross-platform UI (react-native-web / Tamagui).** Highest design-fidelity-by-construction, but it would require rewriting the current Astro web UI and adds a heavy abstraction for a questions-first app.

## Consequences

The `<Play>` web component is not reusable on mobile; its logic (shuffle, nav reducer, deck resolution, RTL detection) is extracted into `packages/decks` so both views drive the same behaviour. This is a deliberate "no" — do not later try to unify the two view layers expecting it was an oversight.
