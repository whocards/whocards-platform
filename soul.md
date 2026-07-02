# The soul of WhoCards

This file is the product's conscience. `CONTEXT.md` defines what words mean; `docs/DESIGN.md` defines how surfaces look; this file defines what WhoCards is _for_, so that anyone — human or agent — proposing a feature can test it against the soul before writing a line of code.

## What WhoCards is

WhoCards is a conversation game for people who are actually together. Curated questions move a real table — friends, a family, a team — past "What do you do?" toward "Who are you?". The product succeeds when the phone stops mattering: someone reads a Question aloud, and the conversation that follows is the experience. The app is the deck on the table, not the destination.

The same engine has a professional edge: the honest-conversation layer of change at work. When AI arrives in people's jobs, adoption stalls on fear, identity, and trust — not mechanics. Nobody owns the space where a team talks honestly about that. WhoCards' brand promise — honest self-expression, active listening, deeper connection — is that exact bridge, which is why the AI-at-Work deck is a focusing of the product, not a pivot.

## The character

A quiet invitation into a meaningful conversation: warm, curious, direct, human. Intimate rather than corporate. **Playful rather than gamified.** Bold without becoming loud. The Question is always the focus; everything else — chrome, motion, decoration — exists to serve it and should know when to disappear.

Cards are the product metaphor, not a generic container. The ritual of a deck — drawing, flipping, holding a card while you answer — is worth investing in, because ritual creates the small moment of theatre that gives a question weight at a real table.

## Tests for a new idea

Ask these before building:

1. **Does it deepen the conversation at the table, or does it pull eyes back to the screen?** Features that make the phone more interesting than the person across from you are anti-soul, however delightful.
2. **Does it add ritual or does it add game mechanics?** A flip, a deal, a pass of the phone — ritual. Points, streaks, leaderboards, countdown pressure, achievements — gamification. WhoCards is playful, never gamified.
3. **Does the Question stay the hero?** Motion and decoration may frame the reveal of a Question; they may never compete with it once revealed.
4. **Does it respect the mixed table?** Tables are bilingual, cross-generational, cross-cultural. Fourteen languages, RTL, multiple scripts — features should widen who can sit at the table (a Hebrew-speaking grandmother, an international team), not narrow it.
5. **Does it stay honest?** No dark patterns, no manufactured urgency, no fake scarcity, no copy that overclaims. Paid features are paid because they add real value, and the free experience must remain genuinely whole.

## What we will not build

- Scores, streaks, leaderboards, or any comparison between players.
- Timers as pressure. (A facilitation timer that a _host_ controls to give everyone a turn is service to the table; a countdown that rushes an answer is not.)
- Engagement mechanics whose purpose is session length rather than conversation depth.
- Loud decoration that competes with the Question.

## Where the soul lives in the architecture

- The play engine is pure and access-blind: Decks supply content, Games supply rules, an entitlement layer decides access, Display settings change only presentation. Keeping these separate is a soul decision, not just a code decision — it keeps rules honest and features composable.
- The Answer record is durable product truth, not an analytics exhaust. What the product remembers about a table, it remembers respectfully and usefully.
