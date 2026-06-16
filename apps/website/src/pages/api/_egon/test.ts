export const prerender = false

import type {APIRoute} from 'astro'
import {createNewShippingOrder, egonCreateItems, getShippingProvider} from '~server/egon'
import type {CreateNewShippingOrder} from '~types/shipping'

const tests = [
  {
    shipping: {
      purchaseId: '88812345',
      name: 'NotEmma Brown',
      phone: '441612345678',
      email: 'emma.brown@example.com',
      address: '123 Baker Street',
      address2: '',
      city: 'London',
      country: 'GB',
      zip: 'NW1 6XE',
    },
    product: {quantity: 1},
  },
]

export const GET: APIRoute = async () => {
  const promises: any[] = []

  tests.forEach(async (test) => {
    const {shipping: dbShipping, product} = test

    const newShippingOrder: CreateNewShippingOrder = {
      // Static values
      payment_cod: 0,
      shop_setting_id: 1, // Example value; replace with the actual setting ID
      original_order_id: dbShipping.purchaseId,
      customer_name: dbShipping.name.split(' ')[0],
      customer_surname: dbShipping.name.split(' ')[1] || '',
      customer_phone: dbShipping.phone || '',
      customer_email: dbShipping.email,
      name: dbShipping.name.split(' ')[0],
      surname: dbShipping.name.split(' ')[1] || '',
      phone: dbShipping.phone || '',
      email: dbShipping.email,
      street: dbShipping.address + ' ' + dbShipping.address2,
      street_number: '',
      city: dbShipping.city,
      country: dbShipping.country,
      destination_country_code: dbShipping.country,
      postal_code: dbShipping.zip,
      id_delivery: getShippingProvider(dbShipping.country),
      id_payment: 3,
      items: egonCreateItems(product.quantity),
    }

    promises.push(
      createNewShippingOrder(newShippingOrder).then((r) => {
        console.log(dbShipping.country, r.data.response.resp_data.order_id)
      })
    )
  })

  await Promise.all(promises)

  return new Response('ok', {status: 200})
}
