import {sql} from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type {
  GameLanguage,
  GameSettings,
  GameStatus,
  OddRule,
  Overtime,
  QuestionPlan,
  QuestionVote,
  RoundStatus,
} from '../schemas'

const createdAt = () => timestamp('created_at', {withTimezone: true}).defaultNow().notNull()

export const hostedGame = pgTable(
  'hosted_game',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    title: text('title').notNull(),
    status: text('status').$type<GameStatus>().notNull().default('lobby'),
    settings: jsonb('settings').$type<GameSettings>().notNull().default({round: {}}),
    createdBy: text('created_by'),
    hostKeyHash: text('host_key_hash'),
    createdAt: createdAt(),
  },
  (t) => [check('hosted_game_status_check', sql`${t.status} in ('lobby', 'live', 'ended')`)]
)

export const gamePlayer = pgTable(
  'game_player',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => hostedGame.id, {onDelete: 'cascade'}),
    name: text('name').notNull(),
    language: text('language').$type<GameLanguage>().notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    pairCode: text('pair_code').notNull(),
    email: text('email'),
    consentTranscript: boolean('consent_transcript').notNull().default(false),
    consentRecap: boolean('consent_recap').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique('game_player_game_pair_code_unique').on(t.gameId, t.pairCode),
    check('game_player_language_check', sql`${t.language} in ('en', 'hu')`),
  ]
)

export const gameRound = pgTable(
  'game_round',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => hostedGame.id, {onDelete: 'cascade'}),
    n: integer('n').notNull(),
    deckSlug: text('deck_slug').notNull(),
    questionPlan: jsonb('question_plan').$type<QuestionPlan>(),
    turnSeconds: integer('turn_seconds').notNull(),
    oddRule: text('odd_rule').$type<OddRule>().notNull().default('trio'),
    overtime: text('overtime').$type<Overtime>().notNull().default('nudge'),
    overtimeSeconds: integer('overtime_seconds').notNull().default(30),
    status: text('status').$type<RoundStatus>().notNull().default('pending'),
    startedAt: timestamp('started_at', {withTimezone: true}),
    endsAt: timestamp('ends_at', {withTimezone: true}),
    createdAt: createdAt(),
  },
  (t) => [
    unique('game_round_game_n_unique').on(t.gameId, t.n),
    // One live round per game, enforced where the race happens.
    uniqueIndex('game_round_one_live_idx')
      .on(t.gameId)
      .where(sql`${t.status} = 'live'`),
    check('game_round_status_check', sql`${t.status} in ('pending', 'live', 'done')`),
    check('game_round_odd_rule_check', sql`${t.oddRule} in ('trio', 'sitout')`),
    check('game_round_overtime_check', sql`${t.overtime} in ('nudge', 'hard')`),
  ]
)

export const gamePair = pgTable(
  'game_pair',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => gameRound.id, {onDelete: 'cascade'}),
    createdAt: createdAt(),
  },
  (t) => [index('game_pair_round_id_idx').on(t.roundId)]
)

export const gamePairPlayer = pgTable(
  'game_pair_player',
  {
    pairId: uuid('pair_id')
      .notNull()
      .references(() => gamePair.id, {onDelete: 'cascade'}),
    roundId: uuid('round_id')
      .notNull()
      .references(() => gameRound.id, {onDelete: 'cascade'}),
    playerId: uuid('player_id')
      .notNull()
      .references(() => gamePlayer.id, {onDelete: 'cascade'}),
    slot: smallint('slot').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({columns: [t.pairId, t.playerId]}),
    // A player is in at most one pair per round; slots cap a pair at three.
    unique('game_pair_player_round_player_unique').on(t.roundId, t.playerId),
    unique('game_pair_player_pair_slot_unique').on(t.pairId, t.slot),
    index('game_pair_player_player_id_idx').on(t.playerId),
    check('game_pair_player_slot_check', sql`${t.slot} between 0 and 2`),
  ]
)

export const gameTurn = pgTable(
  'game_turn',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pairId: uuid('pair_id')
      .notNull()
      .references(() => gamePair.id, {onDelete: 'cascade'}),
    playerId: uuid('player_id')
      .notNull()
      .references(() => gamePlayer.id, {onDelete: 'cascade'}),
    questionId: text('question_id').notNull(),
    startedAt: timestamp('started_at', {withTimezone: true}).notNull(),
    finishedAt: timestamp('finished_at', {withTimezone: true}),
    // Set while a transcription is in flight or done; cleared on failure, taken over once stale.
    transcribedAt: timestamp('transcribed_at', {withTimezone: true}),
    questionVote: smallint('question_vote').$type<QuestionVote>(),
  },
  (t) => [
    // The turn lock: a second claim while one is open fails here.
    uniqueIndex('game_turn_one_open_idx')
      .on(t.pairId)
      .where(sql`${t.finishedAt} is null`),
    unique('game_turn_pair_player_unique').on(t.pairId, t.playerId),
    index('game_turn_player_id_idx').on(t.playerId),
    check('game_turn_question_vote_check', sql`${t.questionVote} in (-1, 1)`),
  ]
)

export const gameResponse = pgTable(
  'game_response',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    turnId: uuid('turn_id')
      .notNull()
      .unique()
      .references(() => gameTurn.id, {onDelete: 'cascade'}),
    playerId: uuid('player_id')
      .notNull()
      .references(() => gamePlayer.id, {onDelete: 'cascade'}),
    language: text('language').$type<GameLanguage>().notNull(),
    transcript: text('transcript'),
    durationMs: integer('duration_ms').notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', {withTimezone: true}),
  },
  (t) => [
    index('game_response_player_id_idx').on(t.playerId),
    check('game_response_language_check', sql`${t.language} in ('en', 'hu')`),
  ]
)

export const gameFeedback = pgTable(
  'game_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => hostedGame.id, {onDelete: 'cascade'}),
    playerId: uuid('player_id')
      .notNull()
      .unique()
      .references(() => gamePlayer.id, {onDelete: 'cascade'}),
    rating: smallint('rating').notNull(),
    text: text('text'),
    createdAt: createdAt(),
  },
  (t) => [
    index('game_feedback_game_id_idx').on(t.gameId),
    check('game_feedback_rating_check', sql`${t.rating} between 1 and 5`),
  ]
)
