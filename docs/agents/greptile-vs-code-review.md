# Greptile vs /code-review

Does Greptile earn its place? One row per gated PR, written by `node scripts/ci/review-diff.mjs <pr> --log` ([#274 📋](https://github.com/whocards/whocards-platform/issues/274), method in [spike 0003 §C](../spikes/0003-ci-testing-review.md)). Decide keep or drop after ~20 rows.

**Precision** of Greptile-only findings = acted-on / (acted-on + ignored + thumbs-down). For a monthly rollup, sum the last three columns over the month's rows.

- **Skill findings** come from one PR comment that starts with `<!-- claude-review -->` and has one `path:line — summary` per line (a bullet and backticks are fine; `-` works for the dash).
- **Both:** same path, lines within ±3. **Acted-on:** a commit pushed after the Greptile comment changed a line within ±3 of it. **Thumbs-down:** the comment has a 👎 reaction.
- A PR without the marker comment counts every Greptile finding as Greptile-only; the script flags it.

| PR  | Merged | Greptile only | Skill only | Both | Acted-on | Ignored | Thumbs-down |
| --- | ------ | ------------- | ---------- | ---- | -------- | ------- | ----------- |
