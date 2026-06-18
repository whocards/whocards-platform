import {relations, sql} from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'

// const pgTable = pgTableCreator((name) => `whocards_${name}`)

// user -> many purchases
export const users = pgTable('user', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  newsletter: boolean('newsletter').default(false).notNull(),
  // retire-candidate (ticket 0005): from website-next-15, approved to drop in a later migration
  ocSlug: text('oc_slug'),
})

export const usersRelations = relations(users, ({many}) => ({
  purchases: many(purchases),
}))

// purchase -> one user
export const purchases = pgTable('purchase', {
  id: text('id').primaryKey().notNull(),
  price: integer('price').notNull(),
  date: timestamp('date', {mode: 'date'}).notNull(),
  category: text('category').notNull(),
  netPrice: integer('netPrice').notNull(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
})

export const purchasesRelations = relations(purchases, ({one}) => ({
  shipping: one(shippings, {
    fields: [purchases.id],
    references: [shippings.purchaseId],
  }),
  user: one(users, {
    fields: [purchases.userId],
    references: [users.id],
  }),
}))

export const shippings = pgTable('shipping', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at'),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  company: text('company'),
  address: text('address').notNull(),
  address2: text('address2'),
  zip: text('zip').notNull(),
  city: text('city').notNull(),
  region: text('region'),
  quantity: integer('quantity').notNull(),
  country: text('country').notNull(),
  shippingProvider: text('shipping_provider'),
  providerShippingId: text('provider_shipping_id'),
  trackingUrl: text('tracking_url'),
  purchaseId: text('purchaseId')
    .notNull()
    .references(() => purchases.id)
    .unique(),
})

export const shippingRelations = relations(shippings, ({one}) => ({
  purchase: one(purchases, {
    fields: [shippings.purchaseId],
    references: [purchases.id],
  }),
}))

export const conference = pgTable('conference', {
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  id: bigint('id', {mode: 'number'}).primaryKey().generatedByDefaultAsIdentity({
    name: 'conference_id_seq',
    startWith: 1,
    increment: 1,
    minValue: 1,
    maxValue: 9223372036854775807,
    cache: 1,
  }),
  createdAt: timestamp('created_at', {withTimezone: true, mode: 'string'}).defaultNow().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  name: text('name').default('').notNull(),
  date: date('date'),
})

export const conferenceQuestionTracking = pgTable(
  'conference_question_tracking',
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    id: bigint('id', {mode: 'number'}).primaryKey().generatedByDefaultAsIdentity({
      name: 'conference_question_tracking_id_seq',
      startWith: 1,
      increment: 1,
      minValue: 1,
      maxValue: 9223372036854775807,
      cache: 1,
    }),
    createdAt: timestamp('created_at', {withTimezone: true, mode: 'string'}).defaultNow().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    conferenceId: bigint('conference_id', {mode: 'number'}).notNull(),
    questionId: smallint('question_id').notNull(),
    type: text('type').notNull().default('new'),
    user: text('user'),
    language: text('language'),
  },
  (table) => {
    return {
      conferenceQuestionTrackingConferenceIdFkey: foreignKey({
        columns: [table.conferenceId],
        foreignColumns: [conference.id],
        name: 'conference_question_tracking_conference_id_fkey',
      }),
    }
  }
)

// ---------------------------------------------------------------------------
// Reconciled from prod (ticket 0005, introspected 2026-06-18). These already
// exist in the Supabase prod DB but were previously unmodelled here; modelling
// them makes the schema a faithful superset of prod so `drizzle-kit push` /
// `generate` never proposes DROPPING them.
//
// ⚠️ AUTH DECISION PENDING (ticket 0005): prod has TWO overlapping auth table
// sets — `auth_*` (NextAuth, from website-next-15) and the older `account_*`
// set. Exactly one should survive; the consolidation is a deliberate follow-up
// migration that is NOT decided yet. Both are kept here for now so neither is
// dropped. The legacy `whocards_*` tables and `user.oc_slug` are likewise
// retire-candidates kept in the baseline; their drops are deliberate cleanups.
// ---------------------------------------------------------------------------

export const userRole = pgEnum('user_role', ['admin', 'owner', 'user'])

export const card = pgTable('card', {
  id: serial('id').primaryKey().notNull(),
  quantity: integer('quantity').notNull(),
  isBox: boolean('is_box').notNull(),
  isPurchased: boolean('is_purchased').notNull(),
  location: text('location').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true, mode: 'string'})
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true, mode: 'string'}),
})

// --- older auth attempt: account_* (retire-candidate, pending the auth decision) ---
export const accountUser = pgTable(
  'account_user',
  {
    id: varchar('id', {length: 255}).primaryKey().notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    image: text('image'),
    newsletter: boolean('newsletter').default(false).notNull(),
    isSuperuser: boolean('is_superuser').default(false).notNull(),
    emailVerified: timestamp('email_verified', {withTimezone: true, mode: 'string'}),
    lastLogin: timestamp('last_login', {withTimezone: true, mode: 'string'}),
    createdAt: timestamp('created_at', {withTimezone: true, mode: 'string'})
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true, mode: 'string'}),
  },
  (table) => {
    return {
      accountUserEmailUnique: unique('account_user_email_unique').on(table.email),
    }
  }
)

export const accountAccount = pgTable(
  'account_account',
  {
    userId: varchar('userId', {length: 255}).notNull(),
    type: varchar('type', {length: 255}).notNull(),
    provider: varchar('provider', {length: 255}).notNull(),
    providerAccountId: varchar('providerAccountId', {length: 255}).notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: varchar('token_type', {length: 255}),
    scope: varchar('scope', {length: 255}),
    idToken: text('id_token'),
    sessionState: varchar('session_state', {length: 255}),
  },
  (table) => {
    return {
      accountAccountUserIdIdx: index('account_userId_idx').on(table.userId),
      accountAccountUserIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [accountUser.id],
        name: 'account_account_userId_account_user_id_fk',
      }),
      accountAccountPk: primaryKey({
        columns: [table.provider, table.providerAccountId],
        name: 'account_account_provider_providerAccountId_pk',
      }),
    }
  }
)

