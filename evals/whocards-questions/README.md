# Evals

Recorded runs, newest first:

- [Maintainer taste test · 2026-09-08](REPORT-2026-09-08-maintainer.md) — 21/25 reviewed items rated 4 or 5; five unrated. Human taste calibration and single-question follow-up.
- [Claude Haiku 4.5 · 2026-09-08](REPORT-2026-09-08-haiku.md) — same skill bytes, same scenarios, different model. Better cards, worse counting: plural asks for a group setting returned one card.
- [gpt-5.6-luna baseline · 2026-09-08](REPORT.md) — the first recorded run.

Each report links its preserved raw results.

Test the skill's first response separately from any later editorial revision. The earlier successful Luna batch had several review rounds; it is evidence for that workflow, not an unaided first-pass success rate.

## What is retained

This directory holds reusable scenarios, the review rubric, maintainer scripts, and deliberately retained baseline results. The installable skill lives in `skills/whocards-questions/` at the repository root. The snapshot builder here maintains its bundled English deck; CI checks freshness and the preparation tool.

Use the ignored `experiments/whocards-questions/` directory for trial instructions, candidate batches, reviewer passes, rating pages, and exploratory results. Keep raw responses and revisions separate. Promote a run into `results/` only when it is a useful baseline or regression record, and describe its settings and limitations in a report. The existing baseline remains unchanged for comparison.

## Prepare and generate

`prompts.json` contains the original five scenarios plus explicit-count, table-setting, requested-learning, transfer-frame, and bare single-question cases. F now omits the extra no-solutions qualifier; K–M check single-question processing, parenting, and writing. The historical archives retain their original prompts and expectations. From the repository root:

```sh
mkdir -p experiments/whocards-questions
node evals/whocards-questions/scripts/prepare-run.mjs experiments/whocards-questions/run-01 MODEL_ID 2
```

Create only the parent directory; the preparation tool creates the new run directory. Use a new output directory and the actual model identifier. Two samples per scenario provide a small variation check, not a statistical quality estimate. The script freezes the skill, references, deck, file hashes, requests, and reviewer expectations. It refuses to replace an existing run.

Run one fresh agent per `jobs/*.txt`, with no conversation history or previous outputs. Give it only that file's contents. The job includes the complete skill and resources; it does not include expected counts or reviewer hints. Save the complete, unedited final response to `responses/JOB_ID.txt`. Record the actual model, reasoning setting, execution method, failures, and any extra instructions in the run report. Do not silently retry or switch models; retain failed attempts separately.

For an authenticated Codex CLI, [non-interactive execution](https://developers.openai.com/codex/noninteractive/) can run an individual job:

```sh
# Run from an empty directory outside the WhoCards checkout.
# Replace MODEL_ID with the value used above. Set run_dir to the absolute path
# printed by prepare-run.mjs (needed after changing to an empty directory).
run_dir=/absolute/path/to/whocards/experiments/whocards-questions/run-01
codex exec --ephemeral --skip-git-repo-check --ignore-user-config \
  --sandbox read-only --model MODEL_ID \
  --output-last-message "$run_dir/responses/A-1.txt" \
  - < "$run_dir/jobs/A-1.txt"
```

Check your CLI's help for supported flags.

For an authenticated Claude Code CLI, a fresh non-interactive session can run an individual job:

```sh
# Run from an empty directory outside the WhoCards checkout.
# Disabling skills, settings and MCP keeps the bundled skill in the job file the
# only WhoCards guidance in the session.
run_dir=/absolute/path/to/whocards/experiments/whocards-questions/run-01
claude -p --model MODEL_ID --restricted --disable-slash-commands --strict-mcp-config \
  --output-format json < "$run_dir/jobs/A-1.txt" > "$run_dir/raw-json/A-1.json"
```

Read the response from the JSON `result` field. Do not capture plain stdout with shell redirection:
the CLI rewrites the file from the start with its final message, which can leave the tail of a
longer draft after the real answer. That corrupted a whole batch once; see the discarded attempt in
the [Haiku 4.5 report](REPORT-2026-09-08-haiku.md). Generation on a Claude subscription consumes
subscription usage rather than metered API credits.

The preparation script has no model dependency and does not launch paid calls. Generation through another agent is equally valid if its settings and raw outputs are retained. Never reuse an output filename for a rerun.

## Review

Count **cards/prompts**, not question marks: a short useful follow-up belongs to the same card. For every response, record count and format compliance, then assess:

| Dimension        | What to look for                                                                        |
| ---------------- | --------------------------------------------------------------------------------------- |
| Frame fit        | Honors the supplied topic, time, situation, intention, audience, and format together.   |
| Answerability    | Clear on first hearing; lets someone answer honestly without inventing an event.        |
| Human meaning    | Opens an experience, relationship, feeling, choice, desire, or imagination.             |
| Editorial appeal | A question you would actually choose to ask; direct, inviting, and worth the attention. |

Score each dimension from 1 (fails) through 3 (usable with editing) to 5 (ready to use). A response is ready without editing only when all four scores are at least 4, count and format pass, and no card has a blocking issue. Add specific wording as evidence for low scores. Report the share of responses ready to use without editing; do not hide a weak question behind a batch average. These are reviewer judgments, not objective measurements. Keep maintainer ratings separate from assistant ratings.

Also flag invented events, forced lessons, unnecessary disclosure, filler, copied examples, and exact or semantic deck duplicates. Learning and change are valid when requested; the problem is imposing a lesson. In sets, inspect repeated subjects, emotional paths, sentence constructions, and answers. Repeated opening words are a clue, not an automatic failure.

Scenario D checks attraction to the approved parenting examples. F–H test instruction boundaries. K–M require a usable standalone answer, with no menu or editorial instructions supplied by the user. I–J are initial transfer frames absent from the skill's illustrations; rotate in genuinely unseen frames later, since repeatedly tuning against them makes them regression cases.

Save raw responses before reviewing. Put any rewrites in separate files and label them reviewed outputs. Compare revisions on the same requests and generation settings; preserve both skill snapshots. Do not claim a before/after improvement without running both versions.

## What this does not test

These jobs explicitly provide the skill. Test automatic discovery separately in a fresh installed agent: ask a relevant request without naming the skill, confirm from its trace that it loaded the skill, and also try an unrelated request that should not trigger it. A good response alone does not prove discovery worked.

This suite is English-only. It does not validate translated wording, a different deck, every possible frame, or another model. Model calls stay outside CI; CI checks snapshot freshness and the evidence-preparation tool.
