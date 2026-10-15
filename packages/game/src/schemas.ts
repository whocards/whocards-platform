import {z} from 'zod'

export const gameLanguageSchema = z.enum(['en', 'hu'])
export type GameLanguage = z.infer<typeof gameLanguageSchema>

export const gameStatusSchema = z.enum(['lobby', 'live', 'ended'])
export type GameStatus = z.infer<typeof gameStatusSchema>

export const roundStatusSchema = z.enum(['pending', 'live', 'done'])
export type RoundStatus = z.infer<typeof roundStatusSchema>

/** What happens to an odd player out: join a pair as a trio, or sit the round out. */
export const oddRuleSchema = z.enum(['trio', 'sitout'])
export type OddRule = z.infer<typeof oddRuleSchema>

/** When the turn timer runs out: nudge and allow extra seconds, or stop hard. */
export const overtimeSchema = z.enum(['nudge', 'hard'])
export type Overtime = z.infer<typeof overtimeSchema>

/** Source key for a game's own questions, alongside the deck slugs. */
export const CUSTOM_SOURCE = 'custom'
/** Custom question ids carry this prefix so they never read as a deck ref. */
export const CUSTOM_ID_PREFIX = 'c:'

export const customQuestionSchema = z.object({
  id: z.string().regex(/^c:[a-z0-9]{4,32}$/),
  en: z.string().trim().min(1).max(400),
  hu: z.string().trim().max(400).optional(),
})
export type CustomQuestion = z.infer<typeof customQuestionSchema>

/** `game_round.deck_slug` of a physical-cards round; names no deck. */
export const PHYSICAL_SOURCE = 'physical'
/** `game_turn.question_id` of a physical-cards turn: the question is on a card in the room. */
export const PHYSICAL_QUESTION_ID = `${PHYSICAL_SOURCE}:card`

/** A custom question id (`c:<id>`) or a deck question (`<deckSlug>:<id>`). */
export const questionRefSchema = z.string().regex(/^[a-z0-9-]+:[^:]+$/)
export type QuestionRef = z.infer<typeof questionRefSchema>

/** How a round hands out questions; `source` is a deck slug or CUSTOM_SOURCE. */
export const questionPlanSchema = z.discriminatedUnion('mode', [
  z.object({mode: z.literal('random'), source: z.string().min(1)}),
  z.object({mode: z.literal('same'), question: questionRefSchema}),
  z.object({
    mode: z.literal('per-turn'),
    questions: z.tuple([questionRefSchema, questionRefSchema]),
  }),
  z.object({mode: z.literal('physical')}),
])
export type QuestionPlan = z.infer<typeof questionPlanSchema>

export const roundSettingsSchema = z.object({
  questionPlan: questionPlanSchema,
  turnSeconds: z.number().int().min(10).max(1800),
  oddRule: oddRuleSchema.default('trio'),
  overtime: overtimeSchema.default('nudge'),
  overtimeSeconds: z.number().int().min(0).max(600).default(30),
})
export type RoundSettings = z.infer<typeof roundSettingsSchema>

/** How players answer: speak and transcribe, type, or just talk with nothing captured. */
export const answerModeSchema = z.enum(['voice', 'type', 'none'])
export type AnswerMode = z.infer<typeof answerModeSchema>

/** Every host switch, oldest first, stamped by the database clock like turn starts. */
export const answerModeLogSchema = z.array(z.object({mode: answerModeSchema, at: z.number()}))

/** Who hosts a workshop: a conference or company name. */
export const organizerSchema = z.string().trim().min(1).max(80)

/** `hosted_game.settings`: defaults the host starts each new round from. */
export const gameSettingsSchema = z.object({
  round: roundSettingsSchema.partial().default({}),
  // Optional: games created before organizers existed have none.
  organizer: organizerSchema.optional(),
  questions: z.array(customQuestionSchema).max(100).optional(),
  answerModes: answerModeLogSchema.optional(),
  // Secret in the host's facilitator link; joining with it puts the player on standby.
  standbyKey: z.string().min(16).optional(),
  /** Player ids of facilitators on standby for the odd player out. */
  standby: z.array(z.string()).optional(),
})
export type GameSettings = z.infer<typeof gameSettingsSchema>

/** Join and pair codes: short, uppercase, no look-alike characters. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,8}$/)

export const refusalSchema = z.enum([
  'unknown_game',
  'not_open',
  'game_over',
  'unknown_code',
  'round_not_live',
  'self',
  'already_paired',
  'partner_busy',
  'met_before',
  'not_paired',
  'partner_answering',
  'already_answered',
  'no_open_turn',
  'not_your_turn',
  'not_found',
  'wrong_answer_mode',
  'no_consent',
  'standby_partner',
  'standby_key',
  'unknown_name',
  'ambiguous_name',
  'still_answering',
  'physical_card',
])
export type Refusal = z.infer<typeof refusalSchema>

// ---------- inputs ----------

export const joinInputSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(40),
  language: gameLanguageSchema,
  email: z.string().trim().email().optional(),
  consentTranscript: z.boolean().default(false),
  consentRecap: z.boolean().default(false),
  standbyKey: z.string().trim().min(1).max(64).optional(),
})
export type JoinInput = z.input<typeof joinInputSchema>

export const screenInputSchema = z.object({code: codeSchema})

/** A scanned code, a pick from the name list, or typed text that is a pair code or a name. */
export const pairInputSchema = z.union([
  z.object({partnerCode: codeSchema}),
  z.object({partnerId: z.string().min(1)}),
  z.object({partner: z.string().trim().min(1).max(40)}),
])
export type PairInput = z.input<typeof pairInputSchema>

