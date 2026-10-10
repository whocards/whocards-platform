import type {AppRouter} from '@whocards/api'
import {createTRPCClient, httpBatchLink} from '@trpc/client'
import type {GameClient, GamePlatform} from '@whocards/game/hooks'
import {PLAYER_TOKEN_HEADER} from '@whocards/game'

import type {TokenStore} from './token-store'

/** The game API for one game code; the player token rides in a header from the store. */
export const createGameApi = (code: string, tokens: TokenStore) => {
  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: '/api/trpc',
        headers: (): Record<string, string> => {
          const token = tokens.get(code)
          return token ? {[PLAYER_TOKEN_HEADER]: token} : {}
        },
      }),
    ],
  })

  const client: GameClient = {
    join: async (input) => {
      const {token, state} = await trpc.game.join.mutate(input)
      tokens.set(state.game.code, token)
      return state
    },
    state: () => trpc.game.state.query(),
    pair: (partnerCode) => trpc.game.round.pair.mutate({partnerCode}),
    turn: (action) => trpc.game.round.turn.mutate({action}),
    response: (input) => trpc.game.round.response.mutate(input),
    feedback: (input) => trpc.game.feedback.mutate(input),
  }

  return {
    client,
    me: () => trpc.game.me.get.query(),
    deleteResponse: (responseId: string) => trpc.game.me.deleteResponse.mutate({responseId}),
    screen: () => trpc.game.screen.query({code}),
  }
}

export type GameApi = ReturnType<typeof createGameApi>

export const browserPlatform: GamePlatform = {
  isForeground: () => document.visibilityState === 'visible',
  onForegroundChange: (callback) => {
    const listener = () => callback(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  },
}
