import {useQuery} from '@tanstack/react-query'
import {createFileRoute, Link, redirect} from '@tanstack/react-router'

import {DECK_STATUS} from '~/components/deck-status'
import {Empty, ErrorText, Page, PageHeader, SectionTitle} from '~/components/page'
import {Progress} from '~/components/ui/progress'
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

// Founder feedback: "Decks overview separated/grouped by status" — most
// actionable status first, so a reviewer opening this on a phone lands on
// what needs attention rather than scrolling past shipped/draft decks.
const STATUS_ORDER: readonly DeckStatus[] = ['in_review', 'draft', 'approved', 'shipped']

function DecksOverview() {
  const decks = useQuery({queryKey: ['decks.list'], queryFn: () => trpc.decks.list.query()})

  return (
    <Page>
      <PageHeader
        title="Decks"
        description="Question sets moving through review — open one to vote, comment, and approve."
      />

      {decks.isLoading ? <p className="text-gray-dark">Loading…</p> : null}
      {decks.isError ? <ErrorText>{decks.error.message}</ErrorText> : null}
      {decks.data?.length === 0 ? <Empty>No decks yet.</Empty> : null}

      {decks.data ? (
        <div className="flex flex-col gap-10">
          {STATUS_ORDER.map((status) => {
            const inStatus = decks.data.filter((deck) => deck.status === status)
            if (inStatus.length === 0) return null

            return (
              <section key={status}>
                <SectionTitle
                  aside={<span className="text-sm text-gray-dark">{inStatus.length}</span>}
                >
                  {DECK_STATUS[status].label}
                </SectionTitle>
                <ul className="flex flex-col gap-3">
                  {inStatus.map((deck) => (
                    <li key={deck.slug}>
                      <Link
                        to="/decks/$slug"
                        params={{slug: deck.slug}}
                        className="group flex items-center gap-4 rounded-2.5xl border border-white/8 bg-white/[0.035] px-5 py-4 transition-colors hover:border-yellow-400/40 hover:bg-white/[0.06]"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className="font-semibold">{deck.title}</p>
                          {deck.description ? (
                            <p className="line-clamp-2 text-sm text-gray-lighter">
                              {deck.description}
                            </p>
                          ) : null}
                          <div className="mt-2 flex items-center gap-3">
                            <Progress
                              value={deck.approvedQuestions}
                              max={deck.totalQuestions}
                              aria-label={`${deck.title} questions approved`}
                              className="max-w-48 flex-1"
                            />
                            <span className="shrink-0 text-xs text-gray-dark">
                              {`${deck.approvedQuestions}/${deck.totalQuestions} approved`}
                            </span>
                          </div>
                        </div>
                        <span className="text-gray-dark transition-transform group-hover:translate-x-0.5 group-hover:text-yellow-400">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      ) : null}
    </Page>
  )
}