export const pairCandidatesInputSchema = z.object({partner: z.string().trim().min(1).max(40)})

/** Non-secret details that tell namesakes apart in the pick list. */
export type PairCandidate = {id: string; name: string; language: GameLanguage; joinedAt: number}

export const turnInputSchema = z.object({action: z.enum(['claim', 'finish'])})

export const MAX_TRANSCRIPT_CHARS = 20_000
const transcriptTextSchema = z.string().trim().min(1).max(MAX_TRANSCRIPT_CHARS)
const durationMsSchema = z.number().int().min(0).max(3_600_000)

export const responseInputSchema = z.object({
  turnId: z.string().min(1),
  language: gameLanguageSchema,
  transcript: transcriptTextSchema,
  durationMs: durationMsSchema,
  // Saving is the player's explicit yes; the client must say so.
  consent: z.literal(true),
})

export const feedbackInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(2000).optional(),
})

/** A player's thumb on their own question: up, down, or null to clear it. */
export const questionVoteSchema = z.union([z.literal(1), z.literal(-1)])
export type QuestionVote = z.infer<typeof questionVoteSchema>

export const voteInputSchema = z.object({
  turnId: z.string().min(1),
  vote: questionVoteSchema.nullable(),
})

export const deleteResponseInputSchema = z.object({responseId: z.string().min(1)})

export const editResponseInputSchema = z.object({
  responseId: z.string().min(1),
  transcript: transcriptTextSchema,
})

/** Multipart text fields of a recorded-answer upload, beside the `audio` file. */
export const answerUploadFieldsSchema = z.object({
  token: z.string().min(1),
  turnId: z.string().min(1),
  durationMs: z.coerce.number().pipe(durationMsSchema),
})

/** What the answer upload returns; `saved: false` means the take had no words in it. */
export const answerUploadResultSchema = z.object({saved: z.boolean()})
export type AnswerUploadResult = z.infer<typeof answerUploadResultSchema>

// ---------- outputs (timestamps are epoch ms) ----------

export const roundViewSchema = z.object({
  id: z.string(),
  n: z.number().int(),
  status: roundStatusSchema,
  deckSlug: z.string(),
  /** Questions come from a physical deck in the room, not the app. */
  physical: z.boolean(),
  turnSeconds: z.number().int(),
  oddRule: oddRuleSchema,
  overtime: overtimeSchema,
  overtimeSeconds: z.number().int(),
  startedAt: z.number().nullable(),
  endsAt: z.number().nullable(),
})
export type RoundView = z.infer<typeof roundViewSchema>

export const turnViewSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  questionId: z.string(),
  questionText: z.string().nullable(),
  answerMode: answerModeSchema,
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  /** Server stops the turn at this instant if nobody taps Finish. */
  deadline: z.number(),
  /** Only ever set on my own turns. */
  questionVote: questionVoteSchema.nullable(),
})
export type TurnView = z.infer<typeof turnViewSchema>

/** Where the player stands this round, from their own point of view. */
export const playerPhaseSchema = z.enum([
  'waiting', // no live round
  'unpaired',
  'find_facilitator', // odd one out while a facilitator is on standby
  'standby', // facilitator waiting for an odd one out
  'sitting_out',
  'ready', // paired, my turn available
  'speaking',
  'partner_speaking',
  'answered', // I'm done; partner still to go
  'pair_done',
])
export type PlayerPhase = z.infer<typeof playerPhaseSchema>

export const playerStateSchema = z.object({
  serverNow: z.number(),
  game: z.object({
    id: z.string(),
    code: z.string(),
    title: z.string(),
    organizer: z.string().nullable(),
    status: gameStatusSchema,
  }),
  me: z.object({
    id: z.string(),
    name: z.string(),
    language: gameLanguageSchema,
    pairCode: z.string(),
  }),
  round: roundViewSchema.nullable(),
  phase: playerPhaseSchema,
  pair: z
    .object({
      id: z.string(),
      partners: z.array(z.object({id: z.string(), name: z.string()})),
      turns: z.array(turnViewSchema),
      activeTurn: turnViewSchema.nullable(),
    })
    .nullable(),
})
export type PlayerState = z.infer<typeof playerStateSchema>

export const joinResultSchema = z.object({token: z.string(), state: playerStateSchema})
export type JoinResult = z.infer<typeof joinResultSchema>

export const screenStateSchema = z.object({
  serverNow: z.number(),
  game: z.object({
    code: z.string(),
    title: z.string(),
    organizer: z.string().nullable(),
    status: gameStatusSchema,
    answerMode: answerModeSchema,
  }),
  round: roundViewSchema.nullable(),
  counts: z.object({
    joined: z.number().int(),
    paired: z.number().int(),
    talking: z.number().int(),
    done: z.number().int(),
  }),
})
export type ScreenState = z.infer<typeof screenStateSchema>

export const myDataSchema = z.object({
  player: z.object({
    name: z.string(),
    language: gameLanguageSchema,
    email: z.string().nullable(),
    consentTranscript: z.boolean(),
    consentRecap: z.boolean(),
  }),
  responses: z.array(
    z.object({
      id: z.string(),
      turnId: z.string(),
      questionId: z.string(),
      language: gameLanguageSchema,
      transcript: z.string(),
      durationMs: z.number().int(),
      createdAt: z.number(),
    })
  ),
})
export type MyData = z.infer<typeof myDataSchema>

export const transcriptSchema = z.object({
  text: z.string(),
  language: gameLanguageSchema,
  model: z.string(),
})
export type Transcript = z.infer<typeof transcriptSchema>
