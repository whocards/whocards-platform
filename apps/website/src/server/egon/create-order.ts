import {env} from '~env-secrets'
import type {CreateNewShippingOrder} from '~types/shipping'

const EGON_API_URL = 'https://api.isklad.eu/rest/v1'
const SUCCESS_CODES = [201, 401, 402, 403]

export const createNewShippingOrder = async (newShippingOrder: CreateNewShippingOrder) => {
  const order = await fetch(EGON_API_URL, {
    method: 'POST',
    body: JSON.stringify({
      auth: {
        auth_id: env.EGON_AUTH_ID,
        auth_key: env.EGON_AUTH_KEY,
        auth_token: env.EGON_AUTH_TOKEN,
      },
      request: {
        req_method: 'CreateNewOrder',
        req_data: newShippingOrder,
      },
    }),
  }).then(async (r) => await r.json())

  if (!SUCCESS_CODES.includes(order.resp_code)) {
    return {
      ok: false,
      error: order,
    }
  }

  return {
    ok: true,
    data: order,
  }
}
