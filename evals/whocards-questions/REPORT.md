# Skill review and baseline · 2026-09-08

The skill installs successfully as a standalone folder. First-pass generation with `gpt-5.6-luna` at low reasoning still needs editorial review: correct counts and recognizable WhoCards language do not guarantee a useful, original set.

## Changes made

The existing repository work was kept as the starting point (commit `15377480a9bccecec490142330b38b290f3731c2`). Three narrow instruction corrections remove conflicts:

- Writing prompts can vary sentence construction while honoring the requested format.
- A table is a setting, not a signal to return ten questions.
- Learning is welcome when it serves the request; an imposed lesson or growth arc is the problem.

The two approved parenting examples are now correctly labeled as parenthood without a time constraint. They were not ratings of the combined parenting-plus-past-year frame.

The package now includes installation/use documentation and its MIT license. The evaluation workflow freezes inputs and retains raw responses, with reviewer expectations withheld from generation. Five added scenarios test counts, settings, requested learning, and unfamiliar frames. CI checks the deck snapshot and the preparation tool; it makes no model calls.

New frames still need no additions to the skill. The extra frames live only in maintainer tests. The original full deck remains unnecessary; selected editorial comparisons and the current English snapshot provide the portable reference material.

## What was tested

Twenty fresh agents generated two independent samples for each of ten scenarios. Each received the same frozen skill and bundled resources for its scenario, with no prior conversation or reviewer feedback. Model: `gpt-5.6-luna`; reasoning: `low`. No failed calls, retries, or editorial correction rounds were folded into these outputs.

The [evidence archive](results/2026-09-08-luna.json) contains all 87 raw cards/prompts, requests, file hashes, complete runtime snapshots, execution settings, and my assessments. Multi-part cards count as one item; question marks are not the unit of output. Formatting scores concern question versus writing-prompt format, not editorial quality.

| Scenario                                | Count passed | Whole responses ready without editing |
| --------------------------------------- | ------------ | ------------------------------------- |
| A · Partner dinner                      | 2/2          | 1/2                                   |
| B · Retirement team lunch               | 1/2          | 0/2                                   |
| C · Past-year journal                   | 2/2          | 0/2                                   |
| D · Parenting this past year            | 2/2          | 1/2                                   |
| E · Team icebreaker                     | 2/2          | 0/2                                   |
| F · Difficult day, three questions      | 2/2          | 0/2                                   |
| G · Birthday table, one question        | 2/2          | 1/2                                   |
| H · Learning as a parent, two questions | 2/2          | 0/2                                   |
| I · Playful sibling train ride          | 2/2          | 0/2                                   |
| J · Writing about home in a new city    | 2/2          | 0/2                                   |

Count passed in 19/20 responses; requested format passed in 20/20. I judged 3/20 **whole responses** ready without editing. A set with one weak card does not pass that bar, so this is not a claim that only three of the 87 cards are good. Scores are my editorial judgments, not Avi's ratings or a statistical estimate of model quality.

## What the raw results reveal

**Assumed experience is the most persistent problem.** Journal prompts repeatedly require unexpected joy, changed relationships, or a burden becoming easier. New-city prompts assume the writer has already found belonging. A difficult-day question asks what was needed but not received, although the request established no unmet need. These are concrete restrictions an honest answer may not satisfy.

**The deck and calibration can attract imitation.** Both offsite runs generated essentially the same advice question, close to pool #46. One also echoed the teamwork and surprising-fact cards (#39 and #63). One parenting-learning question follows the calibration phrase about learning to trust a child closely. Both partner-dinner runs converged on home; that is thematic overlap with pool #23, rather than automatically an exact or semantic duplicate.

**Surface variety is insufficient.** Both offsite sets lean on one opening: three cards in one and four in the other begin “What is a”, six and seven begin “What is”. More seriously, the year-reflection sets repeatedly ask for changes or revelations even while varying their openings. The specific “Is there” repetition did not recur, but the underlying tendency toward templates remains.

**There are useful candidates.** These unedited outputs show the direction worth preserving:

> Looking back on this past year, what has being a parent asked of you?

> What part of today is still with you?

> Imagine your new city welcoming you at the door. What would it say, and what would you want to say back?

The last two came from sets that still needed edits elsewhere. They are not examples of a whole-set pass.

## What to do with this

Use the small model for drafts with a separate editorial pass before showing a set to someone. Preserve that first response, apply the review rubric to every card and then the set, and keep revisions separately. The earlier batch Avi liked went through several review rounds; that workflow remains stronger evidence than a single-shot promise.

Keep the runtime skill stable for now. Adding another prohibition for each failed card would recreate the instruction sprawl that previously hurt variety. The next controlled experiment should compare the current first-pass workflow with a separately recorded reviewer pass, using these same requests and new transfer frames. That tests the workflow directly before changing more prose.

Do not turn “no assumptions” into a mechanical ban on every presupposition: even the approved parenting examples assume some experience. Judge whether an unprovided detail blocks a plausible honest answer in the supplied frame. Likewise, learning requested by the user is valid, and repeated opening words alone do not establish a bad set.

## Verification and limits

- The standard Skills CLI copied the package into a fresh temporary Codex project; required resources, README, and license were present. Existing installations were not replaced by that test.
- The English snapshot matches the authoritative 66-question pool.
- The skill validator, preparation-tool tests, repository lint, and targeted formatting checks passed. The change quality check found no existing-code regressions; its four new-data verbosity flags refer to the intentionally preserved JSON evidence.
- The three pre-existing unrelated untracked files were preserved; their contents were checked against hashes taken before this work.

Automatic skill discovery, translation quality, remote installation from an unmerged branch, and behavior on other models were not tested. Explicitly supplying the skill tests generation after selection, not whether an agent selects it. Standard agent/system instructions remained present. There is no old-skill control run, so these results do not establish a before/after improvement. Two samples per scenario expose variation but cannot establish a stable success rate.