export const accountVerificationToken = pgTable(
  'account_verificationToken',
  {
    identifier: varchar('identifier', {length: 255}).notNull(),
    token: varchar('token', {length: 255}).notNull(),
    expires: timestamp('expires', {mode: 'string'}).notNull(),
  },
  (table) => {
    return {
      accountVerificationTokenPk: primaryKey({
        columns: [table.identifier, table.token],
        name: 'account_verificationToken_identifier_token_pk',
      }),
    }
  }
)

// --- NextAuth auth_* (from website-next-15; retire-candidate, pending the auth decision) ---
export const authUser = pgTable('auth_user', {
  id: varchar('id', {length: 255}).primaryKey().notNull(),
  name: varchar('name', {length: 255}),
  email: varchar('email', {length: 255}).notNull(),
  emailVerified: timestamp('email_verified', {withTimezone: true, mode: 'string'}).default(
    sql`CURRENT_TIMESTAMP`
  ),
  image: varchar('image', {length: 255}),
  roles: userRole('roles').array().default(['user']).notNull(),
  requestedAdminAccess: boolean('requested_admin_access').default(false).notNull(),
})

export const authAccount = pgTable(
  'auth_account',
  {
    userId: varchar('user_id', {length: 255}).notNull(),
    type: varchar('type', {length: 255}).notNull(),
    provider: varchar('provider', {length: 255}).notNull(),
    providerAccountId: varchar('provider_account_id', {length: 255}).notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: varchar('token_type', {length: 255}),
    scope: varchar('scope', {length: 255}),
    idToken: text('id_token'),
    sessionState: varchar('session_state', {length: 255}),
  },
  (table) => {
    return {
      authAccountUserIdIdx: index('account_user_id_idx').on(table.userId),
      authAccountUserIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [authUser.id],
        name: 'auth_account_user_id_auth_user_id_fk',
      }),
      authAccountPk: primaryKey({
        columns: [table.provider, table.providerAccountId],
        name: 'auth_account_provider_provider_account_id_pk',
      }),
    }
  }
)

export const authSession = pgTable(
  'auth_session',
  {
    sessionToken: varchar('session_token', {length: 255}).primaryKey().notNull(),
    userId: varchar('user_id', {length: 255}).notNull(),
    expires: timestamp('expires', {withTimezone: true, mode: 'string'}).notNull(),
  },
  (table) => {
    return {
      authSessionUserIdIdx: index('session_user_id_idx').on(table.userId),
      authSessionUserIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [authUser.id],
        name: 'auth_session_user_id_auth_user_id_fk',
      }),
    }
  }
)

export const authVerificationToken = pgTable(
  'auth_verification_token',
  {
    identifier: varchar('identifier', {length: 255}).notNull(),
    token: varchar('token', {length: 255}).notNull(),
    expires: timestamp('expires', {withTimezone: true, mode: 'string'}).notNull(),
  },
  (table) => {
    return {
      authVerificationTokenPk: primaryKey({
        columns: [table.identifier, table.token],
        name: 'auth_verification_token_identifier_token_pk',
      }),
    }
  }
)

// --- legacy whocards_*-prefixed era (retire-candidate) ---
export const whocardsPurchase = pgTable(
  'whocards_purchase',
  {
    id: text('id').primaryKey().notNull(),
    price: integer('price').notNull(),
    category: text('category').notNull(),
    netPrice: integer('netPrice').notNull(),
    userId: varchar('userId', {length: 255}).notNull(),
    createdAt: timestamp('created_at', {withTimezone: true, mode: 'string'})
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true, mode: 'string'}),
  },
  (table) => {
    return {
      whocardsPurchaseUserIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [accountUser.id],
        name: 'whocards_purchase_userId_account_user_id_fk',
      }),
    }
  }
)

export const whocardsSession = pgTable(
  'whocards_session',
  {
    sessionToken: varchar('sessionToken', {length: 255}).primaryKey().notNull(),
    userId: varchar('userId', {length: 255}).notNull(),
    expires: timestamp('expires', {mode: 'string'}).notNull(),
  },
  (table) => {
    return {
      whocardsSessionUserIdIdx: index('session_userId_idx').on(table.userId),
      whocardsSessionUserIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [accountUser.id],
        name: 'whocards_session_userId_account_user_id_fk',
      }),
    }
  }
)

export const whocardsShipping = pgTable(
  'whocards_shipping',
  {
    id: serial('id').primaryKey().notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    company: text('company'),
    address: text('address').notNull(),
    address2: text('address2'),
    zip: text('zip').notNull(),
    city: text('city').notNull(),
    region: text('region'),
    quantity: integer('quantity').notNull(),
    country: text('country').notNull(),
    purchaseId: text('purchaseId').notNull(),
    createdAt: timestamp('created_at', {withTimezone: true, mode: 'string'})
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true, mode: 'string'}),
  },
  (table) => {
    return {
      whocardsShippingPurchaseIdFk: foreignKey({
        columns: [table.purchaseId],
        foreignColumns: [whocardsPurchase.id],
        name: 'whocards_shipping_purchaseId_whocards_purchase_id_fk',
      }),
      whocardsShippingPurchaseIdUnique: unique('whocards_shipping_purchaseId_unique').on(
        table.purchaseId
      ),
    }
  }
)
