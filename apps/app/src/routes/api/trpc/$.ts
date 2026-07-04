import {createFileRoute} from '@tanstack/react-router'
import {fetchRequestHandler} from '@trpc/server/adapters/fetch'

import {createTRPCContext} from '~/server/trpc/context'
import {appRouter} from '~/server/trpc/root'

const handler = ({request}: {request: Request}) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: createTRPCContext,
  })

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
})
