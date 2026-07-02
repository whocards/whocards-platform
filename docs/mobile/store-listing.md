# WhoCards — Store Listing Copy

> DRAFT — pending a human pick between the candidate options below (issue #91). Screenshot
> production is #34; final store configuration and privacy/data-safety forms are #17. Do not
> submit until Phase 3 of `docs/RELEASE.md` is complete and the candidates below are resolved to
> single choices.

**How to read this draft:** sections marked with candidate packages (**A / B / C**) are not yet
decided — pick one (or mix-and-match subtitle from one with keywords from another, as long as the
"no wasted duplicates" note under Keywords still holds) and delete the rest before submission.
Everything else is a single recommended draft. Character limits below were verified against
current Apple/Google documentation on 2026-07-03 (sources in the PR description) — do not rely on
older cached numbers.

---

## App Name

**WhoCards** — already live on the App Store; unchanged here.

Apple's #1-weighted search field is the App Name (30 chars), and "WhoCards" alone carries no
generic keyword. A common ASO move is appending a descriptor (e.g. "WhoCards: Conversation Game")
to buy indexed keyword weight in the highest-value field. **Not proposed as a candidate here** —
renaming a live App Store listing resets accumulated search history/reviews-per-version continuity
and touches the website, README, deep links, and social handles well beyond this doc's scope. Flag
for a separate, deliberate decision if ASO data after launch shows the subtitle isn't carrying
enough keyword weight alone.

---

## App Store Connect (iOS)

### Subtitle (max 30 characters, confirmed) — candidates

Apple weighs App Name > Subtitle > Keyword field for search relevance, and the Subtitle displays
under the name everywhere the app is listed — it has to work as both a search asset and a
one-line pitch.

| #     | Subtitle                        | Chars | Rationale                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** | `Conversations that go deeper`  | 28/30 | Existing draft. Brand-forward, matches `soul.md`'s "warm, curious, direct" voice exactly. Weak on high-volume generic search terms (no "icebreaker"/"questions").                                                                                                                          |
| **B** | `Icebreaker & connection cards` | 29/30 | Leads with "icebreaker," likely the single highest-search-volume generic term in this category. Still plain, not gamified language — no "hack," "level up," etc. — so it doesn't violate the soul's playful-not-gamified line, but it reads more like a category label than an invitation. |
| **C** | `A deck for real conversation`  | 28/30 | Uses "deck," the product's own core metaphor (`CONTEXT.md`: Deck is what a player picks up and plays), plus "conversation." Splits the difference between brand voice and a real keyword.                                                                                                  |

**Recommendation: C.** It keeps the vocabulary CONTEXT.md and soul.md already use for the product
(Deck, conversation) rather than borrowing generic app-store words, and still carries "conversation"
for search. **Caveat:** this is a judgment call from category familiarity, not measured search
volume — before locking it in, run the three candidates through Apple Search Ads' keyword
popularity view or a paid ASO tool (AppTweak/Sensor Tower/data.ai) if one is available. None of
this doc's rationale substitutes for real volume data.

### Promotional Text (max 170 characters, confirmed; updatable any time without a new build/review) — candidates

| #     | Promo text                                                                                   | Chars  | Rationale                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| **A** | `Move past "What do you do?" and into who you really are. One question at a time, together.` | 90/170 | Existing draft. Purely brand voice, no stats.                                                                           |
| **C** | `66 questions, 14 languages, zero small talk. The deck that gets a table talking.`           | 80/170 | Concrete and scannable; "gets a table talking" nods to the soul's "the deck on the table, not the destination" framing. |

**Recommendation: A** — promotional text is prime real estate for the emotional pitch (it sits
right under the subtitle, above the fold), and the concrete stats already live in the long
description.

### Description (max 4,000 characters, confirmed; Apple does not index this field for search ranking)

Shared base with Google Play (see below) — the only iOS-specific difference is the closing
"Made by" / support block, which is identical on both stores today. Because this field isn't
search-indexed on iOS, prioritize conversion (the pitch, in the first 2–3 visible lines before
"more") over keyword density here.

```
WhoCards is a conversation game built for real connection — questions that move a real table past
"What do you do?" and into who you actually are.

Each card is a question designed to open something up: what shaped you, what you care about, what
makes you laugh, what keeps you up at night. Say it out loud, take turns, and let the conversation
run as long as it wants to.

HOW IT WORKS

Draw a card, read the question aloud, answer it — then pass the deck. No rounds to set up, no
rules to learn beyond that.

PLAY ANYWHERE, IN ANY LANGUAGE

WhoCards ships in 14 languages, including right-to-left support for Hebrew. Switch language
mid-game and your preference is remembered. Questions are written by humans and translated with
care — not machine-generated filler.

OFFLINE READY

No signal? No problem. The full deck lives in the app, so the conversation doesn't wait on a
connection.

SHARE A MOMENT

Found a question that stopped you in your tracks? Share it — as text, or as a card image — straight
from the app.

WHAT WE DON'T DO

No account required. No advertising. No tracking across other apps. No data sold. We collect only
what's needed to run and improve WhoCards: an anonymous device id, question activity, and
privacy-conscious product analytics.

WhoCards is made by Alles ist Dialog, a cultural association based in Switzerland.

Questions? hello@whocards.cc
Privacy Policy: https://whocards.cc/legal/pp
```

(1,306 characters — well under the 4,000 limit; leaves headroom for a future paragraph, e.g. once
the pick-a-card deck-flip ritual or a paid Game ships and deserves a mention.)

### Keywords (max 100 characters, confirmed, comma-separated) — candidates, paired to subtitle package

Apple indexes App Name + Subtitle + Keyword field together, so repeating a word already present in
the chosen Subtitle wastes keyword budget — the field below is written **against** its matching
subtitle package, not in isolation. Also drop plurals/singulars of the same stem (Apple matches
stems) and spaces around commas (they don't help and cost characters).

| #     | Paired with subtitle            | Keywords                                                                                           | Chars  |
| ----- | ------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| **A** | "Conversations that go deeper"  | `icebreaker,questions,connection,game,party,dating,team,family,friends,deck,couples`               | 82/100 |
| **B** | "Icebreaker & connection cards" | `conversation,questions,game,party,dating,team,family,friends,deep talk,date night,deck`           | 86/100 |
| **C** | "A deck for real conversation"  | `icebreaker,connection,questions,party game,dating,team building,family,friends,deep talk,couples` | 96/100 |

Recommendation: **C**, paired with subtitle C.

### Primary Category

**Social Networking** (alternative: Entertainment) — unchanged from the existing draft; final
call coordinated with #17 (see Open Questions).

### Secondary Category

**Games → Party Games** (alternative: Lifestyle) — unchanged; same #17 coordination note.

### Support URL / Support Email / Marketing URL / Privacy Policy URL / Copyright

Unchanged from the existing draft — these are compliance fields, not ASO copy, and belong to #17:

```
Support URL:     https://whocards.cc/contact
Support Email:   hello@whocards.cc
Marketing URL:   https://whocards.cc
Privacy Policy:  https://whocards.cc/legal/pp
Copyright:       © 2025–2026 Alles ist Dialog - Verein für Kulturentwicklung
```

### Age Rating

4+ (no objectionable content; no user-generated content in v1.0) — **flag, don't invent:** confirm
this is still accurate once #17 audits the actual v1 binary; a future paid Game or account layer
could change the answer.

---

## Google Play (Android)

### Short Description (max 80 characters, confirmed) — candidates, paired to the same packages

Google has no dedicated keyword field — title, short description, and the _entire_ long
description are all indexed by NLP/semantic matching (unlike iOS). So the short description
carries real search weight here, not just conversion copy.

| #     | Short description                                                                | Chars | Rationale                                                                               |
| ----- | -------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| **A** | `Conversation cards that move you past small talk — 14 languages, offline play.` | 78/80 | Existing draft.                                                                         |
| **B** | `Icebreaker cards for real talk — 14 languages, offline, no account needed.`     | 74/80 | Matches subtitle B's lead keyword.                                                      |
| **C** | `The card deck that turns small talk into real conversation. 14 languages.`      | 73/80 | Matches subtitle/keyword package C; "deck" + "conversation" both indexed here for free. |

Recommendation: **C**, matching the iOS pick, for one consistent story across stores.

### Full Description (max 4,000 characters, confirmed; Google indexes the entire field)

Same base text as the iOS description above — no changes needed. Because Play indexes the whole
field (not just the first few lines the way iOS treats it for conversion-only), keep the section
headers (HOW IT WORKS, PLAY ANYWHERE..., etc.) as they double as natural keyword anchors.

### Category

**Social** (alternative: Entertainment) — unchanged; #17 coordination note applies here too.

### Tags (correction from the previous draft)

The previous draft listed freeform tags (`conversation, icebreaker, party game, social,
questions`). That's wrong — **Play Console tags are chosen from Google's fixed predefined list**
(roughly 159 app tags / 127 game tags), not freeform text, and the console caps the pick at 5.
**Open question, not invented here:** pull up Play Console → Store presence → Main store listing →
Tags and pick the 5 closest matches to: conversation, social, party, family, icebreaker-adjacent
categories. The exact taxonomy strings need to be read live from the console, not guessed.

### Contact Email / Website / Privacy Policy URL / Content Rating

Unchanged from the existing draft — #17's domain:

```
Contact Email:   hello@whocards.cc
Website:         https://whocards.cc
Privacy Policy:  https://whocards.cc/legal/pp
Content Rating:  Everyone (pending actual IARC questionnaire — "Everyone" is the anticipated
                 outcome, not a guaranteed one; #17 must run the real questionnaire against the
                 v1 binary before this is final)
```

---

## "What's New" — v1 release notes (iOS + Android, max 4,000 characters on iOS; Play has no

strict published limit but conventionally matches)

```
Welcome to WhoCards on your phone.

Pull out the deck anywhere — dinner, a first date, a long drive, five minutes before a meeting —
and let one question do the work. 66 curated questions in 14 languages, offline-ready, no account
needed.

This is v1. Play a round, share a question that stops you in your tracks, and tell us what you'd
change: hello@whocards.cc
```

(354 characters.) Per `04-app-launch-plan.md` §6's release-cadence principle, every future release
should ship its own what's-new (e.g. the pick-a-card deck-flip ritual currently on
`feat/pick-a-card-deck-flip` deserves its own v1.1 note once it merges) — out of scope for this
draft, which only covers the v1 release the issue asked for.

