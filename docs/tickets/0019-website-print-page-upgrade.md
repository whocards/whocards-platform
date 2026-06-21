# Website: upgrade the print page (layout + print different pages/decks)

**Tags:** web, print, feature
**Surfaces:** web (`apps/website`)
**Status:** open (not started). Raised 2026-06-21.

## Context

The print experience is `src/pages/print.astro` + `src/components/Print.tsx`. It needs a better
layout and the ability to print **different pages** — e.g. choose a Deck/language and print its
Cards, across multiple printable pages, with proper print styling.

## Goal

A polished, configurable print flow: pick what to print (Deck and/or language, maybe a range),
get a clean multi-page print layout that paginates correctly.

## Approach (to refine)

1. Audit the current `Print.tsx` layout + `@media print` styles; identify what breaks across pages.
2. Selection UI: choose Deck (via the deck registry) + language; resolve Cards from the Pool/Deck.
3. Print layout: card grid sized to a paper format with page-breaks (`break-inside: avoid`,
   `@page` margins), front/back if double-sided cards are wanted.
4. Multi-page: paginate so N cards/page flow across pages cleanly; print preview parity.

## Open questions (resolve before building)

- Paper size(s) and cards-per-page? Single- or double-sided (question/back)?
- Which Decks/languages are printable — all, or a curated set?
- Is this for at-home printing or print-shop/PDF export?

## Acceptance

- Can select a Deck + language and print a clean, correctly-paginated multi-page output.
- Print preview matches the rendered result.

## References

- `src/pages/print.astro`, `src/components/Print.tsx`, `~data/decks`, the Pool
