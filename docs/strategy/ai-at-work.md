# WhoCards → "Navigating AI at Work": competitor analysis & product strategy

_Prepared 2026-06-16. Goal: find a wedge that gets WhoCards traction and revenue by pointing
its existing conversation-card engine at the single biggest unmet need in companies right now —
helping people talk honestly about AI arriving in their jobs._

---

## 1. The thesis (one paragraph)

Companies are spending heavily on AI but **adoption is stalling on the human layer, not the tech
layer**. Roughly **38% of AI implementation difficulty is user proficiency/resistance vs ~16%
technical**, and **88% of orgs use AI yet 62% are stuck in "experimenting/piloting."** Meanwhile
**~65–89% of workers are anxious about AI and their jobs, and only ~38% feel supported** through
the change. The market response so far is split into two extremes: cheap generic conversation
decks ($18–30) that don't touch AI, and expensive top-down AI workshops/consulting ($1.2k–$150k)
that are technical and rarely create psychological safety. **Nobody owns the honest-conversation
layer of AI adoption.** WhoCards is already a "conversations that encourage honest self-expression,
active listening, and deeper connection" engine. That is the exact bridge — and the product we're
already building (accounts + custom decks + custom questions, issue #45) is the monetization
vehicle.

---

## 2. Why now (the data)

| Signal                                                     | Number                                       | Source                              |
| ---------------------------------------------------------- | -------------------------------------------- | ----------------------------------- |
| Workers concerned about AI's impact on job security        | **89%** (65% "anxious about being replaced") | Resume Now AI Disruption Report     |
| Employees who feel fully supported adapting to AI          | only **38%**                                 | SHRM State of AI in HR 2026         |
| Workers confident using AI tools effectively               | **35%**                                      | Microsoft 2026 Work Trend Index     |
| Say employer is only "somewhat transparent" about AI plans | **54%**                                      | EY / Gallup                         |
| Orgs using AI in ≥1 function                               | **88%**                                      | McKinsey-style adoption stats (Go1) |
| …but stuck in "Experimenting/Piloting"                     | **62%**                                      | Go1 AI training report              |
| Share of adoption difficulty that is **people**, not tech  | **~38% proficiency vs ~16% technical**       | Larridin enterprise guide           |

> ⚠️ **Stat verification:** these figures come from secondary summaries and need a primary-source check before anything goes on a public page. For public-facing copy, prefer the independently-verified set in the landing-copy deliverable (PR #58/#62): Pew (52% worried), Ivanti (~30% hide AI use), McKinsey (leader/employee adoption gap), Mercer (40% obsolescence fear). The "~38% feel supported" figure in particular could not be verified against a public source.

**Read:** the buyer's pain is real, urgent, budgeted, and currently mis-served. When AI is framed
only as "efficiency / do more with less," employees "don't hear opportunity, they hear threat."
That emotional gap is conversational by nature — exactly WhoCards' home turf.

---

## 3. Competitor landscape

Four clusters. WhoCards' opening is the empty middle.

### Cluster A — Generic conversation / connection decks (consumer + light team)

We're Not Really Strangers, TableTopics (incl. a "Team" edition), The School of Life, Actually
Curious, We! Connect Cards (TEDx), Peelr (digital), The Unstuck Box, Best Self.

- **Price:** ~$18–30 retail per deck.
- **Strength:** brand, beautiful decks, proven format, emotional resonance.
- **Weakness:** generic. None address AI/role-change. No org/recurring revenue motion; one-time
  novelty purchase. This is the category WhoCards currently competes in — crowded, low margin.

### Cluster B — Facilitation / workshop card decks (B2B practitioner)

SessionLab "Workshops & Wizards," Foresight Cards, Synergy Stack, Trainers Warehouse decks.

- **Buyer:** facilitators, L&D, agile coaches.
- **Strength:** sold as professional tools, higher willingness to pay.
- **Weakness:** method-focused, not emotion-focused; not AI-specific.

### Cluster C — AI-specific learning tools (the new entrants)

**AI Tinkerers' Cards**, GenAI "teach with cards" decks, plus AI-literacy LMS content (Go1, D2L,
Judge, SAP Workforce Upskilling Assistant).

- **Strength:** ride the AI wave; clearly timely.
- **Weakness:** they teach **mechanics** ("what is a prompt, what is a token"). They do **not**
  address fear, identity, trust, "what stays human," or team norms. They make people _capable_,
  not _willing_.

### Cluster D — AI adoption workshops & change-management consulting (high-touch, high-ticket)

SmarterX (**$75k**/workshop), Connect Facilitation "AI Explore" (**€1,200 + VAT**, ≤30 ppl),
Instinctools, Improving, Microsoft/Simform readiness workshops; change-mgmt consulting
**£8k–£150k**; Moveworks/OCM/Robert Half playbooks.

- **Strength:** big budgets, executive sponsorship.
- **Weakness:** top-down, expensive, episodic. The honest peer-level conversation doesn't happen
  in a $75k exec session — it happens in the team, repeatedly, and that's unserved.

### The map

```
                         AI-SPECIFIC
                              |
        AI literacy LMS  •    |   • AI adoption workshops / consulting
        (Go1, SAP)            |     ($1.2k–$150k, top-down, technical)
   AI Tinkerers' cards •      |
                              |
                       >>>  THE GAP  <<<
            honest, recurring, team-level conversation
            about AI — psychological safety, not mechanics
                              |
   LOW-TOUCH / PRODUCT -------+------- HIGH-TOUCH / SERVICE
                              |
   WNRS, TableTopics •        |   • Facilitation decks (SessionLab,
   (generic connection,       |     Synergy Stack) — method, not emotion
    $18–30, one-time)         |
                              |
                          GENERIC
```

**WhoCards' wedge = the center:** AI-specific + emotionally honest + can be sold both as a
low-touch product _and_ laddered up to recurring team licenses and facilitated sessions.

---

## 4. Why WhoCards specifically can win this

1. **The brand promise already is the product.** "Honest self-expression, active listening, deeper
   connection" is the precise capability AI adoption is missing. No repositioning whiplash — it's a
   focusing of what WhoCards already says.
2. **The engine already exists.** The generalized `<Play>` component + SSR `/play` + programmatic
   OG card generation means a new "AI @ Work" deck is mostly **content + a curated question set**,
   not new infrastructure. Time-to-first-product is days, not months.
3. **The roadmap already builds the monetization layer.** Issue #45 (accounts, favorites, custom
   "decks," custom questions) is _exactly_ what a B2B team product needs: org accounts, company-
   branded/custom decks, a manager creating prompts for their team. We can re-justify #45 as the
   revenue feature, not a nice-to-have.
