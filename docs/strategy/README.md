# Strategy docs

This directory holds product/growth strategy write-ups that don't belong in code. It was ported
from the old standalone website repo's `docs/strategy/` (the monorepo predates that split) and
now also holds the newer AI-at-Work planning that grew alongside it.

- [`ai-at-work.md`](./ai-at-work.md) — competitor analysis and product strategy for a
  "Navigating AI at Work" line (Tier 0 free deck → Tier 1 paid deck → Tier 2 team SaaS license).
- [`ai-checkin-questions.md`](./ai-checkin-questions.md) — content brief and facilitator notes
  for the free "AI Check-In" deck (Tier 0).
- [`ai-checkin-landing-copy.md`](./ai-checkin-landing-copy.md) — landing-page copy draft for the
  AI Check-In deck.
- [`ai-at-work-landing-page-copy-feedback.md`](./ai-at-work-landing-page-copy-feedback.md) —
  review feedback on that landing copy.
- [`ai-at-work-question-variants.md`](./ai-at-work-question-variants.md) — describes five
  candidate question sets for the AI Check-In deck.
- [`ai-at-work-questions.csv`](./ai-at-work-questions.csv) — the question sets in spreadsheet
  form for easy side-by-side review.
- [`ai-at-work-question-prompt.md`](./ai-at-work-question-prompt.md) — the canonical LLM prompt
  used to generate each question-set variant (also the default prompt in the dev-only Question
  Lab, see below).

## Open HITL decision: which question set ships?

Five candidate question sets exist for the AI Check-In deck, all already ported into
`apps/website/src/data/decks/`:

- `ai-at-work.questions.json` — **facilitated** (current shipped deck): names AI, roles, and
  team agreements directly; easiest for a manager to run as a structured check-in.
- `ai-at-work-open.questions.json` — **open**: barely names AI; asks what feels different,
  fragile, human, or worth protecting.
- `ai-at-work-stories.questions.json` — **stories**: every card asks for a remembered moment.
- `ai-at-work-human.questions.json` — **human**: centers craft, identity, care, and judgment.
- `ai-at-work-together.questions.json` — **together**: first-person plural, aimed at team norms
  and shared agreements.

The deck actually shipped and served by the app lives in
`packages/decks/src/decks/ai-at-work.questions.json` and **stays as the current facilitated
version until a human picks a winner** — this is a deliberate content/voice decision, not a
technical one, and it is intentionally out of scope for any automated change.

The dev-only Question Lab (`apps/website/src/pages/dev/question-lab.astro`, not shipped to
production) exists to make that decision easier: it runs the canonical prompt against several
models side by side so a person can compare outputs and pick a direction before a winning run is
pasted into a variant file.
