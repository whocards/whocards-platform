# AI Check-In — canonical question-generation prompt

This is the canonical prompt used to generate a 37-question AI Check-In deck from a chosen
"direction" (facilitated, open, stories, human, or together — see
[`ai-at-work-question-variants.md`](./ai-at-work-question-variants.md)). It is also the default
prompt loaded into the dev-only Question Lab (`apps/website/src/pages/dev/question-lab.astro`),
where the string lives as a shared TS constant
(`apps/website/src/server/question-lab/prompt.ts`) so the doc and the tool never drift apart —
this file is the human-readable copy, the constant is the source the Lab actually sends.

```
You are writing question cards for WhoCards, a card game of honest questions that help people truly meet each other. This deck is the **AI Check-In**: a 20-minute, manager-runnable team check-in about AI arriving in their work — the fear, the opportunity, what stays human, and the norms the team wants to live by.

Voice and rules:
- WhoCards tone is honest self-expression and connection. Write simple questions in broad language, leaving room for the player to decide what the question is really asking. The card never over-explains; context comes from the deck and the room.
- This is NOT an AI-literacy or prompt-writing deck. Every question is evergreen: no tools, products, models, vendors, or years.
- A question invites a feeling or a story, not a debate position. It must be answerable in the first person by anyone on a team, regardless of role or technical skill.
- One question per card, at most 20 words. No stacked clauses, no "…and why?" tails unless the tail is doing real work.
- Every question must be safe enough to answer out loud in front of one's manager, yet brave enough to get the quiet stuff on the table.
- No two questions may be near-duplicates; across the deck, vary the emotional register (worry, pride, hope, humor, care).

Structure — exactly 37 questions with ids ai-1 through ai-37, in four acts:
- Act 1, ai-1 to ai-9 — Name the fear: surface what people are quietly carrying before talking solutions.
- Act 2, ai-10 to ai-18 — Map the work: what could be handed over, and what is unmistakably human.
- Act 3, ai-19 to ai-27 — Redesign the role: if the busywork goes, what does a better, more human version of the job look like?
- Act 4, ai-28 to ai-37 — Team norms: land on shared agreements — trust, honesty, credit, and when a human must decide.

Direction for this generation: {{DIRECTION}}

Output: strict JSON only — no commentary, no markdown fences — in exactly this shape:
{"ai-1": {"en": "…"}, "ai-2": {"en": "…"}, …, "ai-37": {"en": "…"}}
```

## `{{DIRECTION}}`

`{{DIRECTION}}` is free text substituted directly into the prompt before it's sent to the model.
The five house directions used so far (mirroring
[`ai-at-work-question-variants.md`](./ai-at-work-question-variants.md)) are:

1. **facilitated** — name AI, roles and agreements directly, easy to run structured.
2. **open** — barely name AI; ask what feels different, fragile, human, worth protecting.
3. **stories** — every card asks for a remembered moment.
4. **human** — center craft, identity, care and judgment.
5. **together** — first-person plural, aimed at team norms and shared agreements.

The Question Lab offers these five as quick-pick chips, but the field accepts any free-text
direction for further experimentation.
