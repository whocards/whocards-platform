import {DEFAULT_LANGUAGE, LANGUAGE_CODES, languages} from '@whocards/decks'

import {createTRPCRouter, publicProcedure} from '../trpc'

export const poolRouter = createTRPCRouter({
  /** Language metadata for the Pool: the default, the codes, and display names. */
  languages: publicProcedure.query(() => ({
    default: DEFAULT_LANGUAGE,
    codes: LANGUAGE_CODES,
    names: languages,
  })),
})
