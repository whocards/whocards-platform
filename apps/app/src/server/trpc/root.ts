import {peopleRouter} from './routers/people'
import {questionReviewRouter} from './routers/question-review'
import {createTRPCRouter} from './trpc'

export const appRouter = createTRPCRouter({
  people: peopleRouter,
  questionReview: questionReviewRouter,
})

export type AppRouter = typeof appRouter
