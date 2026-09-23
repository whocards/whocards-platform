import {decksRouter} from './routers/decks'
import {discussionAgentRouter} from './routers/discussion-agent'
import {facilitateRouter} from './routers/facilitate'
import {peopleRouter} from './routers/people'
import {questionReviewRouter} from './routers/question-review'
import {createTRPCRouter} from './trpc'

export const appRouter = createTRPCRouter({
  people: peopleRouter,
  decks: decksRouter,
  questionReview: questionReviewRouter,
  discussionAgent: discussionAgentRouter,
  facilitate: facilitateRouter,
})

export type AppRouter = typeof appRouter
