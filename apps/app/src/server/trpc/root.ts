import {discussionAgentRouter} from './routers/discussion-agent'
import {peopleRouter} from './routers/people'
import {questionReviewRouter} from './routers/question-review'
import {createTRPCRouter} from './trpc'

export const appRouter = createTRPCRouter({
  people: peopleRouter,
  questionReview: questionReviewRouter,
  discussionAgent: discussionAgentRouter,
})

export type AppRouter = typeof appRouter
