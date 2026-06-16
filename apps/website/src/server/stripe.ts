import Stripe from 'stripe'
import {allowed_countries} from '~constants/countries'
import {env} from '~env-secrets'
import type {Order} from '~utils/schemas'

export const createSession = async (order: Order, url: URL) => {
  const stripe = new Stripe(env.STRIPE_PRIVATE_KEY)
  return await stripe.checkout.sessions.create({
    submit_type: 'pay',
    mode: 'payment',
    locale: 'auto',
    line_items: [
      {
        price: order.priceId,
        quantity: 1,
      },
    ],
    custom_fields: [
      {
        key: 'company',
        label: {
          type: 'custom',
          custom: 'Company',
        },
        type: 'text',
        optional: true,
      },
    ],
    consent_collection: {
      terms_of_service: 'required',
    },
    custom_text: {
      terms_of_service_acceptance: {
        message: 'I agree to the [Privacy Policy](https://whocards.cc/legal/pp)',
      },
    },
    cancel_url: url.toString(),
    success_url: `${url.origin}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    phone_number_collection: {enabled: true},
    shipping_options: [{shipping_rate: order.shippingId}],
    shipping_address_collection: {
      allowed_countries,
    },
  })
}

// session_id = cs_test_a1YCBR5jEFUWTiv8JlLT2JVud84Pv523EakcctA16PgLTOxGKf7cm5zgTw
