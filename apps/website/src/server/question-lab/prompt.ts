// Canonical AI Check-In question-generation prompt (dev-only Question Lab).
//
// This string is the single source of truth for the prompt — the human-readable
// copy lives in docs/strategy/ai-at-work-question-prompt.md and must be kept in
// sync with it verbatim. The Question Lab (apps/website/src/pages/dev/question-lab.astro)
// uses this constant as the default, editable prompt sent to each model.
export const CANONICAL_PROMPT = `You are writing question cards for WhoCards, a card game of honest questions that help people truly meet each other. This deck is the **AI Check-In**: a 20-minute, manager-runnable team check-in about AI arriving in their work — the fear, the opportunity, what stays human, and the norms the team wants to live by.

Voice and rules:
- WhoCards tone is honest self-expression and connection. Write simple questions in broad language, leaving room for the player to decide what the question is really asking. The card never over-explains; context comes from the deck and the room.
- This is NOT an AI-literacy or prompt-writing deck. Every question is evergreen: no tools, products, models, vendors, or years.
- A question invites a feeling or a story, not a debate position. It must be answerable in the first person by anyone on a team, regardless of role or technical skill.
- One question per card, at most 20 words. No stacked clauses, no "…and why?" tails unless the tail is doing real work.
- Every question must be safe enough to answer out loud in front of one's manager, yet brave enough to get the quiet stuff on the table.
- No two questions may be near-duplicates; across the deck, vary the emotional register (worry, pride, hope, humor, care).

Structure — exactly 37 questions with ids ai-1 through ai-37, in four acts:
- Act 1, ai-1 to ai-9 — Name the fear: surface what people are quietly carrying before talking solutions.
- Act 2, ai-10 to ai-18 — Map the work: what could be handed over, and what is unmistakably human.
- Act 3, ai-19 to ai-27 — Redesign the role: if the busywork goes, what does a better, more human version of the job look like?
- Act 4, ai-28 to ai-37 — Team norms: land on shared agreements — trust, honesty, credit, and when a human must decide.

Direction for this generation: {{DIRECTION}}

Output: strict JSON only — no commentary, no markdown fences — in exactly this shape:
{"ai-1": {"en": "…"}, "ai-2": {"en": "…"}, …, "ai-37": {"en": "…"}}`

export type QuestionLabDirection = {
  id: string
  label: string
  description: string
}

// The five house directions from docs/strategy/ai-at-work-question-variants.md,
// offered as quick-pick chips in the Question Lab. The DIRECTION field also
// accepts arbitrary free text for further experimentation.
export const HOUSE_DIRECTIONS: QuestionLabDirection[] = [
  {
    id: 'facilitated',
    label: 'Facilitated',
    description: 'name AI, roles and agreements directly, easy to run structured',
  },
  {
    id: 'open',
    label: 'Open',
    description: 'barely name AI; ask what feels different, fragile, human, worth protecting',
  },
  {
    id: 'stories',
    label: 'Stories',
    description: 'every card asks for a remembered moment',
  },
  {
    id: 'human',
    label: 'Human',
    description: 'center craft, identity, care and judgment',
  },
  {
    id: 'together',
    label: 'Together',
    description: 'first-person plural, aimed at team norms and shared agreements',
  },
]

/** Substitutes the {{DIRECTION}} placeholder in a prompt template with free text. */
export const substituteDirection = (prompt: string, direction: string): string =>
  prompt.replaceAll('{{DIRECTION}}', direction)

/**
 * Strips accidental markdown code fences (```json ... ``` or ``` ... ```) that a
 * model sometimes wraps its JSON output in, despite being told not to.
 */
export const stripCodeFences = (text: string): string => {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

export type QuestionLabDeck = Record<string, {en: string}>

/** Parses a model's raw text response into a deck object, stripping fences defensively. */
export const parseModelResponse = (text: string): QuestionLabDeck => {
  const stripped = stripCodeFences(text)
  const parsed: unknown = JSON.parse(stripped)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Parsed response is not a JSON object')
  }
  return parsed as QuestionLabDeck
}

export const EXPECTED_QUESTION_IDS = Array.from({length: 37}, (_, i) => `ai-${i + 1}`)

/**
 * Validates that a parsed deck has exactly the 37 expected ai-1..ai-37 ids, each
 * mapping to an object with a non-empty `en` string. Throws with a descriptive
 * message on the first problem found, rather than returning a boolean, so the
 * caller can surface why validation failed.
 */
export const validateDeckJson = (deck: unknown): deck is QuestionLabDeck => {
  if (typeof deck !== 'object' || deck === null || Array.isArray(deck)) {
    throw new Error('Deck is not a JSON object')
  }
  const record = deck as Record<string, unknown>
  const keys = Object.keys(record)

  const missing = EXPECTED_QUESTION_IDS.filter((id) => !(id in record))
  if (missing.length > 0) {
    throw new Error(`Missing question ids: ${missing.join(', ')}`)
  }

  const extra = keys.filter((key) => !EXPECTED_QUESTION_IDS.includes(key))
  if (extra.length > 0) {
    throw new Error(`Unexpected question ids: ${extra.join(', ')}`)
  }

  for (const id of EXPECTED_QUESTION_IDS) {
    const entry = record[id]
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`Question ${id} is not an object`)
    }
    const en = (entry as Record<string, unknown>).en
    if (typeof en !== 'string' || en.trim().length === 0) {
      throw new Error(`Question ${id} is missing a non-empty "en" string`)
    }
  }

  return true
}

/** Groups the 37 questions into their four narrative acts for rendering. */
export const ACTS = [
  {id: 'name-the-fear', label: 'Act 1 — Name the fear', range: [1, 9]},
  {id: 'map-the-work', label: 'Act 2 — Map the work', range: [10, 18]},
  {id: 'redesign-the-role', label: 'Act 3 — Redesign the role', range: [19, 27]},
  {id: 'team-norms', label: 'Act 4 — Team norms', range: [28, 37]},
] as const

export const questionIdsForAct = (act: (typeof ACTS)[number]): string[] => {
  const [start, end] = act.range
  const ids: string[] = []
  for (let i = start; i <= end; i++) ids.push(`ai-${i}`)
  return ids
}
