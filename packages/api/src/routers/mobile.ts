import {buildAppStoreUrl, buildPlayStoreUrl} from '@whocards/app-store'

import {createTRPCRouter, publicProcedure} from '../trpc'

const utm = {source: 'app', medium: 'version_gate'}

export const mobileRouter = createTRPCRouter({
  /** The lowest app version allowed to run (null: no gate), and where to update. */
  compatibility: publicProcedure.query(({ctx}) => ({
    minVersion: ctx.mobileMinVersion,
    storeUrl: {ios: buildAppStoreUrl(utm), android: buildPlayStoreUrl(utm)},
  })),
})