4. **Multilingual (14 languages).** Distributed/global teams are a real buyer; few competitors are
   localized. This is a moat for international mid-market.

---

## 5. Product line — what to sell (laddered)

Designed so each tier feeds the next and reuses existing tech.

### Tier 0 — "The AI Check-In" — free digital deck (the wedge / lead magnet) — **advertise NOW**

- 30–40 prompts a manager runs in a 20-minute team check-in: _"What's one task you'd hand to AI
  tomorrow, and one you'd never want to?" · "What are you secretly worried AI means for your role?"
  · "Where has AI already changed how you work this month?"_
- Ships on the **existing `/play` engine** as a named deck (`/play?deck=ai-at-work`).
- **Goal:** traffic + email capture + virality, not revenue. SEO ("AI team check-in questions,"
  "how to talk to my team about AI") and LinkedIn are wide open — Cluster C only ranks for
  "AI literacy."
- **Cost to ship:** ~days. Pure content + one deck route.

### Tier 1 — "Navigating AI Together" — paid deck (physical + digital) — **first revenue**

- 100–150 cards across acts: _Name the Fear → Map the Work (human vs automatable) → Redesign the
  Role → Team Norms for AI._ Includes a short **facilitator guide** (PDF) — that one addition moves
  it from Cluster A ($18–30 toy) to Cluster B (professional tool, $39–69).
- Sell physical decks (print-on-demand, the print pipeline exists) **and** a digital deck license.
- **Buyers:** team managers, L&D, "AI champions." Bulk/wholesale for orgs (10+ decks).
- **Price anchor:** $39–69 retail; bulk/org pricing per seat.

### Tier 2 — "WhoCards for Teams" — recurring team license — **the real business (this is #45)**

- Org accounts; company-branded and **custom decks**; managers author **custom questions**; saved
  favorites; light cadence (a fresh AI-conversation pack monthly); a simple "what did the team
  surface" view.
- **This is literally issue #45.** Reframe and prioritize it as the SaaS monetization layer.
- **Price anchor:** $5–10/seat/mo, or $1–3k/yr per team/org. Recurring → fixes the one-time-novelty
  revenue problem that plagues Cluster A.

### Tier 3 — "Navigating AI Together" facilitated session — services (margin + proof) — **optional**

