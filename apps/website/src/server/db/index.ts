import {count, eq} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/postgres-js'
import {createInsertSchema} from 'drizzle-zod'
import postgres from 'postgres'
import {z} from 'zod'
import {env} from '~env-secrets'
import {countryString} from '~utils/schemas'
import * as schemas from './schema'

const client = postgres(env.DB_URL)
export const db = drizzle(client, {schema: schemas})

const {purchases, users, shippings} = schemas

// types
export type PurchaseCreate = typeof purchases.$inferInsert
export type PurchaseSelect = typeof purchases.$inferSelect
export type UserCreate = typeof users.$inferInsert
export type UserSelect = typeof users.$inferSelect
export type ShippingCreate = typeof shippings.$inferInsert
export type ShippingSelect = typeof shippings.$inferSelect
export type FullPurchase = Awaited<ReturnType<typeof getPurchaseById>>
export type ShippingProviderInfo = Pick<
  ShippingSelect,
  'shippingProvider' | 'providerShippingId' | 'trackingUrl' | 'id'
>

// schemas
export const schema = {...schemas}
export const insertUserSchema = createInsertSchema(users)
export const insertPurchaseSchema = createInsertSchema(purchases)
export const insertShippingSchema = createInsertSchema(shippings, {
  quantity: z.coerce.number(),
  address: z.string().min(1, {message: 'Field is required'}),
  zip: z.string().min(1, {message: 'Field is required'}),
  country: countryString,
  city: z.string().min(1, {message: 'Field is required'}),
  phone: z.string().regex(/^[\d\s()+-.]+$/, {message: 'Invalid phone number'}),
  company: z.string().optional().default(''),
})

// queries
export const getPurchaseById = (purchaseId: string) =>
  db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .innerJoin(users, eq(purchases.userId, users.id))
    .leftJoin(shippings, eq(purchases.id, shippings.purchaseId))
    .then((rows) => rows[0])

export const insertShippingAddress = (shipping: ShippingCreate) =>
  db
    .insert(schema.shippings)
    .values(shipping)
    .onConflictDoUpdate({
      target: shippings.purchaseId,
      set: {
        name: shipping.name,
        email: shipping.email,
        phone: shipping.phone,
        company: shipping.company,
        address: shipping.address,
        address2: shipping.address2,
        zip: shipping.zip,
        city: shipping.city,
        region: shipping.region,
        country: shipping.country,
        providerShippingId: shipping.providerShippingId,
        trackingUrl: shipping.trackingUrl,
        shippingProvider: shipping.shippingProvider,
      },
    })
    .returning()
    .then((rows) => rows[0])

export const updateShippingProviderInfo = (shipping: ShippingProviderInfo) =>
  db
    .update(schema.shippings)
    .set({
      shippingProvider: shipping.shippingProvider,
      providerShippingId: shipping.providerShippingId,
      trackingUrl: shipping.trackingUrl,
    })
    .where(eq(schema.shippings.id, shipping.id))
    .returning()
    .then((rows) => rows[0])

export const insertUser = (user: UserCreate) =>
  db
    .insert(schema.users)
    .values(user)
    .onConflictDoUpdate({
      target: schema.users.email,
      set: {
        name: user.name,
        newsletter: user.newsletter,
        email: user.email,
      },
    })
    .returning()
    .then((rows) => rows[0])

export const insertPurchase = (purchase: PurchaseCreate) =>
  db
    .insert(schema.purchases)
    .values(purchase)
    .onConflictDoNothing()
    .returning()
    .then((rows) => rows[0])

export const getPurchase = (purchaseId: string) =>
  db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.id, purchaseId))
    .then((rows) => rows[0])

export const getPurchaseCount = () => db.select({value: count(purchases.id)}).from(schema.purchases)
