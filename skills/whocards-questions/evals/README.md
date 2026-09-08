# Evals

`prompts.json` holds the fixed scenarios used to check the skill after an edit. Each entry has a request and what the reply should satisfy.

Run one fresh agent per prompt, with no other context, and check:

- **Count.** One question unless the request implies a set; ten when it does.
- **No invented event.** Nothing presumes something happened that the user never established.
- **No deck duplicate.** Nothing repeats a question in `assets/pool-en.json`.
- **Opener variety.** A set does not lean on one opening construction.
- **No copied example.** Nothing reuses the phrasing of an example in `references/editorial-calibration.md`.
- **No growth arc.** Nothing routes the answer through a lesson or takeaway.

Scenario D exists because the two questions quoted in the maintainer feedback are the nearest attractor for a parenting frame; an output that paraphrases them has copied rather than written.
