import {renderGameRecap} from '@whocards/emails'

import {db} from '../db'
import {decksRouter} from './routers/decks'
import {discussionAgentRouter} from './routers/discussion-agent'
import {createGamesRouter} from './routers/games'
import {sendRecapsWithResend} from './routers/games-mailer'
import {createDrizzleHostStore} from './routers/games-store'
import {peopleRouter} from './routers/people'
import {questionReviewRouter} from './routers/question-review'
import {createTRPCRouter} from './trpc'

export const appRouter = createTRPCRouter({
  people: peopleRouter,
  decks: decksRouter,
  questionReview: questionReviewRouter,
  discussionAgent: discussionAgentRouter,
  games: createGamesRouter({
    store: createDrizzleHostStore(db),
    sendRecaps: sendRecapsWithResend,
    renderRecap: renderGameRecap,
  }),
})

export type AppRouter = typeof appRouter
