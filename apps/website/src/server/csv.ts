import {serialize} from 'object-to-formdata'
import {env} from '~env-secrets'
import type {ShippingSelect} from './db'

const createSKU = (quantity: number) => (quantity === 12 ? 2 : 1)

const createQuantity = (quantity: number) => (quantity === 12 ? 1 : quantity)

const createCsv = (data: ShippingSelect) => {
  const csv = `Reference;Date;Name;Company;Street1;Street2;Zip Code;City;Region;Country;Email;Phone;SKU;Quantity;OrderTotalCost;Shippingoption
  ${data.purchaseId};${data.createdAt};${data.name};${data.company ?? ''};${data.address};${
    data.address2
  };${data.zip};${data.city};${data.region};${data.country};${data.email};${data.phone};${createSKU(
    data.quantity
  )};${createQuantity(data.quantity)}
  `

  return csv
}

export const createZenShipping = async (data: ShippingSelect) => {
  console.log('====================================')
  const csv = createCsv(data)
  console.log(csv)
  const csvBlob = new Blob([csv], {type: 'text/csv'})

  const formData = new FormData()
  formData.append('file', csvBlob)

  try {
    const response = await fetch(`${env.ZEN_API_URL}/orders/import`, {
      method: 'POST',
      headers: {
        Authorization: `ZF-API ${env.ZEN_API_KEY}`,
      },
      body: formData,
    }).then((res) => res.json())

    console.log(JSON.stringify(response, null, 2))

    console.log('====================================')

    return response
  } catch (error) {
    console.error(JSON.stringify(error, null, 2))
    console.log('====================================')
    return error
  }
}

export const createShippingSheetRow = async (data: ShippingSelect) =>
  fetch(env.SHIPPING_SHEET_URL, {
    method: 'POST',
    body: serialize({
      ...data,
      reference: data.purchaseId,
      date: data.createdAt.toISOString().split('.')[0],
      sku: createSKU(data.quantity),
      quantity: createQuantity(data.quantity),
    }),
  })