---

## Localization plan

WhoCards ships 14 content languages today (`packages/decks/src/pool/languages.json`): Danish
(da), German (de), English (en), Spanish (es), French (fr), Hebrew (he), Hungarian (hu), Polish
(pl), Portuguese (pt), Portuguese-Brazil (pt-br), Romanian (ro), Serbian (sr), Mandarin (zh),
Japanese (jp). **Localizing the store _listing_ (name/subtitle/keywords/description) is a separate
decision from shipping a _content_ language** — the app already plays in all 14; the question here
is only which of those 14 also get a translated store page.

### Store-locale support is not symmetric between the two stores (researched, not assumed)

- **App Store Connect supports 50 metadata locales** as of the March 2026 expansion, and **Hebrew
  is on that list — Serbian is not.** So a fully localized Hebrew App Store page is possible;
  a Serbian one currently is not, no matter what we'd want to ship.
- **Google Play supports 51 listing locales, including both Hebrew and Serbian.**
- Net effect: Serbian-speaking players get the app in Serbian but can only discover/read about it
  on the App Store in whichever fallback language we set (likely English) — an unavoidable
  asymmetry between the two stores, not a gap in this plan. Worth calling out explicitly so it
  isn't rediscovered as a "bug" later.

### Proposed v1 tier (localize the store listing now)

