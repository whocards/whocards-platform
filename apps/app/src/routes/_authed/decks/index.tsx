import {useQuery} from '@tanstack/react-query'
import {createFileRoute, Link, redirect} from '@tanstack/react-router'

import {trpc} from '~/lib/trpc'
import {roleAtLeast} from '~/server/auth/permissions'
import type {DeckStatus} from '~/server/trpc/routers/decks-logic'

export const Route = createFileRoute('/_authed/decks/')({
  beforeLoad: ({context}) => {
    if (!context.membership || !roleAtLeast(context.membership.role, 'reviewer')) {
      throw redirect({to: '/'})
    }
  },
  component: DecksOverview,
})

const STATUS_LABEL: Record<DeckStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  shipped: 'Shipped',
}

// Founder feedback: "Decks overview separated/grouped by status" — most
// actionable status first, so a reviewer opening this on a phone lands on
// what needs attention rather than scrolling past shipped/draft decks.
const STATUS_ORDER: readonly DeckStatus[] = ['in_review', 'draft', 'approved', 'shipped']

function DecksOverview() {
  const decks = useQuery({queryKey: ['decks.list'], queryFn: () => trpc.decks.list.query()})

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl font-bold md:text-2xl">Decks</h1>
        <p className="mt-1 text-sm text-gray-lighter">
          Question sets moving through review — open one to vote, comment, and approve.
        </p>
      </div>

      {decks.isLoading ? <p className="text-gray-lighter">Loading…</p> : null}
      {decks.isError ? <p className="text-red">{decks.error.message}</p> : null}
      {decks.data && decks.data.length === 0 ? (
        <p className="text-gray-lighter">No decks yet.</p>
      ) : null}

      {decks.data ? (
        <div className="flex flex-col gap-8">
          {STATUS_ORDER.map((status) => {
            const inStatus = decks.data.filter((deck) => deck.status === status)
            if (inStatus.length === 0) return null

            return (
              <section key={status}>
                <h2 className="mb-3 text-xs font-semibold text-gray-lighter uppercase">
                  {STATUS_LABEL[status]} <span className="text-gray-dark">({inStatus.length})</span>
                </h2>
                <div className="flex flex-col gap-3">
                  {inStatus.map((deck) => (
                    <Link
                      key={deck.slug}
                      to="/decks/$slug"
                      params={{slug: deck.slug}}
                      className="flex flex-col gap-1 rounded-2xl border border-gray-light/40 bg-gray-light/30 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{deck.title}</span>
                        <span className="shrink-0 text-xs text-gray-lighter">
                          {deck.approvedQuestions}/{deck.totalQuestions} approved
                        </span>
                      </div>
                      {deck.description ? (
                        <p className="text-sm text-gray-lighter">{deck.description}</p>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
