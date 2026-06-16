import {relations} from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  foreignKey,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// const pgTable = pgTableCreator((name) => `whocards_${name}`)

// user -> many purchases
export const users = pgTable('user', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  newsletter: boolean('newsletter').default(false).notNull(),
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
