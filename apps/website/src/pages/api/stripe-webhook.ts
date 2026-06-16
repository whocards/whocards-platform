import type {APIRoute} from 'astro'
import Stripe from 'stripe'
import {products} from '~constants/products'
import {env} from '~env-secrets'
import {
  getPurchase,
  insertPurchase,
  insertPurchaseSchema,
  insertShippingAddress,
  insertShippingSchema,
  insertUser,
  insertUserSchema,
  updateShippingProviderInfo,
} from '~server/db'
import {
  createNewShippingOrder,
  egonConstants,
  egonCreateItems,
  getShippingProvider,
} from '~server/egon'
import type {CreateNewShippingOrder} from '~types/shipping'

export const prerender = false

const stripe = new Stripe(env.STRIPE_PRIVATE_KEY)

export const POST: APIRoute = async ({request}) => {
  if (new URL(request.url).searchParams.get('auth_token') !== env.WEBHOOK_AUTH_TOKEN) {
    return new Response('Unauthorized', {status: 401})
  }

  const sig = request.headers.get('stripe-signature')

  let event: Stripe.Event

  try {
    if (!sig) throw new Error('No signature')
    event = stripe.webhooks.constructEvent(await request.text(), sig, env.STRIPE_WEBHOOK_SECRET)

    if (event.livemode !== true) {
      console.log('Received event in test mode:')
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        {
          console.log('handling event', event.id)

          const charge = event.data.object

          const product = products.find((p) => p.price * 100 === charge.amount_subtotal) ?? {
            title: 'Unknown product',
            quantity: 0,
          }

          // create db user
          const userSchema = insertUserSchema.safeParse({
            name: charge.customer_details?.name,
            email: charge.customer_details?.email,
          })

          if (!userSchema.success) {
            console.error('user data failed', userSchema.error)
            throw new Error(userSchema.error.toString())
          }

          const dbUser = await insertUser(userSchema.data)

          // create db purchase
          const purchaseSchema = insertPurchaseSchema.safeParse({
            id: charge.id,
            price: charge.amount_total,
            netPrice: charge.amount_subtotal,
            date: new Date(charge.created * 1000),
            category: product.title,
            userId: dbUser.id,
          })

          if (!purchaseSchema.success) {
            console.error(purchaseSchema.error)
            throw new Error('purchase details failed')
          }

          // insert purchases
          let dbPurchase =
            (await insertPurchase(purchaseSchema.data)) ||
            (await getPurchase(purchaseSchema.data.id))

          if (!dbPurchase) {
            throw new Error('purchase not created or found')
          }

          // create db shipping
          const address = charge.shipping_details?.address

          if (!address) {
            throw new Error('no address')
          }

          const shippingSchema = insertShippingSchema.safeParse({
            ...userSchema.data,
            phone: charge.customer_details?.phone,
            quantity: product.quantity,
            price: charge.amount_total,
            country: address?.country,
            region: address?.state,
            city: address?.city,
            zip: address?.postal_code,
            address: address?.line1,
            postalCode: address?.postal_code,
            address2: address?.line2,
            purchaseId: dbPurchase.id,
            company: charge.custom_fields[0]?.text?.value ?? '',
          })

          if (!shippingSchema.success) {
            console.error(shippingSchema.error.flatten().fieldErrors, dbPurchase)
            throw new Error('shipping details failed')
          }

          const dbShipping = await insertShippingAddress(shippingSchema.data)

          const newShippingOrder: CreateNewShippingOrder = {
            // Static values
            payment_cod: egonConstants.paymentCod,
            shop_setting_id: egonConstants.shopId,
            id_payment: egonConstants.paymentId,
            original_order_id: dbShipping.purchaseId,
            customer_name: dbShipping.name.split(' ')[0],
            customer_surname: dbShipping.name.split(' ')[1] || '',
            customer_phone: dbShipping.phone || '',
            customer_email: dbShipping.email,
            name: dbShipping.name.split(' ')[0],
            surname: dbShipping.name.split(' ')[1] || '',
            phone: dbShipping.phone || '',
            email: dbShipping.email,
            street: [dbShipping.address, dbShipping.address2].join(', '),
            street_number: '',
            city: dbShipping.city,
            country: dbShipping.country,
            destination_country_code: dbShipping.country,
            postal_code: dbShipping.zip,
            id_delivery: getShippingProvider(dbShipping.country),
            items: egonCreateItems(product.quantity),
          }

          let externalShipping
          let newShipping

          if (dbShipping.country === 'CH') {
            // TODO: add notification to admin
            console.log('Switzerland shipping, skipping Egon')
            externalShipping = 'Switzerland shipping, skipping Egon'
          } else {
            newShipping = await createNewShippingOrder(newShippingOrder)

            if (!newShipping.ok) {
              console.error('egon shipping failed', newShipping)
              throw new Error('egon shipping failed')
            }

            await updateShippingProviderInfo({
              id: dbShipping.id,
              shippingProvider: egonConstants.name,
              providerShippingId: newShipping.data.response.resp_data.order_id,
              trackingUrl: newShipping.data.response.resp_data.myorder_url,
            })

            externalShipping = newShipping
          }
          // const zenShipping = await createZenShipping(dbShipping)

          // if (!!zenShipping?.errors?.length) {
          //   console.error('zen shipping failed', zenShipping)
          //   throw new Error('zen shipping failed')
          // }

          console.log('purchase webhook success')
          console.log(
            JSON.stringify({dbPurchase, dbShipping, externalShipping, newShipping}, null, 2)
          )
        }
        break
      // ... handle other event types
      default:
        console.log(`Unhandled event type ${event.type}`)
    }

    // Return a 200 response to acknowledge receipt of the event
    return new Response('Success', {status: 200})
  } catch (err) {
    console.error('purchase webhook failed')
    console.error(err)
    return new Response(`Webhook Error: ${(err as Error).message}`, {status: 400})
  }
}
