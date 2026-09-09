# AI At Work Question Variants

These four alternate question files keep the same machine shape as
`packages/decks/src/decks/ai-at-work.questions.json`: 37 English-only prompts keyed from `ai-1` to
`ai-37`. That makes each one a drop-in candidate for the current AI Check-In deck.

The direction is closer to the original WhoCards library: simple questions, broad language, and
room for the player to decide what the question is really asking. The AI-at-work context comes
from the deck, the landing page, and the room. The card itself does not need to over-explain the
moment.

## Current `packages/decks/src/decks/ai-at-work.questions.json` (shipped deck)

The current deck is the most facilitated version. It names AI, roles, tools, and team agreements
directly, which makes it easy for a manager to run as a structured 20-minute check-in. Its strength
is clarity; its weakness is that some prompts already contain the frame of the answer, so people
may discuss the issue more than reveal the story underneath it.

## `apps/website/src/data/decks/ai-at-work-open.questions.json`

This is the most open and WhoCards-like version. It barely names AI and instead asks about what
feels different, useful, fragile, human, or worth protecting. It should work best when the goal is
authentic sharing, because each question can be answered as a feeling, a story, a practical worry,
or a hope.

## `apps/website/src/data/decks/ai-at-work-stories.questions.json`

This version is built around storytelling. Every card asks for a remembered moment: a shortcut, a
mistake, a promise, a task that changed, or the first time AI felt real at work. It is less abstract
than the open deck and should help groups move from opinions about AI into lived experience.

## `apps/website/src/data/decks/ai-at-work-human.questions.json`

This version centers craft, identity, care, and judgment. It treats AI as a way to ask what makes
someone's work personal, trustworthy, and hard-earned. It is a good fit for teams that need to talk
about value and dignity without getting trapped in tool mechanics.

## `apps/website/src/data/decks/ai-at-work-together.questions.json`

This version speaks in the first-person plural and is more explicitly about team norms. The prompts
are still short, but they aim the conversation toward trust, fairness, privacy, credit, and shared
agreements. It is the most useful version when a manager wants the session to end with a concrete
team understanding.
