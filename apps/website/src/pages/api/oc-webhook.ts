export const prerender = false

import type {APIRoute} from 'astro'
import {serialize} from 'object-to-formdata'
import {products} from '~constants/products'
import {env} from '~env-secrets'
import {db, insertPurchaseSchema, insertUser, insertUserSchema, schema} from '~server/db'
import type {Contribution} from '~types/contributions'

const handledTypes = ['collective.transaction.created']

const exit = (status: number, reason: string) => {
  console.log(reason)
  console.log('=================')
  return new Response(reason, {status})
}

export const POST: APIRoute = async ({request}) => {
  // validate auth
  if (new URL(request.url).searchParams.get('auth_token') !== env.WEBHOOK_AUTH_TOKEN) {
    return new Response('Unauthorized', {status: 401})
  }

  const body = (await request.json()) as Contribution

  // validate and parse body
  if (!body.type) {
    return exit(400, 'NO BODY')
  }

  console.log('=================')
  console.log('handling webhook')
  console.log(body)

  if (!handledTypes.includes(body.type)) {
    console.log('SKIPPING TYPE', body.type)
    return new Response(`'SKIPPING TYPE', ${body.type}`, {status: 200})
  }

  // get contribution type
  const {description} = body.data.transaction
  const product = products.find((p) => description.includes(p.title))
  const contributionType = product?.title ?? description

  console.log('contributionType', contributionType)

  // let order: OrderWithEmail
  // try {
  //   // get new order id from legacy ID
  //   order = await graphQLClient.request<OrderWithEmail>(orderFromLegacyQuery, {
  //     id: body.data.transaction.OrderId,
  //   })
  //   if (!order) throw new Error('No order found')
  // } catch (e) {
  //   console.error('no order found', e)
  //   return exit(500, (e as Error).message)
  // }

  // console.log('order', order)
  const email = body.data.fromCollective.emails[0]

  // validate user exists
  const parseUser = insertUserSchema.parse({
    name: body.data.fromCollective.name,
    ocSlug: body.data.fromCollective.slug,
    email,
  })

  const dbUser = await insertUser(parseUser)

  const purchase = insertPurchaseSchema.parse({
    id: body.data.transaction.id,
    price: body.data.transaction.amountInHostCurrency,
    netPrice: body.data.transaction.netAmountInHostCurrency,
    date: new Date(body.data.transaction.createdAt),
    category: contributionType,
    userId: dbUser.id,
  })

  // add to DB and sheets
  const [dbEntry, sheetEntry] = await Promise.allSettled([
    db.insert(schema.purchases).values(purchase).returning(),
    fetch(env.PURCHASE_SHEET_URL, {
      method: 'POST',
      body: serialize({
        id: purchase.id,
        date: purchase.date.toISOString().split('T')[0],
        name: dbUser.name,
        email: dbUser.email,
        price: purchase.price / 100,
        netPrice: purchase.netPrice / 100,
        category: purchase.category,
      }),
    }).then((res) => res.json()),
  ])

  console.log({dbEntry, sheetEntry})

  console.log('=================')
  return new Response('success', {status: 200})
}
