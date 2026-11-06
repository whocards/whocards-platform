import {renderGameRecap, renderGameRevisit} from '@whocards/emails'

import {agentEnabled} from '@whocards/env/app'

import {translateQuestions} from '../agent/anthropic'
import {auth} from '../auth/auth'
import {db} from '../db'
import {decksRouter} from './routers/decks'
import {discussionAgentRouter} from './routers/discussion-agent'
import {createGamesRouter} from './routers/games'
import {sendRecapsWithResend, sendRevisitsWithResend} from './routers/games-mailer'
import {createDrizzleHostStore} from './routers/games-store'
import {peopleRouter} from './routers/people'
import {questionReviewRouter} from './routers/question-review'
import {createTranslationRouter} from './routers/translation'
import {createTRPCRouter} from './trpc'

export const appRouter = createTRPCRouter({
  people: peopleRouter,
  decks: decksRouter,
  questionReview: questionReviewRouter,
  discussionAgent: discussionAgentRouter,
  translation: createTranslationRouter({
    translate: agentEnabled ? translateQuestions : null,
    sendLogin: async (email) => {
      await auth.api.signInMagicLink({body: {email, callbackURL: '/'}, headers: new Headers()})
    },
  }),
  games: createGamesRouter({
    store: createDrizzleHostStore(db),
    sendRecaps: sendRecapsWithResend,
    renderRecap: renderGameRecap,
    sendRevisits: sendRevisitsWithResend,
    renderRevisit: renderGameRevisit,
  }),
})

export type AppRouter = typeof appRouter
