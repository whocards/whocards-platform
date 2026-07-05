import {createFileRoute, redirect} from '@tanstack/react-router'

import {DECK_SLUG} from '~/server/trpc/routers/question-review-logic'

/**
 * /review became deck-centric on 2026-07-05 (founder feedback: decks +
 * status, questions grouped by act). Kept as a redirect — not deleted — for
 * anyone with this URL bookmarked or open on a phone right now. New entry
 * point: /decks (overview) -> /decks/$slug (detail, ex-/review content).
 */
export const Route = createFileRoute('/_authed/review')({
  beforeLoad: () => {
    throw redirect({to: '/decks/$slug', params: {slug: DECK_SLUG}})
  },
})