- A packaged half-day workshop using the deck (run by us or certified facilitators).
- **Price anchor:** between Connect Facilitation's €1.2k and the $75k top end — land ~$2.5–6k.
- Purpose isn't scale; it's **case studies, content validation, and logos** that sell Tiers 1–2.

---

## 6. Who buys it (ICP)

- **Primary:** mid-market orgs (200–2,000 people) actively rolling out AI, where a People/L&D
  leader, an "AI champion," or a transformation/Chief-AI lead owns adoption and is **failing on the
  human side** (engagement, fear, shadow-AI use — 54% would use unauthorized tools).
- **Secondary (bottom-up):** individual team managers who feel the tension and want a 20-minute tool
  this week — they enter via Tier 0/1 and pull us into the org (PLG motion → Tier 2).
- **Champion's pain we sell to:** "My AI rollout is stalling and I can't tell if it's resistance,
  fear, or just confusion." We give them a safe, repeatable way to find out and move people.

---

## 7. Positioning & what to advertise

**Core message:** _"Your AI rollout is stalling because of people, not tech. Start the conversation."_

- Lead with the human/emotional angle — explicitly **not** "another AI tool" or another literacy
  course. The decks make people _willing_; LMS/literacy makes them _capable_. We pair with, don't
  compete with, Cluster C.
- **First marketing moves (cheap, this quarter):**
  1. Ship Tier 0 deck + a landing page targeting "talk to your team about AI" search intent (your
     SEO research ticket #52 should prioritize these keywords).
  2. LinkedIn content from the founder: the data in §2 + free prompts. This audience (L&D, People
     Ops, managers) lives on LinkedIn and shares frameworks.
  3. Lead magnet: "10 questions to run an AI check-in with your team" → email capture → Tier 1.
  4. Partner outreach to AI-literacy vendors and facilitators (Cluster C/B) — we're the
     complementary "willingness" layer to their "capability" content.

---

## 8. Risks & honest caveats

- **Content credibility:** workplace/AI prompts must feel expert, not novelty. Mitigate with a
  named advisor (an org-psych / change-mgmt voice) and the facilitator guide.
- **B2B motion is new muscle.** WhoCards has sold decks, not seats/contracts. Tier 2/3 need a
  sales/onboarding effort the team may not have yet — start with PLG (Tier 0→1) to learn the buyer
  before committing to Tier 2 build-out.
- **Trend timing:** AI-at-work is hot now; the deck must be evergreen enough to outlast the hype
  cycle (frame around "change & human work," not specific 2026 tools).
- **Incumbent fast-follow:** WNRS/TableTopics could ship an "AI edition." Our defensibility is the
  multilingual engine + Tier 2 recurring/custom platform (#45), which a card company can't easily
  match. Move on Tier 2 before the category gets crowded.

---

## 9. Recommended first 30 / 60 / 90 days

- **30:** Write the Tier 0 "AI Check-In" question set; ship it on the `/play` engine as a named
  deck + a dedicated landing page; start LinkedIn content. (Reuses existing infra — low cost.)
- **60:** Validate demand from Tier 0 traffic/emails. Draft the Tier 1 deck (100–150 cards) +
  facilitator guide; set up print-on-demand + digital purchase. Re-scope #45 as the Tier 2 product.
- **90:** Launch Tier 1 paid deck. Run 1–2 pilot Tier 3 facilitated sessions with friendly orgs for
  case studies. Decide go/no-go on building Tier 2 (the team license / #45) based on pilot signal.

---

## 10. How this maps to existing GitHub issues

| Issue                                                          | Current framing | Strategic re-frame                                                              |
| -------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| **#45** accounts / favorites / custom decks / custom questions | feature epic    | **Tier 2 SaaS monetization** — the recurring-revenue engine; re-prioritize      |
| **#52** SEO research                                           | site polish     | target "talk to your team about AI" / "AI team check-in" intent (Tier 0 funnel) |
| generalized `<Play>` + `/play?deck=`                           | done            | already supports per-deck routing for Tier 0/1                                  |
| `/og` card generation                                          | done            | per-deck shareable social cards = free distribution for the wedge               |

---

### Bottom line

The cheapest, fastest, highest-leverage move is to **ship the free "AI Check-In" deck on the engine
we already built and advertise the honest-conversation angle to L&D/managers on LinkedIn + SEO.**
It costs days, tests the whole thesis, and — if it lands — the paid deck (Tier 1) and the team
license that is already on the roadmap (#45 → Tier 2) are the revenue staircase behind it.
