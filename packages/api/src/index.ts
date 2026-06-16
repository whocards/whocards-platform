import type {inferRouterInputs, inferRouterOutputs} from '@trpc/server'

import type {AppRouter} from './root'
import {appRouter} from './root'
import {createCallerFactory} from './trpc'

/** A server-side caller for in-process use (and tests). */
export const createCaller = createCallerFactory(appRouter)

export {appRouter}
export type {Context} from './trpc'
export type {AppRouter}

/** Inference helpers for end-to-end typed clients. */
export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>
