# Greptile vs /code-review

Does Greptile earn its place? One row per gated PR, written by `node scripts/ci/review-diff.mjs <pr> --log` ([#274 📋](https://github.com/whocards/whocards-platform/issues/274), method in [spike 0003 §C](../spikes/0003-ci-testing-review.md)). Decide keep or drop after ~20 rows.

**Precision** of Greptile-only findings = acted-on / (acted-on + ignored + thumbs-down). For a monthly rollup, sum the last three columns over the month's rows.

- **Skill findings** come from one PR comment that starts with `<!-- claude-review -->` and has one `path:line — summary` per line (a bullet and backticks are fine; `-` works for the dash).
- **Both:** same path, lines within ±3. **Acted-on:** a commit after the one Greptile reviewed, in PR order, changed a line within ±3 of it, the line carried through the commits between. **Thumbs-down:** the comment has a 👎 reaction.
- **Unknown:** a force-push dropped the commit Greptile reviewed, so nothing says which commits came after. It counts in Greptile only and in none of the last three columns.
- A PR without the marker comment is printed but never logged, since /code-review has not run on it.

| PR  | Merged | Greptile only | Skill only | Both | Acted-on | Ignored | Thumbs-down |
| --- | ------ | ------------- | ---------- | ---- | -------- | ------- | ----------- |
