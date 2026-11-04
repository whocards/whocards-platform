# recent_questions baseline · 2026-11-04

8/8 responses avoided the supplied history: no exact repeats, no close paraphrases. The ticket expected the repeat cases to fail on v0.1; they did not. The likely cause is the `## Recent questions` section that [#384](https://github.com/whocards/whocards-platform/pull/384) added: it documents the input, and that alone was enough for this model to steer away. Raw results: [results/2026-11-04-recent-questions.json](results/2026-11-04-recent-questions.json).

## Setup

- Skill: `SKILL.md` v0.1 at `ec6ff98`, with the documented `recent_questions` contract and no instruction to avoid history. Hashes are in the archive.
- Scenarios: [prompts-recent-questions.json](prompts-recent-questions.json), two samples each, prepared with `prepare-run.mjs ... 2 evals/whocards-questions/prompts-recent-questions.json`. The job carries the history as a `RECENT QUESTIONS (passed by the host)` block before the request; the `avoid` list and notes stay in expectations only.
- Model: Opus 5.5 (`claude-opus-5-5`), reasoning setting left at the agent default.
- Method: Claude Code's Agent tool, one fresh general-purpose agent per job, all eight in parallel. Each was told to read its job file and answer it as its only task. No retries, no failed attempts.
- Reviewer: the building agent. Assistant judgments, not maintainer ratings.

## Results

| Scenario      | What it checks                                                  | Responses                                                                                                                              | Repeat check |
| ------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| RQ-exact      | Newest entry is v0.1's own answer to this request               | "What do you wish someone understood about your day today?" · "What was the hardest moment of today? What do you notice about it now?" | 2/2 pass     |
| RQ-paraphrase | History holds reworded versions of that answer                  | "After a day like this, what do you need right now?" · "What happened today that you haven't said out loud yet?"                       | 2/2 pass     |
| RQ-unrelated  | History on other frames; nothing to avoid                       | "What from today is still with you right now?" · "What part of today is still with you right now?"                                     | 2/2 pass     |
| RQ-daily      | Seventh day of the same end-of-day request, six days of history | "Who was on your mind today?" · "What did you need today?"                                                                             | 2/2 pass     |

All eight delivered one question and nothing else. The unrelated pair is the control: with nothing relevant in history, both landed on the "what from today is still with you" angle the 2026-09-08 single-question check produced. The exact and paraphrase cases moved off that angle, so the history changed the answer rather than chance.

## Limits

- Eight responses from one model. This shows the documented input can work, not that it reliably does.
- The agents ran inside Claude Code and inherited its system prompt, which lists an installed `whocards-questions` skill; they were told not to use skills, and none did (two tool calls each: the read and the hand-back). The job text was still not their only context.
- Agents read the job from a file rather than receiving it as their message.
- The daily sequence is a written history, not one built from the model's own earlier answers.
- Single-question requests only. Multi-question requests with history, empty history and the 30-entry bound are not covered.
- The paraphrase judgment is the reviewer's; no similarity measure was used.
