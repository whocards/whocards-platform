import {env} from '~env-secrets'
import type {CreateNewShippingOrder} from '~types/shipping'

export const egonConstants = {
  shopId: env.EGON_SHOP_ID,
  paymentId: 3, // Paid online
  paymentCod: 0,
  name: 'egon',
} as const

export const egonCreateItems = (quantity: number): CreateNewShippingOrder['items'] => {
  const is12Deck = quantity % 12 === 0
  const count = is12Deck ? quantity / 12 : quantity

  return [
    {
      item_id: is12Deck ? env.EGON_ITEM_TWELVE_ID : env.EGON_ITEM_ONE_ID,
      name: is12Deck ? 'WhoCards 12 Decks' : 'WhoCards 1 Deck',
      count,
      price: count * (is12Deck ? env.EGON_ITEM_TWELVE_PRICE : env.EGON_ITEM_ONE_PRICE),
      tax: 0,
    },
  ]
}
