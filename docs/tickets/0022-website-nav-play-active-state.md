# Website: header doesn't highlight the Play nav item while playing

**Tags:** web, navigation, bug
**Surfaces:** web (`apps/website`)
**Status:** DONE. Fixed in commit TBD. Root cause: `NavLink.astro` applied `text-white` unconditionally alongside `text-primary-light` when selected; `text-white` appeared later in the Tailwind stylesheet so it overrode the highlight. Fix: make `text-white` conditional on `!selected`, and update `Navigation.astro` to match the entire `/play` route family via `link.play ? pathname.startsWith('/play') : pathname === link.href`.

## Context

The nav active state is an **exact path match** — `Navigation.astro` passes
`selected={Astro.url.pathname === link.href}` to `NavLink.astro`, which applies
`text-primary-light` when `selected`. The Play item (`{href: '/play', play: true}`) isn't
highlighted while playing.

Notes from a first look:

- `trailingSlash: 'never'` and the game renders at `/play` (`play.astro`, with `?lang=&q=` query
  that doesn't change `pathname`), so a bare exact match on `/play` _should_ match — the cause is
  subtler and needs reproduction. Suspects: the `.play` class + `initGame()` rewriting the link's
  href, the `pointer-events-none` on selected, or the Layout passing a different link set on the
  play route.
- Event play (`/events/hajnalig/play`) and any legacy per-language/question routes won't match
  `/play` at all (and question pages hide the desktop nav via `isQuestionPage`).

## Goal

The Play nav item is highlighted whenever the user is in the play experience, on every play route.

## Approach

1. Reproduce on the running site; capture the exact `pathname` while "playing".
2. Make `selected` robust for Play: match the play **route family** (e.g. `pathname === '/play' ||
pathname.startsWith('/play')`, plus event-play if desired) rather than a single exact string;
   normalize trailing slashes defensively.
3. Confirm the `.play` class / `pointer-events-none` / `initGame` href-rewrite don't visually
   override the selected style.

## Acceptance

- On `/play` (and other play routes in scope) the Play item shows the active style.
- Non-play routes are unaffected.

## References

- `src/components/Navigation.astro` (`selected=...`), `src/components/Buttons/NavLink.astro`, `src/pages/play.astro`, `src/constants/navigation.ts`
