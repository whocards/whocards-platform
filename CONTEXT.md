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
