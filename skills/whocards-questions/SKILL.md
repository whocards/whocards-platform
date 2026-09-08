---
name: whocards-questions
description: Write or revise WhoCards questions and reflective writing prompts for a frame that combines topic, time, situation, intention, audience, and format. Use when the user wants an insightful or thought-provoking question for a conversation, a check-in, a journal, or a writing prompt.
license: MIT
metadata:
  version: '0.1'
  source: https://github.com/whocards/whocards-platform/tree/main/skills/whocards-questions
---

# WhoCards questions

Invite honest self-expression, active listening, and connection. A good question helps people discover who someone is, or helps a person hear themselves in solo reflection. The voice is warm, curious, direct, and human. Play and difficult feelings both belong.

## Ground the request

Read [references/mission.md](references/mission.md) for what the questions serve, then [references/editorial-calibration.md](references/editorial-calibration.md) for worked examples and the maintainer's editorial taste.

Check candidates against the existing deck in [assets/pool-en.json](assets/pool-en.json), the English pool that ships with this skill. If the working directory contains `packages/decks/src/pool/questions.json`, read that instead; it is authoritative and may be newer. For a named deck, another language, or a list the user supplies, use that content too.

## Understand the frame

A **frame** combines any of these dimensions, expressed in ordinary language. The values below are illustrations, not a menu:

- **Topic:** being a parent.
- **Time:** this past year (the preceding twelve months unless otherwise specified).
- **Situation:** after a difficult day.
- **Intention:** process, reconnect, celebrate, explore.
- **Audience:** alone, partners, friends, colleagues.
- **Format:** a conversation question or a question to write from.
- **Setting:** spoken at a table, written alone in a journal.

Any frame works without new guidance: retirement, after an argument, a birthday dinner. Honor the supplied dimensions together. Parenthood during the past year means both; a time-only frame can range across life. A bare writing request means reflective personal writing. Journal and writing prompts should give the writer a question to answer. Use an instruction-only exercise when explicitly requested. Vary sentence construction across a set.

**Resolve the output count first.** Use any explicit count; otherwise deliver one for a singular request and ten for a plural request or a deck, pack, or list. A table is a setting, not a count instruction. Shortlist privately, then deliver the required number. Follow the language and format the user names. Ask a clarifying question only when the missing context would change whether the questions suit the people at the table.

## Write

**Give the question a human subject.** Experiences, relationships, feelings, choices, desires, and imagination offer ways in. Favor someone's lived relationship with a topic over their general opinion or a definition. Keep one focus. A short follow-up can deepen the same answer; it should not introduce a second full subject.

**Let the person supply the experience.** Distinguish the context the user established from an event you invented. "Who surprised you?" requires someone to have done so; a question about expectations can stay direct without inventing that event. When a particular event is the subject, a conditional question can welcome it without assuming it happened. Direct questions about feelings, perspectives, wishes, and hypothetical situations can stay open. Avoid implying a deficit or struggle the user did not supply; do not make every question conditional.

**Keep specificity that earns its place.** A concrete subject helps someone answer; an arbitrary qualifier limits what counts. Prefer "a moment" to "an ordinary moment" unless ordinary life is the requested subject. Let the answerer choose scale and intensity. Cut filler, elaborate setups, and decorative modifiers while preserving the question's meaning.

**Invite depth without demanding a conclusion.** Welcome conflict, grief, love, uncertainty, and joy without requiring a confession, self-improvement plan, or cheerful lesson. Leave room for an unresolved experience. Learning and change are welcome when they serve the request; do not impose a lesson or growth arc. When asked to process a difficult day, make room to notice what happened without requiring resolution; the user need not specify this approach. At a mixed table, use language that travels across cultures and life circumstances. Match personal disclosure to the setting.

**Preserve play.** A playful question can connect through shared imagination without a hidden lesson. For writing, give the pen somewhere to start while letting the writer choose their details.

## Edit before delivering

Every question, whether it ships alone or in a set:

- Does it serve the whole frame and reveal something human?
- Can someone understand it on first hearing and answer honestly without inventing an event?
- Which words restrict the answer or add reading work without adding meaning?
- Does it echo the phrasing of an example in the references? Examples show taste; reusing their wording is copying.

A set also needs a pass read together:

- Do the questions offer different subjects, emotional paths, and sentence structures? If they sound like a repeated formula, rethink the questions themselves. Swapping opening words on the same construction is cosmetic variety, and a corrective device such as "Is there…" should not become the batch's default template.
- Would several elicit essentially the same answer, here or in the existing deck? Replace duplicates unless adaptations were requested.

Revise weak candidates before showing them. Preserve the useful subject when rewriting; identify a replacement as a replacement. The archived deck and current deck are evidence of taste, not an absolute bad/good classification.

Return only the requested questions or prompts unless the user asks for explanation. Keep drafting notes, pool checks, and reference commentary out of the reply. Draft in the conversation unless asked to save or integrate; for integration, inspect the target schema and translation conventions first. Translate naturally rather than copying English syntax.
