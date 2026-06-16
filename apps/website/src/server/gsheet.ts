import {serialize} from 'object-to-formdata'
import {env} from '~env-secrets'

type ContactSheetEntry = Record<string, string | number | boolean | null | undefined>

type PurchaseSheetEntry = {
  id: string
  date: string
  name: string
  email: string
  price: number
  netPrice: number
  category: string
}

export const createContactSheetRow = async (data: ContactSheetEntry) =>
  fetch(env.CONTACTS_SHEET_URL, {
    method: 'POST',
    body: serialize({
      ...data,
      date: new Date().toISOString().split('.')[0],
    }),
  })

export const createPurchaseSheetRow = async (data: PurchaseSheetEntry) =>
  fetch(env.PURCHASE_SHEET_URL, {
    method: 'POST',
    body: serialize({
      id: data.id,
      date: data.date,
      name: data.name,
      email: data.email,
      price: data.price,
      netPrice: data.netPrice,
      category: data.category,
    }),
  }).then((res) => res.json())
