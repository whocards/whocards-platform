# WhoCards

WhoCards is a conversation game: curated questions that move people past "What do you do?" toward "Who are you?". This document is the shared glossary for the product across web, mobile, and the API. It is a glossary only — no implementation details.

## Language

**Question**:
One prompt's content together with its translations. The atomic unit of WhoCards content.
_Avoid_: prompt, card (a Card is the rendered form of a Question, not the content itself)

**Card**:
The visual presentation of a single Question — what a player sees and "draws". One Card shows one Question; Card and Question are 1:1.
_Avoid_: tile, slide

**Deck**:
A named, ordered, presentable set of Questions, with its own title, description, and available languages (e.g. "WhoCards", "AI Check-In", an event deck). What a player picks up and plays.
_Avoid_: set, pack, collection

**Library**:
The collection of all available Decks — what a player browses and chooses from. On mobile this is the home/browse surface ("your Library").
_Avoid_: catalog, store, registry (when referring to this collection)

**Pool**:
The master, multilingual store of Question content (currently 66 Questions in 14 languages) that Decks may reference by ID instead of carrying their own text. A Deck either references the Pool or carries its Questions inline.
_Avoid_: library (the Library is the set of Decks, not the set of Questions), global pool, the master list

**Custom Deck**:
A Deck authored and owned by a player rather than published by WhoCards. Structurally identical to any other Deck — the play engine treats it the same — but owned by an account and synced rather than served read-only.
_Avoid_: my deck, user deck, personal pack

**Access tier**:
The entitlement a Deck (or a language, or a feature) sits behind: `free`, `unlock` (one-time purchase), or `subscription`. The play engine is access-blind; a separate entitlement layer decides what a given player may open.
_Avoid_: plan, paywall, tier (unqualified)

**Game**:
A way of playing a Deck — the policy that decides how the next Card is drawn and whose progress is remembered. Content-blind: the Deck supplies the Questions, the Game supplies the rules. Every Game draws Cards **without repeating until the Deck is exhausted, then starts over**; Games may differ in the _scope_ of the "already answered" set they draw against (Global vs Personal) or in the _draw ritual_ — how a player reaches the next Card (Pick a Card). A Game is not a Display setting: anything that changes only how a Card looks, not how it is drawn, is not a Game.
_Avoid_: mode (unqualified), session, round, match

**Global Game**:
The default Game. One **shared** answered-set for everyone: a Question stays in circulation until _some_ player answers it, and the Deck starts over only once every Question has been answered across all players combined.
_Avoid_: public game, shared deck, world game

**Personal Game**:
A **paid** Game scoped to one player: it draws against _that player's own_ answered-set, so each player exhausts the whole Deck once before it starts over for them. Progress is saved to the account, not the device.
_Avoid_: my game, private game, solo game

**Pick a Card**:
A Game whose draw ritual is an explicit deal: the player draws each Card deliberately (a "Pick a card" action; later, tapping a face-down spread) and moving on returns them to the draw, not straight to another Card. Same non-repeating draw policy and answered-set scope as the Game it sits over; only the ritual of reaching the next Card differs. Access tier `unlock`.
_Avoid_: card mode, deal mode, draw mode

**Display setting**:
A per-Device presentation choice — which languages a Card shows, how a Card animates — that never affects which Card is drawn or whose progress is remembered. Display settings compose freely with any Game. Showing a Question in a primary language plus up to two secondary languages is a Display setting; Pick a Card is not (it changes the draw ritual, so it is a Game).
_Avoid_: mode, preference (unqualified), option

**Offline play**:
Playing the Global Game without a live network — a _connectivity state_, not a separate Game. Recording is **never** off: Answers are queued on the Device and flushed to the Answer record when the network returns, so offline play still feeds the shared progress once it syncs. (A fully isolated, never-syncing local mode — the old "classic" idea — is not part of the current plan; it may return later.)
_Avoid_: classic game, offline game (it is not a separate Game), local-only mode

**Answered**:
What becomes of a Card once a player has been shown it and stayed on it. Today simply being served the Card counts as answered; a planned refinement requires a minimum time on screen first. An answered Question leaves the unanswered set the current Game draws against. Always automatic — never an explicit tap (that is a reaction, or a Skip). Distinct from Skipped.
_Avoid_: seen, viewed (too weak — they don't carry the dwell that makes it "answered"), drawn (a player draws a Card; answering is what follows)

**Skipped**:
A Question deliberately passed over in Facilitation Mode without being answered: it is neither added to the answered set nor counted as answered, so it comes round again. (Not yet built.)
_Avoid_: dismissed, rejected, thumbs-down (a reaction to a Card, not a Skip)

**Facilitation Mode**:
A planned hosted way of running a Game for a group, adding a host-controlled per-Question timer and an explicit Skip. Its relationship to the three Games (whether it overlays any of them or is its own) is not yet decided. (Not yet built.)
_Avoid_: host mode, presenter mode, party mode

**Device**:
A single app install or browser, identified by a stable anonymous id minted once on first run and attached to every Answer. The only identity that exists pre-accounts; deliberately designed so a Device's history can later be **claimed** into an account and merged with other Devices. Not a person — one person may own several Devices.
_Avoid_: user, account (neither exists yet), session (a Device persists across sessions), anonymous user

**Answer record**:
The permanent, append-only history of Answers — one entry each time a Device answers a Question (which Deck, which Question, which language, when). The single source of truth from which the `questions_answered` and `games_played` counts, the Global cycle, and any future per-player coverage are all derived. The existing **conference question tracking** is this same concept in its first, event-scoped form (keyed by a conference); the Answer record generalizes it across the whole app (keyed by Device + Deck), and the conference tracker is expected to fold into it.
_Avoid_: analytics (this is durable product state and the source of truth, not an aggregate metrics pipeline)

**Share Card**:
A Card rendered as a standalone branded image made to travel outside the app — one Question as a picture, sized for where it lands (a link preview, a story, a post). The link-preview (OG) image is the first Share Card; the story and post sizes are the same concept in other shapes. Sharing one never affects play state.
_Avoid_: og image (one size/use of a Share Card, not the concept), screenshot, share image (unqualified)

**Share**:
The player action of sending the current Card out of the app, as either the Card's web link or a Share Card image — the player chooses which. A Share is an expression of the player, not a game event: it never draws, answers, or skips anything.
_Avoid_: post, send (unqualified), invite

**Android Tester**:
A person who helps validate the Android app before public launch. An Android Tester is part of the beta cohort, not a public app waitlist subscriber or general newsletter subscriber.
_Avoid_: beta tester (too vague), app waitlist subscriber
