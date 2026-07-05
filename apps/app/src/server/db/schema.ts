import {relations} from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// better-auth tables (generated via `pnpm auth:generate`, then hand-merged here
// to match house style — one schema.ts, camelCase bindings). All prefixed
// `app_` at the SQL level: this app owns a fully separate auth/user set from
// apps/website's existing `user`/`auth_*`/`account_*` tables (never touched —
// see ADR-0008 and the overnight app-foundation plan's DB guardrails).
//
// Regenerate after changing auth.tsx's plugins with:
//   pnpm auth:generate
// then re-apply any renames/comments here by hand (the generated file is
// disposable scratch output, not committed).
// ---------------------------------------------------------------------------

export const appUser = pgTable('app_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const appSession = pgTable(
  'app_session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => appUser.id, {onDelete: 'cascade'}),
    // Added by the organization plugin.
    activeOrganizationId: text('active_organization_id'),
  },
  (table) => [index('app_session_user_id_idx').on(table.userId)]
)

export const appAccount = pgTable(
  'app_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => appUser.id, {onDelete: 'cascade'}),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('app_account_user_id_idx').on(table.userId)]
)

export const appVerification = pgTable(
  'app_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('app_verification_identifier_idx').on(table.identifier)]
)

export const appOrganization = pgTable(
  'app_organization',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    createdAt: timestamp('created_at').notNull(),
    metadata: text('metadata'),
  },
  (table) => [uniqueIndex('app_organization_slug_uidx').on(table.slug)]
)

/** Role is one of ROLE_RANK (see server/auth/permissions.ts) — kept as plain text
 *  (not a pgEnum) so adding a role is a code change, not a migration. */
export const appMember = pgTable(
  'app_member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => appOrganization.id, {onDelete: 'cascade'}),
    userId: text('user_id')
      .notNull()
      .references(() => appUser.id, {onDelete: 'cascade'}),
    role: text('role').default('member').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    index('app_member_organization_id_idx').on(table.organizationId),
    index('app_member_user_id_idx').on(table.userId),
  ]
)

export const appInvitation = pgTable(
  'app_invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => appOrganization.id, {onDelete: 'cascade'}),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => appUser.id, {onDelete: 'cascade'}),
  },
  (table) => [
    index('app_invitation_organization_id_idx').on(table.organizationId),
    index('app_invitation_email_idx').on(table.email),
  ]
)

export const appUserRelations = relations(appUser, ({many}) => ({
  sessions: many(appSession),
  accounts: many(appAccount),
  members: many(appMember),
  invitations: many(appInvitation),
}))

export const appSessionRelations = relations(appSession, ({one}) => ({
  user: one(appUser, {fields: [appSession.userId], references: [appUser.id]}),
}))

export const appAccountRelations = relations(appAccount, ({one}) => ({
  user: one(appUser, {fields: [appAccount.userId], references: [appUser.id]}),
}))

export const appOrganizationRelations = relations(appOrganization, ({many}) => ({
  members: many(appMember),
  invitations: many(appInvitation),
}))

export const appMemberRelations = relations(appMember, ({one}) => ({
  organization: one(appOrganization, {
    fields: [appMember.organizationId],
    references: [appOrganization.id],
  }),
  user: one(appUser, {fields: [appMember.userId], references: [appUser.id]}),
}))

export const appInvitationRelations = relations(appInvitation, ({one}) => ({
  organization: one(appOrganization, {
    fields: [appInvitation.organizationId],
    references: [appOrganization.id],
  }),
  inviter: one(appUser, {fields: [appInvitation.inviterId], references: [appUser.id]}),
}))

// ---------------------------------------------------------------------------
// App-specific tables (hand-authored). One row per (deckSlug, questionId) under
// review; deckSlug is always 'ai-at-work' tonight but kept generic since the
// review surface is designed to outlive this one deck.
// ---------------------------------------------------------------------------

