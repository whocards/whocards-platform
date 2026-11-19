# SEO and AEO reviews

How to run the recurring search reviews for `apps/website`. The schedule is a set of recurring Linear issues in the WhoCards team; each issue names which review below to run.

The tracked terms, the numbers and the log of changes are strategy, so they live in the private repo: `whocards/whocards`, `docs/growth/06-seo-aeo-review-log.md`. Read it before a review and append to it after. Nothing from it is copied into this repo.

## Tools

- **Search Console and PostHog:** through the executor MCP only. The property and project ids are in the log. Never the plugin's own Google sign-in.
- **claude-seo plugin:** enabled for this repo in `.claude/settings.json`. Its Python runtime and browser are per machine: run `claude-seo setup` once, `claude-seo doctor` to check.
- **Page speed:** needs a Google API key. Without one the keyless quota runs out and that part is skipped; say so in the report.

## Rules

- One change per page per four weeks. Google takes two to four weeks to settle after a title or copy change, so faster changes can't be told apart.
- Every change to a title, description or first-screen copy gets a line in the log with its date and PR, and a check at two and four weeks.
- Report only what moved. A review with nothing to say closes its issue with one line.

## Weekly check

1. Search Console, last 7 days against the 7 before: clicks, impressions and position for each tracked term and for the site.
2. Sitemap status and any new indexing errors.
3. New queries with impressions that are not in the tracked list.
4. PostHog: organic search sessions, and how many reached a play.
5. Append one row to the log. Report a term that moved a full position or more, a new error, or a new query worth tracking.

## Monthly review

1. Read the last four weekly rows.
2. Search Console, last 28 days by page: pages losing ground, queries with impressions and no page that answers them, question pages still unindexed per language.
3. PostHog: sessions referred by AI assistants (ChatGPT, Perplexity, Gemini, Copilot).
4. Propose one to three changes. Each approved change is its own PR.

## Quarterly audit

1. `/seo-audit` on `https://whocards.cc`, then `/seo-geo` and `/seo-technical` for the parts the audit flags.
2. Page speed for the homepage, `/play` and one question page.
3. Rank the findings, compare with the previous audit in the log, and propose the next quarter's work.
