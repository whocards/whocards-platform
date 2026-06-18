# Global Game is a shared-progress overlay, not a server-authoritative draw

**Status:** accepted

The default Game (see `CONTEXT.md` → Global Game) gives every player a sense that "the
world is collectively working through the Deck": every Question must be answered by
_someone_ before the Deck starts over. The question was **how** that shared state drives
play.

We model it as a **shared-progress overlay**, scoped **per Deck**:

- Each player draws their **own** local, non-repeating pass over the Deck — essentially
  today's `nav.ts` shuffle-walk. The draw is **never** blocked on the network.
- Every serve ("answered" = served, for now — see `CONTEXT.md` → Answered) fires a
  lightweight ping that (1) bumps the Deck's monotonic **`questions_answered`** total and
  (2) marks that Question answered in the Deck's **current global cycle**.
- When the cycle's distinct-answered set covers every Question in the Deck, that is **one
  game played** (`games_played++` for that Deck) and the cycle resets — the Deck "starts
  over" for the world.
- **Personal Game** is the same overlay with one change: the player's pass is **persisted
  to their account** instead of being device-local, so they never repeat a Question until
  _they personally_ have answered the whole Deck. (Paid — see the monetization ADR.)

## Considered Options

- **Shared-progress overlay (chosen).** Local draw + async pings to shared per-Deck
  counters. Robust under latency, degrades gracefully offline (pings queue and flush), no
  draw races, and reuses the existing per-question tracking POST shape. The trade-off: the
  "shared deck" is a _progress illusion_ — two players can be served the same Question at
  once; the global state is a counter, not a live dealer.

- **Server-authoritative draw (A) — deferred.** The server hands each player "the next
  globally-unanswered Card." True shared coordination, but every draw is a network
  round-trip, it cannot work offline, it has concurrency races, and with "answered =
  served" the 66-Card Deck completes after just ~66 total serves across all players —
  near-constant resets at any real traffic. Explicitly **revisited later**, not chosen now.

- **No global state (pure client).** Simplest, but drops the "collective playthrough" and
  the `questions_answered` / `games_played` counters that are core to the product idea.

## Notes

- **Per-Deck scope**, decided alongside this. `library` and `ai-at-work` run independent
  cycles; if two Decks share a pooled Question, answering it in one does **not** advance the
  other.
- "Answered = served" is today's definition; a future minimum on-screen dwell, and later
  Facilitation Mode's explicit Skip, refine _when_ a serve counts — neither changes this
  overlay shape.
- The deferred (A) is recorded here so a future reader knows the overlay was a deliberate
  first step, not an oversight.
