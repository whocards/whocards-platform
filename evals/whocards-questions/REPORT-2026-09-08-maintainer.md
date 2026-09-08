# Maintainer taste test · 2026-09-08

Avi rated **21 of 25 reviewed items 4 or 5**. Five playful questions were left unrated; they are missing feedback, not failures. The [evidence archive](results/2026-09-08-maintainer-taste-test.json) preserves the supplied ratings, verbatim notes, model metadata, and the exact skill snapshot used to produce the questions.

| Frame                              | Reviewed | Rated 4 or 5 |
| ---------------------------------- | -------- | ------------ |
| Parenting this past year · Luna    | 5        | 5            |
| Processing a difficult day · Luna  | 5        | 5            |
| Playful dinner with friends · Luna | 0        | —            |
| New-city writing · Luna            | 5        | 3            |
| Team offsite · Sol                 | 10       | 8            |

Luna: 13/15 reviewed; Sol: 8/10 reviewed. These are different frames and counts, not a controlled comparison of models. The proposed 16/20 Luna threshold is unresolved because five items are unrated. Two reviewed Luna items require substantial changes, so the full proposed acceptance bar has not been demonstrated even though the overall taste signal is strong.

## What the feedback changes

- Direct questions about learning, a changed parenting expectation, and an unseen burden all received 5/5. Earlier assistant judgments treated plausible frame-grounded experiences too mechanically as failures. Human ratings take precedence for editorial appeal; they do not establish originality or instruction compliance.
- The new-city prompt about old and new forms of home received 2/5: too broad, two full questions. Keep one subject; a follow-up should deepen the same answer.
- The route-observation exercise received 1/5 because it was not a question. Writing prompts now include a question by default. Instruction-only exercises remain available when explicitly requested. This is a preference clarified after the test, not proof that the old model violated its then-current writing-format instruction.
- "What helps you feel comfortable speaking up" received 3/5 because it suggested discomfort. Avoid adding an unprovided deficit or struggle; do not impose a blanket ban on assumptions.
- The theme-song question received 3/5: "what would it be?" is clearer than "what would you nominate?" The afternoon hypothetical received 4/5, with a preference for a direct "if" question over the "Imagine" setup.

Avi also confirmed that the skill must supply the processing approach for a difficult-day request. The extra "without trying to solve it" qualifier has been removed from the active regression prompt; the archived request and its outputs keep the original wording, and the five difficult-day items here were rated 5 without notes, so this change comes from the conversation rather than from a rating. The dance and jungle cards have been removed as positive calibration examples on separate evidence — neither appears in any frame rated here; the Haiku run reproduced the dance card verbatim. The actual deck and its complete duplicate-checking snapshot remain unchanged.

## Single-question follow-up

Four fresh Luna agents (low reasoning) each received one bare request after the feedback edits, with no conversation history, candidate menu, or additional reviewer pass. The requests, the frozen skill snapshot, and the raw responses are archived in [results/2026-09-08-single-question-check.json](results/2026-09-08-single-question-check.json). That snapshot is byte-identical to the shipped v0.1 skill except the `metadata.version` line added afterwards, so it is the only archived run here that exercises the current instructions.

All four returned one card with a question and no process commentary. The difficult-day answer was "What part of today is still asking for your attention?" without an extra instruction from the user about avoiding solutions. The writing request produced a question rather than an instruction-only exercise.

That is delivery evidence, not a blanket quality pass. The parenting result reproduced a calibration example verbatim, and the writing result still carries two broad reflective directions. These issues are recorded in the separate single-question review page; outputs were not silently edited or retried. This check is too small to establish reliability.

## Release guidance

The human feedback supports sharing an early question-drafting version for practical feedback. It does not support promising every single response is original and ready to use unchanged. Preserve that distinction, and give human taste ratings more weight than an assistant's blanket assumption checks. Avoid another open-ended round of rules and model comparisons; remaining work should address a demonstrated failure or recipient feedback.
