import {serialize} from 'object-to-formdata'
import {env} from '~env-secrets'

type ContactSheetEntry = Record<string, string | number | boolean | null | undefined>

export const createContactSheetRow = async (data: ContactSheetEntry) =>
  fetch(env.CONTACTS_SHEET_URL, {
    method: 'POST',
    body: serialize({
      ...data,
      date: new Date().toISOString().split('.')[0],
    }),
  })
