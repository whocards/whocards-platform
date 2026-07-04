# WhoCards — SEO/AEO Action Plan (2026-07 refresh)

_Scope: `apps/website`. Audited against `main@cf1259d` (2026-07-04) — code inspection plus a real
local production build (`pnpm --filter website build`) to verify what actually ships, not just
what the source implies. Written for issue #207 (growth Lever 3, see `03-growth-strategy.md` §3
and `docs/strategy/ai-at-work-business-plan.md` §8)._

**This supersedes `02-seo-audit.md` (2026-06-23).** That audit's P0 list — recover the question
pages, fix homepage meta, add JSON-LD — is now **~80% shipped** (PR #66, PR #143 / issues #45–46).
Re-auditing the live code surfaced a **new, higher-priority bug** those PRs didn't cause but also
didn't catch (canonical URLs), plus a couple of smaller correctness bugs. `02` is left in place for
history; treat this doc as current.

---

## TL;DR — top 5 findings

1. **Canonical/OG/Twitter URLs were wrong on every prerendered page (~940 of them).** Astro's
   `build.format: 'file'` bakes a literal `.html` into `Astro.url.pathname` at build time (this is
   [documented Astro behavior](https://docs.astro.build/en/reference/configuration-reference/),
   not a bug in Astro) — e.g. the real page `https://whocards.cc/mission` was self-declaring its
   canonical as `https://whocards.cc/mission.html`, a URL nobody links to and no one visits. Same
   for `og:url` and `twitter:url`. **Fixed in this PR** — verified with a before/after local build.
2. **hreflang was completely absent** (grep of a full build output: zero occurrences). Now that
   question pages are restored (PR #143), they are the one place on the site where the _same
   content genuinely exists at 14 different URLs_ — the textbook hreflang case. **Added in this
   PR**, scoped to question pages only (see §3).
3. **The `jp` language key was leaking into spec-required language tags.** `jp` is this codebase's
   internal key for Japanese, but it's also the ISO 3166-1 **country** code for Japan, not a
   language code — the correct BCP-47 subtag is `ja`. It was shipping verbatim in `<html lang="jp">`
   and `og:locale=jp`, both invalid. **Fixed** with a display-only mapping; the `/jp/...` URL
   segment is untouched (out of scope — see §6).
4. **FAQPage rich results were deprecated by Google in May 2026** — after `02-seo-audit.md` was
   written, and this matters: FAQ schema is still worth having (it's parsed by AI/AEO crawlers and
   costs nothing), but sell it internally as an **AEO play, not a "rich result" play** — Google
   stopped showing the FAQ accordion in blue-link search for everyone except a few authoritative
   verticals back in 2023, and pulled the feature entirely in 2026. See §4.
5. **924 question pages exist, are sitemapped, and have zero internal links pointing to them.**
   Confirmed via a real build: sitemap has exactly 939 URLs, 924 of them `/{lang}/question/{id}`
   (66 questions × 14 languages — a complete matrix, no gaps). None of `Navigation.astro`, the
   homepage, or any other page link to a single one. They're indexable but orphaned — reachable
   only via the sitemap or an existing external citation (ChatGPT, old Google index). The
   `/conversation-starters` hub the old audit recommended is still the fix, and is now the single
   highest-leverage thing left undone (see §7, P0).

---

## 1. What's already shipped (confirmed against current `main`, not assumed)

| Item                                                                                                    | Shipped in                    | Verified                                                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `/[language]/question/[id]` static pages restored                                                       | PR #143 (#45/#46), 2026-07-01 | Build output: 924 question pages                                                  |
| Unique per-question `<title>`/description (not "Question #N" / "Dare to be Curious?")                   | PR #143                       | `Head.astro` `buildQuestionDescription`; spot-checked built HTML                  |
| `CreativeWork` JSON-LD per question                                                                     | PR #143                       | Present in built `<script type="application/ld+json">`                            |
| Homepage meta description fixed (old copy was a leftover "request a deck via contact form" description) | PR #66, 2026-06-23            | `index.astro` no longer passes that description                                   |
| `Organization` + `WebSite` JSON-LD sitewide                                                             | PR #66                        | `Head.astro`, rendered on every page                                              |
| `FAQPage` JSON-LD on homepage                                                                           | PR #66                        | `index.astro`, built from `~constants/faqs`                                       |
| `noindex` on utility pages (`/images`, `/[language]/images`, `404`)                                     | PR #66                        | `Head.astro` `noindex` prop, threaded through `Layout`                            |
| Sitemap excludes noindexed + `/[language]` redirect routes                                              | PR #66                        | `astro.config.ts` sitemap filter; confirmed 0 leaked `/xx` bare routes in a build |
| Canonical tag present                                                                                   | PR #66 (era)                  | Present — but **wrong value**, see §2                                             |

**Read:** the two prior SEO PRs did real, correct work. The gap is a bug neither PR introduced
(the canonical `.html` issue is a preexisting Astro/Netlify config interaction, not a regression
from #66 or #143) and a few loose ends (hreflang, `jp`→`ja`, orphan pages, `/ai-at-work` FAQ) that
were either out of scope for those PRs or hadn't been noticed yet.

---

## 2. Canonical/OG/Twitter URL bug (fixed in this PR)

`Head.astro` computed `canonicalUrl` as `new URL(Astro.url.pathname, site)`. Astro's own docs
state plainly: with `build.format: 'file'` (this repo's config), `Astro.url.pathname` **includes
`.html`** at build time. WhoCards also sets `trailingSlash: 'never'`, and Netlify serves `*.html`
files at their extension-less path by default — so the real, linked, shared, sitemapped URL for
every page is clean (`/mission`, `/en/question/1`), but the self-declared canonical (and `og:url`,
`twitter:url`, which reuse the same value) pointed at the `.html` variant instead.

Confirmed with a local production build, before the fix:

```
mission.html      canonical → http://localhost:4321/mission.html   (wrong: real URL has no .html)
en/question/1.html canonical → http://localhost:4321/en/question/1.html  (wrong)
index.html        canonical → http://localhost:4321/index.html     (wrong: real URL is /)
```

...and the sitemap, generated by a separate code path (`@astrojs/sitemap`, which reads Astro's
route manifest rather than `Astro.url`), correctly listed the clean URLs the whole time — so the
sitemap and the canonical tag were **disagreeing with each other** on every single page. This is
exactly the kind of mixed signal that risks Google indexing/ranking the wrong URL variant, and it
predates both #66 and #143 (it's a `build.format`/`trailingSlash` interaction, not something
either PR touched).

**Fix:** strip the build-time `.html` artifact before constructing `canonicalUrl` (`Head.astro`).
SSR pages (`/play`, `prerender = false`) hit this code at real request time and never have a
`.html` suffix, so the fix is a no-op for them. Verified with a rebuild — every canonical/og:url/
twitter:url now matches the real served URL exactly (see PR diff).

---

## 3. hreflang (added in this PR, scoped to question pages)

**Before:** zero `hreflang` anywhere (`grep -rl hreflang dist/` on a full build returned nothing).

**Why question pages only, not sitewide:** hreflang exists to tell Google "these URLs are the same
content in different languages." That's only true where a real per-language URL alternate exists.
Today that's **only** the question pages — `src/pages/[language]/index.astro` (the would-be
localized homepage) just 301-redirects to `/`, and every other page (`/mission`, `/ai-at-work`,
`/contact`...) has exactly one URL, no language variants. Adding self-referencing hreflang to a
page with no alternates isn't meaningful and Google's guidance doesn't ask for it. If localized
homepages/marketing pages are ever built (the growth strategy's "14× the homepage" ambition),
extend hreflang there too — out of scope today because that content doesn't exist yet.

**What was added:** on `/[language]/question/[id]`, a full hreflang cluster — one `<link>` per
language that has a translation for that question id (confirmed all 66 questions have all 14
languages, so this is always the full set), plus `x-default` pointing at the English version. Each
tag is self-referencing and symmetric (every language links every other language, including
itself) — the two non-negotiables per current hreflang guidance.

**Correctness detail:** `pt-br` is emitted as `pt-BR` (region subtag uppercased to convention) and
`jp` is emitted as `ja` (see §6) — the URL segments (`/pt-br/...`, `/jp/...`) are untouched, only
the `hreflang` attribute value.

**2026 context worth knowing:** hreflang has gotten _less_ mandatory for pure-translation
multilingual sites — Google's language detection has improved enough that some 2026 guidance
argues it's most essential for same-language/different-region targeting (e.g. `en-US` vs `en-GB`
with different pricing), less so for straightforward translations. WhoCards' question pages are a
genuine translation case either way, cost nothing to tag correctly, and remove any ambiguity about
which language version to rank for a given query — so it's still worth doing, just not the
site-breaking omission the 2026-06-23 audit implied.

---

## 4. Structured data — status and a 2026 correction

- `Organization` + `WebSite` JSON-LD: sitewide, shipped (#66). No change.
- `CreativeWork` JSON-LD per question: shipped (#143). Deliberately not `Question` type — that
  schema requires `acceptedAnswer`/`answerCount` for Q&A rich results, which doesn't fit
  conversation-starter prompts (no "answer"); `CreativeWork` was the right call and still is.
- `FAQPage` JSON-LD on the homepage: shipped (#66).
- `FAQPage` JSON-LD on `/ai-at-work`: **did not exist — added in this PR** (see §7).

**The correction:** Google added a deprecation notice to the FAQPage documentation on **May 8,
2026** and the feature **stopped appearing in Google Search on May 7, 2026**
([Google Search Central changelog](https://developers.google.com/search/docs/appearance/structured-data/faqpage));
Search Console's FAQ report and the Rich Results Test drop support by June 2026. This finishes a
process that started in August 2023, when Google first restricted FAQ rich results to "well-known,
authoritative government and health websites" — WhoCards was never actually eligible for the rich
result even when #66 shipped it.

**This doesn't mean drop FAQ schema** — Google's own guidance is that unused/non-rich-result
structured data doesn't hurt, and the markup continues to be parsed by other crawlers and
retrieval systems, including AI search (ChatGPT, Perplexity, Google's own AI Overviews retrieval,
which is a separate pipeline from classic rich results). The honest framing for Avi: **FAQ JSON-LD
is now purely an AEO/LLM-citation play, not a "get a rich snippet in Google" play.** Keep it, keep
adding it where there's real Q&A content, just don't sell it internally as a SERP-appearance win
anymore.

---

## 5. robots.txt / sitemap — verified via a real build

```
User-agent: *
Allow: /
Sitemap: https://whocards.cc/sitemap-index.xml
```

(`astro-robots-txt`, no explicit policy config — this is its permissive default.) This is correct
and closes the old audit's open question #6 (part 1): nothing blocks any crawler, including AI
crawlers — there's no user-agent-specific `Disallow` for GPTBot, Google-Extended, PerplexityBot,
OAI-SearchBot, ClaudeBot, etc., so they're all implicitly allowed. No change needed.

Sitemap (`@astrojs/sitemap`): **939 URLs** in one build — 15 marketing/utility pages + 924 question
pages, zero leaked `/[language]` redirect routes (confirmed by grep). Also present, with no
`noindex` and no exclusion: **`/play` and the `/events/hajnalig/*` pages** — these are SSR
(`prerender = false`) but Astro's route manifest includes them regardless, and `@astrojs/sitemap`
picks them up. This is the second half of the old audit's open question #6, **still genuinely
open** — not a bug, a decision: is a content-less `/play` (no `?q=`/`?lang=`) worth indexing on its
own, alongside the now-restored per-question pages that carry real unique content? Recommend
leaving it (no harm, and `/play` is a real, useful page) but flagging it as a deliberate choice
rather than an accident.

---

## 6. Two correctness bugs in language tagging (fixed in this PR)

Both are pure display/spec-compliance fixes — **no URL segment, route, or the `Language` type
changed**. The internal key `jp` (and its use as a URL segment, `/jp/question/1`) is intentionally
left alone; renaming it is a much bigger, unrelated refactor touching deck data, print rendering,
and mobile.

1. **`<html lang="jp">` is invalid.** `jp` is the ISO 3166-1 country code for Japan, not a language
   subtag; the correct value is `ja`. This is a real accessibility issue too (screen readers use
   `lang` to pick pronunciation rules) independent of SEO. Fixed via a small
   `toBCP47LanguageTag()` mapping in `~utils/language.ts`, applied in `Layout.astro`'s `<html
lang>`, `Head.astro`'s `og:locale`, and the new hreflang tags.
2. **`og:locale` used the bare internal key everywhere** (`en`, `hu`, `jp`...) rather than the
   Open Graph spec's `language_TERRITORY` format (`en_US`, `hu_HU`, `ja_JP`...). This is now at
   least spec-_valid_ (`ja` instead of `jp`) after the fix above, but still not spec-_complete_ —
   deliberately **not fully fixed here**: several of WhoCards' 14 languages are pluricentric
   (`es`, `pt`, `zh`) and picking a territory (`es_ES` vs `es_MX`? `zh_CN` vs `zh_TW`?) is a
   judgment call, not a mechanical fix, and `og:locale` mainly affects Facebook share-preview
   parsing, not ranking. **P2 recommendation, not a change** — pick territories deliberately if
   this is ever revisited.

---

## 7. What changed in this PR vs. what's deferred

### Shipped in this batch (all low-risk: no routing, no URL, no redirect changes)

- **Fix canonical/`og:url`/`twitter:url`** to strip the `build.format: 'file'` `.html` artifact
  (`Head.astro`) — affects every prerendered page (~940).
- **Add hreflang + `x-default`** cluster on question pages only (`Head.astro`).
- **Fix `jp` → `ja`** BCP-47 tag for `<html lang>`, `og:locale`, and hreflang, via a new
  `toBCP47LanguageTag()` util (`~utils/language.ts`) — also uppercases the `pt-BR` region subtag.
- **Homepage `<title>`/description**: title was literally just `"WhoCards"` (zero keywords); now
  `"WhoCards | Free Online Conversation Card Game & Deep Questions"`. Description now names the
  product category and mentions "66 ... questions in 14 languages" (matches the FAQ's own copy —
  no new claim). Scoped to `index.astro` only; the sitewide fallback description in `Head.astro`
  (used by any page that doesn't set its own) is untouched.
- **FAQ + `FAQPage` JSON-LD on `/ai-at-work`**, targeting the named uncontested intent ("how do I
  talk to my team about AI") from the business plan §8. Four Q&A pairs, every answer paraphrased
  from copy already on the page (hero, value props, CTA) — no new stats or claims, same discipline
  PR #66 used for its meta descriptions. Added to `~constants/faqs.ts` as `aiAtWorkFaqs`, rendered
  with the same `<Accordion>` component the homepage FAQ already uses.
- **`public/llms.txt`** — didn't exist. Added a short, factual site index (key pages + the
  question-page URL pattern) per the emerging llms.txt convention; static file, zero interaction
  with routing.

### Deferred — recommended, not implemented (ranked)

**P0 — highest leverage left**

1. **Build a `/conversation-starters` (or `/questions`) hub** linking all 924 question pages. They
   exist, are sitemapped, and have real unique content and JSON-LD — but zero internal links
   reach them today (confirmed: `Navigation.astro` and every page's body were searched, nothing
   links to `/[language]/question/[id]`). This is the biggest remaining gap and was already the old
   audit's top P1 — it's now more valuable, not less, since the pages themselves are healthier
   than they were. Effort: medium (new page + at least one link into it from nav or homepage); out
   of scope here because it's new content/IA, not a meta-level tweak.
2. **Homepage hero copy still pitches a physical-deck gift, not free online play.** The `<title>`/
   description fix in this PR only touches `<head>` — the visible H1 ("Change Your World, One
   Conversation at a Time") is fine (brand, evergreen), but the subhead directly under it reads
   _"Join us in spreading openness... by gifting WhoCards for yourself or someone who'll treasure
   them"_ — a preorder/gift-era holdover that undersells the actual current wedge (free online
   play, 14 languages) to both users and crawlers. High value, low effort, but it's a visible
   brand/positioning line on the highest-traffic page — recommend Avi signs off on new copy rather
   than an agent picking it silently.

**P1**

3. Decide deliberately on indexing `/play` and `/events/hajnalig/*` (§5) — likely fine as-is, just
   confirm it's a choice.
4. Give `/ai-at-work` its own OG image (there's already a `TODO(OG)` comment in the source for
   this) — it currently falls back to the generic `social.png`.
5. `og:locale` territory format (§6.2) — needs deliberate per-language territory picks.
6. Localize the `/ai-at-work` page and its new FAQ into the other 13 languages — matches the
   business plan §8's explicit "localize across the 14 languages (moat)" GTM move, and the
   multilingual angle is one of WhoCards' few real defensible edges vs. English-only competitors.

**P2 — compounding, more effort**

7. Broader AEO content structure per current 2026 guidance: lead each key page with a direct,
   quotable 40–60 word answer near the top (LLMs and AI Overviews disproportionately cite
   passage-level content, not whole pages); add comparison/definition content in short paragraphs
   or lists rather than long prose blocks where relevant.
8. Additional topic hubs (`/icebreaker-questions`, `/conversation-starters/for-teams`) — same shape
   as #1 above but for informational/top-of-funnel queries, and localizes 14×.
9. Confirm Google Search Console + Bing Webmaster Tools are verified and the sitemap is submitted
   (can't be verified from the codebase — operational check, not a code check).
10. Content freshness cadence: 2026 AEO research indicates pages not refreshed on a regular
    cadence lose AI citations at roughly 3x the rate of recently-updated ones — worth a quarterly
    pass over `/ai-at-work`'s stats once it's driving real traffic.

---

## 8. Sources consulted (2026 SEO/AEO guidance)

- [Google Search Central — FAQPage structured data, deprecation notice](https://developers.google.com/search/docs/appearance/structured-data/faqpage)
- [Search Engine Journal — "Google Drops FAQ Rich Results From Search"](https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/)
- Astro docs — [Configuration Reference](https://docs.astro.build/en/reference/configuration-reference/) (`build.format` / `Astro.url.pathname` interaction)
- Multiple 2026 international-SEO guides on hreflang self-reference/symmetry requirements and
  when it's necessary for pure-translation vs. same-language/different-region sites
- Multiple 2026 AEO/GEO guides (answer engine optimization, llms.txt convention, passage-level LLM
  citation behavior, citation timelines by engine)

_(Individual article URLs omitted above where a claim is corroborated across many similar 2026
guides rather than one authoritative source; the Google/Astro citations above are the load-bearing
ones and are linked directly.)_
