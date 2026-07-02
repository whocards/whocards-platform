# ADR-0007: Share Card images render on demand; OG link previews stay build-time

Date: 2026-07-02
Status: Accepted

## Context

CONTEXT.md defines a **Share Card** — a Card rendered as a standalone branded image sized for a destination. The first form, the OG link-preview image, is prerendered at build time: `src/pages/og/[language]/[id].png.ts` walks every (question, language) pair via `getStaticPaths`, and a persisted Netlify cache (`.cache/og`) makes rebuilds nearly free. The Share feature adds two new Share Card sizes (story 9:16, post 4:5) that the mobile app and the web player fetch at share time, and Custom Decks — player-authored Questions that cannot be enumerated at build — are on the roadmap.

## Decision

The new Share Card sizes are rendered **on demand** by a server endpoint (`prerender = false`, a Netlify function), not prerendered — even though the Pool content _could_ be prerendered today. The existing OG images stay build-time; both paths must consume the same renderer (`server/card-image.ts`, generalized over size) so the design has a single source.

The print PDF endpoint (`server/print/render.ts`) is the proven pattern: native `@resvg/resvg-js` and font assets are bundled into the function via `netlify({includeFiles})`, and responses are CDN-cached with immutable cache headers.

## Considered options

- **Prerender the new sizes like the OG images.** Rejected by choice, not necessity: it can never serve Custom Decks, and each new size multiplies build-surface (~924 PNGs per size). On-demand serves any (question, language, size) from day one.
- **Move the OG images to on-demand too.** Not now — they work, they're free at build thanks to the cache, and link-unfurl bots are latency-tolerant but flaky-render-intolerant; revisit only if maintaining two paths over one renderer becomes a burden.

## Consequences

- Render failures move from deploy time (build fails) to share time (a player's request fails); the endpoint needs CDN caching and cheap failure behavior.
- Mobile app binaries embed the endpoint URL shape, so the URL contract is hard to change once shipped — design it to carry size and (later) Custom Deck identity from the start.
- Custom Deck share images need no new architecture when they arrive.
