# The soul of WhoCards

This file is the product's conscience. `CONTEXT.md` defines what words mean; `docs/DESIGN.md` defines how surfaces look; this file defines what WhoCards is _for_, so that anyone — human or agent — proposing a feature can test it against the soul before writing a line of code.

## What WhoCards is

WhoCards is a conversation game for people who are actually together. Curated questions move a real table — strangers, friends, a family, a team — past "What do you do?" toward "Who are you?". The product succeeds when the phone stops mattering: someone reads a Question aloud, and the conversation that follows is the experience. The app is the deck on the table, not the destination.

Meaningful human connection is worthwhile in itself. Sharing something real and listening attentively can be the whole value of an encounter, including between strangers. Participants may discover something useful, feel understood, or leave with an unresolved experience. A lesson, agreement, or action plan is not required to make the connection worthwhile.

Workplace offerings extend this purpose into working life. AI at Work and The Third Relationship invite people to explore their working relationships, including how they relate to AI. The aim is greater awareness and more conscious choices. Novelty, increased AI adoption, and greater closeness to AI are not measures of success. A workshop can create an opportunity for connection in the room and help people carry that possibility back to work.

For workshop design, Question briefs, and workshop landing pages, read [the workshop foundations](docs/workshops/foundations.md) before choosing activities or making promises.

## The character

A quiet invitation into a meaningful conversation: warm, curious, direct, human. Intimate rather than corporate. **Playful rather than gamified.** Bold without becoming loud. The Question is always the focus; everything else — chrome, motion, decoration — exists to serve it and should know when to disappear.

Cards are the product metaphor, not a generic container. The ritual of a deck — drawing, flipping, holding a card while you answer — is worth investing in, because ritual creates the small moment of theatre that gives a question weight at a real table.

In the usual shared game, a person first sees their Question when it is their turn to answer. That unrehearsed encounter is part of the ritual; while another person answers, attention belongs with them. Preserve this quality when adapting the game. Reflection and preparation may have a place in other activities or formats; distinguish those from the card encounter. Sharing is an invitation, and a person can pass.

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
