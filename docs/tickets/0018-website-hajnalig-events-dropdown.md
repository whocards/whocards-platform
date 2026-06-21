# Website: Hajnalig events nav dropdown, split 2025 / 2026

**Tags:** web, navigation, events
**Surfaces:** web (`apps/website`)
**Status:** open (not started). Raised 2026-06-21.

## Context

Hajnalig is a recurring event but the nav exposes a single flat link
(`eventLinks = [{href: '/events/hajnalig', title: 'Hajnalig'}]` in
`src/constants/navigation.ts`), and the event lives at one route
(`src/pages/events/hajnalig/{index,play}.astro` + `_data/hajnalig-questions.json`).
There's no way to offer more than one year.

## Goal

The header surfaces Hajnalig as a **dropdown** with per-year entries (**2025**, **2026**),
each routing to its own event page/deck.

## Approach

1. Restructure routes per year, e.g. `/events/hajnalig/2025` and `/events/hajnalig/2026`
   (move the current page to `2025` or whichever it represents; clarify which year today's
   content is). Keep `/events/hajnalig` as a redirect/index to the latest.
2. Per-year data/decks (the questions JSON and any year-specific copy/branding/sponsor logos).
3. Nav: replace the single `eventLinks` entry with a dropdown (DaisyUI menu) listing the years;
   render in both the desktop navbar and the mobile drawer in `Navigation.astro`.

## Acceptance

- Header shows a Hajnalig dropdown with 2025 + 2026; each opens the right event.
- Existing `/events/hajnalig` links don't 404 (redirect to latest).

## Notes / out of scope

- Confirm which year the current content is, and whether 2026 content exists yet or is a placeholder.

## References

- `src/constants/navigation.ts` (`eventLinks`), `src/components/Navigation.astro`, `src/pages/events/hajnalig/`
