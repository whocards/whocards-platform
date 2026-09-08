# Second run · Claude Haiku 4.5 · 2026-09-08

The same ten scenarios, the same skill bytes, a different model. `claude-haiku-4-5-20251001`
produced better individual cards than the `gpt-5.6-luna` baseline and obeyed the counting rule
worse, in one specific place: a plural request for a group setting. Five of twenty responses were
ready to use without editing, against three of twenty in the baseline; four responses returned the
wrong number of cards, against one in the baseline.

The point of running the cheapest model is that a skill which holds here should hold above. This
one mostly holds: the writing is on-voice and the frames are honored. What breaks is the delivery
contract, not the writing.

## What was tested

Twenty fresh sessions, two independent samples for each of the ten scenarios in `prompts.json`.
Each session received the frozen skill, its two references and the bundled English pool inline, and
nothing else: skills, user and project settings, and MCP servers were all disabled, and every job
ran from an empty directory outside the checkout. No conversation history, no reviewer feedback, no
revision rounds.

The four skill files are byte-identical to the baseline snapshot, so the skill is not a variable
here. The [evidence archive](results/2026-09-08-haiku.json) holds all 66 raw cards, requests, file
hashes, runtime snapshots, execution settings and my assessments.

| Scenario                                | Count passed | Whole responses ready without editing |
| --------------------------------------- | ------------ | ------------------------------------- |
| A · Partner dinner                      | 2/2          | 1/2                                   |
| B · Retirement team lunch               | 0/2          | 0/2                                   |
| C · Past-year journal                   | 2/2          | 0/2                                   |
| D · Parenting this past year            | 2/2          | 0/2                                   |
| E · Team icebreaker                     | 0/2          | 0/2                                   |
| F · Difficult day, three questions      | 2/2          | 0/2                                   |
| G · Birthday table, one question        | 2/2          | 1/2                                   |
| H · Learning as a parent, two questions | 2/2          | 1/2                                   |
| I · Playful sibling train ride          | 2/2          | 1/2                                   |
| J · Writing about home in a new city    | 2/2          | 1/2                                   |

Count passed in 16/20, format in 20/20, and 5/20 whole responses were ready without editing. As in
the baseline, a set with one weak card fails that bar, so this is not a claim that only five of the
66 cards are good.

## The one rule this model does not follow

Every count failure is the same rule — **"Deliver ten when the request implies a set: a plural
ask"** — and it fails in a specific place. Of the three scenarios that ask in the plural without
naming a number, the solo journaling one passed both samples with exactly ten. The two that ask for
a live group setting failed both samples:

| Plural ask, no number given                               | Setting        | Cards returned |
| --------------------------------------------------------- | -------------- | -------------- |
| C · "Write journal prompts to reflect on this past year." | Alone, writing | 10, 10         |
| B · "I need questions for a team lunch…"                  | A table        | 3, 1           |
| E · "Questions for a team offsite icebreaker."            | A gathering    | 5, 1           |

Every scenario that names its number passed both samples, including G, where "a question for the
table" correctly stayed at one.

The four failing responses say why. Each one delivers a recommendation rather than a set: "Top
recommendation", "Best choice", "Strongest opener", "here's my recommendation". That is the skill's
own shortlisting instruction — _"Shortlist several, then give the best one"_ — leaking out of the
drafting step and into the delivery. When the audience is a room of people, this model reads the
request as _help me pick a question_ instead of _give me a set_, and the conditional plural default
never gets applied.

Two of the four also opened by asking the user what tone or how many questions they wanted, which
the skill permits only when the missing context would change whether the questions suit the people
at the table. A request naming colleagues, an offsite and an icebreaker is not that case.

This is the highest-value finding in the run: it is one rule, it fails deterministically on one
recognizable kind of request, and it is invisible to anyone reviewing card quality alone.

## The one blocking card

E-1 returned **"What are your two favorite dance moves? (Show them!)"** — pool #35, reproduced
verbatim from the deck bundled in its own prompt. The same response's talent card is a semantic
near-duplicate of pool #63. The baseline saw imitation of the deck; this is a copy of it.

## Where it beats the baseline

The assumed-experience problem that dominated the baseline is smaller but not gone. It still shows
up in the year-reflection sets (C-2 asks for a shifted relationship, changed priorities and
something let go of) and in J-1, which again assumes belonging in the new city has already
arrived. But the strong responses avoid it cleanly, and G-2 uses the expectation form the skill
explicitly sanctions instead of requiring an event to have happened.

The cards worth keeping from unedited output:

> What is your child teaching you?

> What's something about this year you didn't expect?

> What's something about yourself you've discovered through being with me?

## A new failure mode: the skill talks about itself

Three responses showed the user material meant for the writer. D-1 cites "the maintainer's
feedback." D-2 narrates its pool check and quotes a calibration example verbatim. J-1 tells the
user what pool question 23 asks. Most other responses open with a paragraph restating the frame
before delivering.

The skill says to keep explanations outside the question text, which these technically satisfy, so
none of it is a format failure. It is still the wrong deliverable: someone who asked for a question
before dinner receives an essay about question design, and in three cases a look at the reference
material. The baseline model did not do this.

## What to do with this

Do not add ten more prohibitions. Two narrow, testable changes are worth trying, each against these
same scenarios so the effect is measurable:

1. **Separate shortlisting from delivering.** The failure is not that the plural rule is buried; a
   plural journaling ask gets ten. It is that "shortlist several, then give the best one" reads as a
   delivery instruction for group settings. Mark it as a drafting step, and give the plural default
   an example with a table or a gathering in it — the exact case that loses.
2. **State the delivery shape.** One line saying to return the cards and keep the reasoning, the
   pool check and the references out of the reply would remove the commentary and all three
   internal-material leaks at once.

The verbatim deck copy is one card in one sample, so treat it as a watch item rather than evidence
that the deck-check instruction fails. Re-running scenario E is the cheap way to tell.

## Method note: a discarded first capture

The first attempt captured stdout with plain shell redirection. The CLI rewrote each file from the
start with a shorter final message, leaving the tail of a longer draft after the real answer —
visible in five files, and possible undetected in the rest. Those outputs were never scored; they
are retained unreviewed under `experiments/whocards-questions/run-02-haiku/attempts/`. All twenty
jobs were re-run with `--output-format json`, reading the `result` field. Anyone reproducing this
should use the JSON output format.

Generation ran on Claude Code OAuth against a Max subscription, so it consumed subscription usage
rather than metered API credits. The archive records a notional list price of $0.40 for the twenty
jobs; no amount was billed.

## Limits

Standard Claude Code system instructions were present, so this is not a bare API prompt. The skill
was supplied explicitly, so this tests generation after selection and not automatic discovery. Two
samples per scenario expose variation but cannot establish a stable rate. Most importantly, the
baseline and this run differ in vendor, harness and reasoning settings as well as model: the skill
bytes and scenarios are identical, but the comparison is directional, not a controlled model
experiment. English only.