- **English (primary/default)** — required baseline.
- **Hebrew** — the one language soul.md names explicitly ("a Hebrew-speaking grandmother" as the
  test case for the mixed-table promise) and the only RTL language shipped; a non-localized store
  page undersells exactly the feature (RTL support) most worth signaling to that audience.
- **German, French, Spanish, Portuguese (Portugal), Portuguese (Brazil)** — largest Western
  European/Latin American App Store and Play markets among the 14 shipped languages, standard
  first-wave ASO targets, supported on both stores.
- **Mandarin (zh-Hans)** — largest single-language market among the 14, supported on both stores
  (note: Play discoverability in mainland China is limited by Play Store availability there;
  Hong Kong/Taiwan/diaspora reach still applies).

### Proposed v1 tier (defer past v1)

- **Danish, Hungarian, Polish, Romanian, Japanese, Serbian** — smaller App/Play search markets
  relative to the tier above, and we have **zero install-geography data yet** (iOS only just went
  public; Android is still in closed testing) to prioritize between them. Revisit once the launch
  funnel (§7 of `04-app-launch-plan.md`) has real geography numbers — don't guess a ranking among
  six languages with no signal.

### Open question this plan flags rather than answers

The existing description explicitly claims _"Questions are written by humans, translated with
care — not machine-generated filler."_ That promise should extend to the store listing copy
itself, not just in-app content — a raw machine-translated store page undercuts the claim right
where a prospective player first reads it. **Is there budget/process for human-reviewed ASO
translation** (even a lightweight native-speaker pass over a machine draft) for the v1 tier above?
If not, either narrow the v1 tier further (e.g. Hebrew + German only) or accept the inconsistency
and note it for a fast follow-up. This is a resourcing decision, not a copy decision — flagging it
for the human rather than picking a budget.