export const questionReview = pgTable(
  'question_review',
  {
    id: serial('id').primaryKey(),
    deckSlug: text('deck_slug').notNull(),
    questionId: text('question_id').notNull(),
    status: text('status').default('draft').notNull(), // draft | in_review | approved | rejected
    // The decided text for this question — starts as the shipped baseline, becomes
    // the winning variant's (or a proposed edit's) text once approved.
    currentText: text('current_text').notNull(),
    // A facilitator+ can hand-edit rather than pick a variant verbatim.
    proposedEdit: text('proposed_edit'),
    decidedBy: text('decided_by').references(() => appUser.id),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [unique('question_review_deck_question_unique').on(table.deckSlug, table.questionId)]
)

export const questionComment = pgTable(
  'question_comment',
  {
    id: serial('id').primaryKey(),
    deckSlug: text('deck_slug').notNull(),
    questionId: text('question_id').notNull(),
    authorId: text('author_id')
      .notNull()
      .references(() => appUser.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('question_comment_deck_question_idx').on(table.deckSlug, table.questionId)]
)

/** One vote per (deckSlug, questionId, voter) — re-voting updates it in place. */
export const questionVote = pgTable(
  'question_vote',
  {
    id: serial('id').primaryKey(),
    deckSlug: text('deck_slug').notNull(),
    questionId: text('question_id').notNull(),
    voterId: text('voter_id')
      .notNull()
      .references(() => appUser.id),
    // Which variant file this vote endorses for this question, e.g. 'ai-at-work-human'.
    variant: text('variant').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('question_vote_deck_question_voter_unique').on(
      table.deckSlug,
      table.questionId,
      table.voterId
    ),
  ]
)

/** Transcript of the "discuss with an agent" thread per question (slice 5). */
export const agentMessage = pgTable(
  'agent_message',
  {
    id: serial('id').primaryKey(),
    deckSlug: text('deck_slug').notNull(),
    questionId: text('question_id').notNull(),
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    authorId: text('author_id').references(() => appUser.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('agent_message_deck_question_idx').on(table.deckSlug, table.questionId)]
)

export const questionReviewRelations = relations(questionReview, ({one}) => ({
  decider: one(appUser, {fields: [questionReview.decidedBy], references: [appUser.id]}),
}))

export const questionCommentRelations = relations(questionComment, ({one}) => ({
  author: one(appUser, {fields: [questionComment.authorId], references: [appUser.id]}),
}))

export const questionVoteRelations = relations(questionVote, ({one}) => ({
  voter: one(appUser, {fields: [questionVote.voterId], references: [appUser.id]}),
}))

export const agentMessageRelations = relations(agentMessage, ({one}) => ({
  author: one(appUser, {fields: [agentMessage.authorId], references: [appUser.id]}),
}))

// ---------------------------------------------------------------------------
// Decks (added 2026-07-05, founder feedback pass — see
// docs/plans/2026-07-04-app-foundation-overnight.md's status log for the
// design writeup). A deck is a named, sluggable set of questions moving through
// a review pipeline (`status`); `deckQuestion` is its roster — which question
// ids belong to it, their act/section label (for grouping the review UI), and
// display order. Review/vote/comment state for a question id stays entirely in
// the existing `question_review`/`question_vote`/`question_comment` tables
// above, UNCHANGED — this keeps tonight's migration pure `CREATE TABLE` (no
// `ALTER`/`DROP` on anything pre-existing). The link between a deckQuestion row
// and its question_review/vote/comment rows is a loose (deckSlug, questionId)
// match, same as those tables already used before decks existed; only
// deckQuestion.deckSlug gets a real FK, since deck/deckQuestion are both new.
// `status` is plain text (not a pgEnum), same rationale as appMember.role
// above: adding a status is a code change, not a migration.
// ---------------------------------------------------------------------------

export const deck = pgTable(
  'deck',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').default('draft').notNull(), // draft | in_review | approved | shipped
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [unique('deck_slug_unique').on(table.slug)]
)

/** A deck's question roster. Adding a question to a deck (facilitator+, see
 *  decks.ts's `addQuestion`) inserts one row here plus one `question_review`
 *  row (its initial text, status 'draft') — the roster row owns membership +
 *  section grouping, the review row owns workflow state, unchanged from how
 *  question_review already worked pre-decks. */
export const deckQuestion = pgTable(
  'deck_question',
  {
    id: serial('id').primaryKey(),
    deckSlug: text('deck_slug')
      .notNull()
      .references(() => deck.slug),
    questionId: text('question_id').notNull(),
    actLabel: text('act_label').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdBy: text('created_by').references(() => appUser.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('deck_question_deck_question_unique').on(table.deckSlug, table.questionId),
    index('deck_question_deck_slug_idx').on(table.deckSlug),
  ]
)

export const deckRelations = relations(deck, ({many}) => ({
  questions: many(deckQuestion),
}))

export const deckQuestionRelations = relations(deckQuestion, ({one}) => ({
  deck: one(deck, {fields: [deckQuestion.deckSlug], references: [deck.slug]}),
  creator: one(appUser, {fields: [deckQuestion.createdBy], references: [appUser.id]}),
}))
