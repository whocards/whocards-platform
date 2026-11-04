# recent_questions sets, opener rewrites and empty history · 2026-11-04

8/8 passed on v0.1, unchanged. Sets of five avoided every history entry and each other, the opener trap did not trigger, and empty history gave three plain questions. No failure to fix, so `SKILL.md` stays at v0.1 and this run shows no gain over it. Raw results: [results/2026-11-04-recent-questions-sets.json](results/2026-11-04-recent-questions-sets.json).

## Setup

- Skill: `SKILL.md` v0.1, the same bytes as the [baseline](REPORT-2026-11-04-recent-questions.md) (hashes in the archive).
- Scenarios: the four added to [prompts-recent-questions.json](prompts-recent-questions.json) for [#376 📋](https://github.com/whocards/whocards-platform/issues/376), two samples each. The run was prepared over the whole file (`prepare-run.mjs ... 2 evals/whocards-questions/prompts-recent-questions.json`); only the new scenarios' eight jobs were answered, since the four earlier ones ran at the same hash in the baseline.
- Model and method: as the baseline. Opus 5.5, one fresh general-purpose agent per job, all eight in parallel, told to read the job file and answer it, no skills, no other tools. No retries.
- Reviewer: the building agent. Assistant judgments, not maintainer ratings.

## Results

| Scenario          | What it checks                                                            | Result   |
| ----------------- | ------------------------------------------------------------------------- | -------- |
| RQ-set            | Five for a Monday check-in; eight history entries hold the obvious angles | 2/2 pass |
| RQ-set-paraphrase | Five for a first date; history invites reworded repeats                   | 2/2 pass |
| RQ-opener         | One for New Year's Eve; history holds proud, let go, hopes, surprised     | 2/2 pass |
| RQ-empty          | Three for siblings on a train, `recent_questions: []`                     | 2/2 pass |

All counts matched; every reply held only the questions. Opener answers: "If you could live one day from this year again, which day would you pick?" and "What moment from this year would you happily live again?", a new angle rather than a listed one behind a new opener. Two near calls, both judged pass, for a human taste pass to settle: RQ-set-2's "If your week had a weather forecast, what would it say?" sits near the history's week and mood angles but asks something else, and RQ-set-2's "What question are you carrying into this week?" sits near the history's "What is taking up most of your headspace right now?".

With the baseline, the set now passes for single and multi-question requests and empty history, all on v0.1.

## Limits

- Eight responses from one model, inside Claude Code, which inherits its system prompt. This is the same harness as the baseline, with the same caveats.
- The histories are written, not built from the model's own earlier answers, and the paraphrase judgment is the reviewer's, with no similarity measure.
- `SKILL.md` has no avoidance instruction; this model avoids history from the documented input alone. A weaker model may not; that is untested here.
- The 30-entry bound and a set of ten are not covered.
