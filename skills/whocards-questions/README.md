# WhoCards questions

An installable skill for conversation questions and reflective writing prompts that serve WhoCards' mission: honest self-expression, active listening, and connection.

## Install

From a checkout containing this directory:

```sh
npx skills add . --skill whocards-questions
```

Once this version is merged into the repository's default branch, others can install it with:

```sh
npx skills add whocards/whocards-platform --skill whocards-questions
```

The [Skills CLI](https://github.com/vercel-labs/skills) lets you choose an agent and installation scope. Installing from a private repository requires repository access. Review any existing installation before replacing it.

For a manual install, copy this entire directory into your agent's skill directory under the name `whocards-questions`. Keep `SKILL.md`, `references/`, and `assets/` together. The repo's `.agents/skills/` and `.claude/skills/` entries are development symlinks, not standalone copies to share.

## Use

Ask naturally, or explicitly invoke `whocards-questions` in an agent that supports skill selection:

- Give me a question about being a parent this past year.
- Three questions to help me process a difficult day.
- Write journal prompts about feeling at home in a new city.

A **frame** is the combination of topic, time, situation, intention, audience, format, and setting. Supply whichever dimensions matter. New frames need no new files or registration. The examples illustrate dimensions; they do not limit the skill to those subjects.

The default is one question, or ten for a set without a stated count. An explicit count and requested format take precedence.

## What's included

- `SKILL.md`: generation and editing instructions.
- `references/`: mission and selected editorial comparisons, including direct maintainer feedback.
- `assets/pool-en.json`: the English deck snapshot used to avoid duplicates outside this repository.
- `agents/openai.yaml`: Codex display metadata.
- `LICENSE`: MIT license, included so a copied folder retains its terms.

The full historical deck is not needed. The selected comparisons provide calibration. In the WhoCards repository the current multilingual pool is authoritative; elsewhere the bundled English snapshot works without repository access. Other languages or named decks require their own supplied source if duplicate checking matters.

## Maintain

From the repository root, using Node 24 or newer:

```sh
node evals/whocards-questions/scripts/build-pool-snapshot.mjs
node evals/whocards-questions/scripts/build-pool-snapshot.mjs --check
node --test evals/whocards-questions/scripts/prepare-run.test.mjs
```

The build command refreshes the English snapshot after a deck edit. CI checks that it stays current. Maintainer scenarios, tooling, and retained baselines live separately in `evals/whocards-questions/` in the repository. Follow its README after changing the skill; automated checks cannot decide whether a question is worth asking. Exploratory runs belong in the ignored `experiments/whocards-questions/` directory. These development files are not part of the installed skill.