---

## Coordination notes

### With #34 (screenshot generation)

The screenshot shot list below is unchanged from the previous draft's captures, but here's how it
should read as a story once #34 sizes/frames the final images — use whichever subtitle/keyword
package gets picked above to keep the caption vocabulary consistent (e.g. if package C is chosen,
"deck"/"conversation" should recur in captions rather than "icebreaker"):

| #   | Screen                      | Suggested caption (package C vocabulary)                                |
| --- | --------------------------- | ----------------------------------------------------------------------- |
| 1   | Landing / splash handoff    | "The deck for real conversation."                                       |
| 2   | Question card (English)     | "One question. A real answer."                                          |
| 3   | Language switcher           | "Fourteen languages. Everyone at the table."                            |
| 4   | Question card (Hebrew, RTL) | Same line, in Hebrew — proves the RTL claim rather than just stating it |
| 5   | Share sheet                 | "Found one that stopped you? Share it."                                 |

**Open question for #34, not decided here:** the shot list currently doesn't include the
pick-a-card deck-flip ritual (`feat/pick-a-card-deck-flip`, PR #160) — once that merges to `main`
it's arguably the single most screenshot-worthy interaction shipped since the original list was
drafted (soul.md calls the deck ritual "worth investing in"). Whether to hold #34's capture until
that PR lands, or capture the current UI and re-shoot later, is a sequencing call outside this
issue's scope.

### With #17 (category, age rating, compliance)

Everything in this doc under Category / Age Rating / Content Rating / Tags is carried forward from
the previous draft or corrected against current Play documentation (Tags, above) — none of it is
newly decided here. Two items #17 still needs to close, flagged rather than answered:

1. **Play "Everyone" content rating** is the anticipated IARC questionnaire outcome, not a filed
   result — #17 needs to actually run the questionnaire against the v1 binary.
2. **Play Tags** need to be picked from the live predefined list in Play Console (see Tags
   section above) — this doc can't enumerate Google's exact taxonomy strings from outside the
   console.

---

## Screenshot Shot-List

> DRAFT — capture these on simulator/device before submitting.
> Required device sizes are listed below; use the Expo device matrix (docs/RELEASE.md).

### Screens to capture (same set for both platforms)

| #   | Screen                                      | Key elements visible                                     |
| --- | ------------------------------------------- | -------------------------------------------------------- |
| 1   | Landing / splash handoff                    | WhoCards logo, branded background, "Start" or deck entry |
| 2   | WhoCards Deck — question card (English)     | Full question text, card design, swipe affordance        |
| 3   | Language switcher open                      | Language list, current selection highlighted             |
| 4   | WhoCards Deck — question card (Hebrew, RTL) | Hebrew text right-aligned, RTL layout correct            |
| 5   | Share sheet                                 | Shared question text visible                             |

> Recommended: at least 5 screenshots for each store. Use the
> same shots for both stores, cropped to the required dimensions. See Coordination notes above for
> suggested captions and the open question about the pick-a-card deck-flip ritual.

### iOS — Required device sizes (App Store Connect)

Provide screenshots for all required display types. Xcode Simulator can produce the correct
pixel dimensions.

| Display                                            | Points         | Required                               |
| -------------------------------------------------- | -------------- | -------------------------------------- |
| 6.9" (iPhone 16 Pro Max / iPhone 16 Plus)          | 1320 × 2868 px | Yes (required from 2024)               |
| 6.5" (iPhone 11 Pro Max / 12 Pro Max / 13 Pro Max) | 1284 × 2778 px | Yes (legacy required)                  |
| 5.5" (iPhone 8 Plus)                               | 1242 × 2208 px | Yes (if supporting iOS 15 and below)   |
| iPad Pro 13" (M4)                                  | 2064 × 2752 px | Required if listing as iPad-compatible |
| iPad Pro 12.9" (2nd/3rd gen)                       | 2048 × 2732 px | Required if listing as iPad-compatible |

> The 6.9" and 6.5" screenshots are displayed on the store page; the 5.5" is used as fallback
> for older device pages. Prioritise the 6.9" set for hero shots.

### Android — Required sizes (Google Play)

| Type                   | Size                                                             | Required                           |
| ---------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Phone screenshots      | min 320 px on short side, max 3840 px; aspect ratio 16:9 to 9:16 | 2–8 screenshots required           |
| 7" tablet screenshots  | same pixel rules as phone                                        | Required if targeting tablets      |
| 10" tablet screenshots | same pixel rules as phone                                        | Required if targeting tablets      |
| Feature graphic        | 1024 × 500 px                                                    | Required (shown above screenshots) |

> Use the Android emulator at 1080 × 2400 (420 dpi) for phone screenshots — covers most
> modern display sizes and produces clean pixel density.

### Feature Graphic / App Icon notes

- **iOS app icon:** 1024 × 1024 px, no alpha, no rounded corners (App Store applies the mask).
- **Android adaptive icon:** provide `ic_launcher_foreground.png` (108 × 108 dp safe zone)
  and `ic_launcher_background.png`; Expo manages this via `app.json` `android.adaptiveIcon`.
- **Play feature graphic:** 1024 × 500 px, used as the banner behind the first screenshot
  in the Play listing. Should carry the WhoCards logo and a brief tagline on brand background.

---

## App Privacy / Data Safety declarations

> Fill these forms in App Store Connect and Google Play Console to match the Privacy Policy
> at whocards.cc/legal/pp. Owned by #17 — reproduced here unchanged for context only; do not treat
> this section as re-litigated by #91.

### Apple App Privacy (App Store Connect)

| Data type                               | Collected         | Linked to identity | Used for tracking |
| --------------------------------------- | ----------------- | ------------------ | ----------------- |
| Device ID (anonymous, app-generated)    | Yes               | No                 | No                |
| Product interaction (PostHog analytics) | Yes               | No                 | No                |
| Crash data / diagnostics                | Yes (via PostHog) | No                 | No                |

- **Tracking:** No — do not check "track users across apps or websites owned by other companies."
- **Data linked to you:** None — the anonymous Device id is not linked to a name, email, or
  Apple ID.
- **NSUserTrackingUsageDescription:** Not required unless a tracking SDK is added in a future
  build. Do not add this key to `Info.plist` for v1.0.

### Google Play Data Safety

| Data type                                 | Collected | Shared | Encrypted in transit | User can request deletion    |
| ----------------------------------------- | --------- | ------ | -------------------- | ---------------------------- |
| App interactions (PostHog)                | Yes       | No     | Yes                  | No (aggregated)              |
| Device or other IDs (anonymous Device id) | Yes       | No     | Yes                  | Yes (by Device id via email) |

- **Cross-app tracking:** No.
- **Advertising ID (GAID):** Not used — do not declare it.
- **Data safety section:** Mark collection as "required for the app to function" for Device id;
  mark PostHog analytics as "optional — used to improve app performance."
