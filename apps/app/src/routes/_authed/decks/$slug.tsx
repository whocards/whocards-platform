import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createFileRoute, Link, redirect} from '@tanstack/react-router'
import {useState} from 'react'

import {trpc} from '~/lib/trpc'
import {roleAtLeast} from '~/server/auth/permissions'
import {groupByAct, isDeckStatus, nextStatusOptions} from '~/server/trpc/routers/decks-logic'
import type {DeckStatus} from '~/server/trpc/routers/decks-logic'

type QuestionData = Awaited<
  ReturnType<(typeof trpc)['questionReview']['variants']['query']>
>[number]

export const Route = createFileRoute('/_authed/decks/$slug')({
  beforeLoad: ({context}) => {
    if (!context.membership || !roleAtLeast(context.membership.role, 'reviewer')) {
      throw redirect({to: '/'})
    }
    return {canApprove: roleAtLeast(context.membership.role, 'facilitator')}
  },
  component: DeckDetail,
})

const STATUS_LABEL: Record<DeckStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  shipped: 'Shipped',
}

function DeckDetail() {
  const {slug} = Route.useParams()
  const {canApprove} = Route.useRouteContext()
  const queryClient = useQueryClient()

  const deckMeta = useQuery({
    queryKey: ['decks.get', slug],
    queryFn: () => trpc.decks.get.query({slug}),
  })
  const questions = useQuery({
    queryKey: ['questionReview.variants', slug],
    queryFn: () => trpc.questionReview.variants.query({deckSlug: slug}),
  })
  const myVotes = useQuery({
    queryKey: ['questionReview.myVotes', slug],
    queryFn: () => trpc.questionReview.myVotes.query({deckSlug: slug}),
  })
  // Slice 5 (stretch): only facilitator+ can reach this procedure at all, and
  // it degrades to `{enabled: false}` (never a crash) when ANTHROPIC_API_KEY
  // is absent — see server/env.ts / server/agent/anthropic.ts.
  const agentStatus = useQuery({
    queryKey: ['discussionAgent.status'],
    queryFn: () => trpc.discussionAgent.status.query(),
    enabled: canApprove,
  })
  const [showDiff, setShowDiff] = useState(false)
  const diff = useQuery({
    queryKey: ['questionReview.emitDiff', slug],
    queryFn: () => trpc.questionReview.emitDiff.query(),
    enabled: showDiff && Boolean(deckMeta.data?.canEmitDiff),
  })
  const [showAddQuestion, setShowAddQuestion] = useState(false)

  const updateStatus = useMutation({
    mutationFn: (status: DeckStatus) => trpc.decks.updateStatus.mutate({slug, status}),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['decks.get', slug]}),
  })

  const approvedCount = questions.data?.filter((q) => q.review?.status === 'approved').length ?? 0
  const groups = groupByAct(questions.data ?? [])

  if (deckMeta.isError) {
    return (
      <div className="mx-auto max-w-3xl p-4 text-center md:p-6">
        <p className="text-lg font-semibold">Couldn&apos;t load that deck.</p>
        <p className="mt-1 text-sm text-gray-lighter">{deckMeta.error.message}</p>
        <Link to="/decks" className="mt-3 inline-block text-yellow-400 underline">
          ← Back to Decks
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <Link to="/decks" className="text-xs text-gray-lighter underline">
        ← All decks
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4 md:mb-8">
        <div className="min-w-0">
          <h1 className="text-xl font-bold md:text-2xl">{deckMeta.data?.title ?? 'Loading…'}</h1>
          {deckMeta.data?.description ? (
            <p className="mt-1 max-w-2xl text-sm text-gray-lighter">{deckMeta.data.description}</p>
          ) : null}
          <p className="mt-2 text-sm text-gray-lighter">
            {approvedCount}/{questions.data?.length ?? 0} questions approved
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2">
          {deckMeta.data ? (
            <Link
              to="/facilitate"
              search={{deck: slug}}
              className="flex min-h-11 items-center justify-center rounded-full bg-yellow-400 px-4 text-sm font-bold text-darker"
            >
              Facilitate this deck
            </Link>
          ) : null}
          {deckMeta.data && canApprove ? (
            <select
              value={deckMeta.data.status}
              onChange={(event) => {
                // The <option> values are always nextStatusOptions(...) below, so this
                // is only false if the DOM value is tampered with — bail rather than cast.
                const {value} = event.target
                if (isDeckStatus(value)) updateStatus.mutate(value)
              }}
              disabled={updateStatus.isPending}
              className="min-h-11 rounded-full bg-gray-light px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {nextStatusOptions(deckMeta.data.status).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          ) : deckMeta.data ? (
            <span className="flex min-h-11 items-center justify-center rounded-full bg-gray-light px-4 text-sm font-semibold">
              {STATUS_LABEL[deckMeta.data.status]}
            </span>
          ) : null}
          {updateStatus.isError ? (
            <p className="text-sm text-red">{updateStatus.error.message}</p>
          ) : null}

          {deckMeta.data?.canEmitDiff && canApprove ? (
            <button
              type="button"
              onClick={() => setShowDiff((v) => !v)}
              className="min-h-11 rounded-full bg-gray-light px-4 text-sm font-semibold"
            >
              {showDiff ? 'Hide' : 'Generate'} diff
            </button>
          ) : null}
        </div>
      </div>

      {showDiff && diff.data ? (
        <div className="mb-8 rounded-2xl bg-darker p-4">
          <p className="mb-2 text-sm text-gray-lighter">
            Unified diff against packages/decks/src/decks/ai-at-work.questions.json — apply by hand
            (or paste into a PR); this app never writes to git directly.
          </p>
          <pre className="max-h-96 overflow-auto text-xs whitespace-pre-wrap">
            {diff.data.patch}
          </pre>
        </div>
      ) : null}

      {canApprove ? (
        <div className="mb-8">
          <button
            type="button"
            onClick={() => setShowAddQuestion((v) => !v)}
            className="flex min-h-11 items-center justify-center rounded-full bg-gray-light px-4 text-sm font-semibold"
          >
            {showAddQuestion ? 'Cancel' : '+ Add question'}
          </button>
          {showAddQuestion ? (
            <AddQuestionForm
              deckSlug={slug}
              defaultActLabel={groups.at(-1)?.actLabel ?? ''}
              onDone={() => {
                setShowAddQuestion(false)
                void queryClient.invalidateQueries({queryKey: ['questionReview.variants', slug]})
              }}
            />
          ) : null}
        </div>
      ) : null}

      {questions.isLoading ? <p className="text-gray-lighter">Loading…</p> : null}
      {questions.data && questions.data.length === 0 ? (
        <p className="text-gray-lighter">No questions in this deck yet.</p>
      ) : null}

      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <section key={group.actLabel}>
            <h2 className="mb-4 border-b border-gray-light/40 pb-2 text-sm font-semibold text-gray-lighter">
              {group.actLabel}
            </h2>
            <div className="flex flex-col gap-4">
              {group.items.map((question) => (
                <QuestionCard
                  key={question.questionId}
                  deckSlug={slug}
                  question={question}
                  myVote={myVotes.data?.[question.questionId]}
                  canApprove={canApprove}
                  agentEnabled={agentStatus.data?.enabled ?? false}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function AddQuestionForm({
  deckSlug,
  defaultActLabel,
  onDone,
}: {
  deckSlug: string
  defaultActLabel: string
  onDone: () => void
}) {
  const [actLabel, setActLabel] = useState(defaultActLabel)
  const [text, setText] = useState('')

  const addQuestion = useMutation({
    mutationFn: () => trpc.decks.addQuestion.mutate({deckSlug, actLabel, text}),
    onSuccess: () => {
      setText('')
      onDone()
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim() && actLabel.trim()) addQuestion.mutate()
      }}
      className="mt-3 flex flex-col gap-3 rounded-2xl bg-gray-light/30 p-4"
    >
      <label className="flex flex-col gap-1 text-sm text-gray-lighter">
        Section (act)
        <input
          value={actLabel}
          onChange={(event) => setActLabel(event.target.value)}
          placeholder="e.g. Act 2 — Map the work"
          required
          className="min-h-11 rounded-xl bg-darker px-4 text-white placeholder:text-gray-dark"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-lighter">
        Question text
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What do you want to ask?"
          required
          rows={3}
          className="rounded-xl bg-darker p-4 text-white placeholder:text-gray-dark"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={addQuestion.isPending || !text.trim() || !actLabel.trim()}
          className="flex min-h-11 items-center justify-center rounded-full bg-yellow-400 px-4 font-bold text-darker disabled:opacity-60"
        >
          {addQuestion.isPending ? 'Adding…' : 'Add question'}
        </button>
        {addQuestion.isError ? (
          <p className="text-sm text-red">{addQuestion.error.message}</p>
        ) : null}
      </div>
    </form>
  )
}

function QuestionCard({
  deckSlug,
  question,
  myVote,
  canApprove,
  agentEnabled,
}: {
  deckSlug: string
  question: QuestionData
  myVote: string | undefined
  canApprove: boolean
  agentEnabled: boolean
}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [comment, setComment] = useState('')
  const [agentExpanded, setAgentExpanded] = useState(false)
  const [agentDraft, setAgentDraft] = useState('')
  const questionText = question.review?.currentText ?? question.shippedText

  const variantsKey = ['questionReview.variants', deckSlug]
  const myVotesKey = ['questionReview.myVotes', deckSlug]

  const invalidateQuestions = () => queryClient.invalidateQueries({queryKey: variantsKey})

  const vote = useMutation({
    mutationFn: (variant: string) =>
      trpc.questionReview.vote.mutate({deckSlug, questionId: question.questionId, variant}),
    // Optimistic: reflect the vote instantly so a slow serverless round-trip
    // never feels like a dead tap; reconcile (or roll back) once it settles.
    onMutate: async (variant) => {
      await queryClient.cancelQueries({queryKey: variantsKey})
      await queryClient.cancelQueries({queryKey: myVotesKey})
      const prevVariants = queryClient.getQueryData<QuestionData[]>(variantsKey)
      const prevVotes = queryClient.getQueryData<Record<string, string>>(myVotesKey)
      const previous = prevVotes?.[question.questionId]
      queryClient.setQueryData<Record<string, string>>(myVotesKey, (old) => ({
        ...old,
        [question.questionId]: variant,
      }))
      queryClient.setQueryData<QuestionData[]>(variantsKey, (old) =>
        old?.map((q) => {
          if (q.questionId !== question.questionId) return q
          const voteTally = {...q.voteTally}
          if (previous && previous !== variant) {
            voteTally[previous] = Math.max(0, (voteTally[previous] ?? 0) - 1)
          }
          if (previous !== variant) {
            voteTally[variant] = (voteTally[variant] ?? 0) + 1
          }
          return {...q, voteTally}
        })
      )
      return {prevVariants, prevVotes}
    },
    onError: (_error, _variant, context) => {
      if (context?.prevVariants) {
        queryClient.setQueryData(variantsKey, context.prevVariants)
      }
      if (context?.prevVotes) {
        queryClient.setQueryData(myVotesKey, context.prevVotes)
      }
    },
    onSettled: () => {
      void invalidateQuestions()
      void queryClient.invalidateQueries({queryKey: myVotesKey})
    },
  })

  const approve = useMutation({
    mutationFn: (text: string) =>
      trpc.questionReview.approve.mutate({deckSlug, questionId: question.questionId, text}),
    onSuccess: invalidateQuestions,
  })

  const comments = useQuery({
    queryKey: ['questionReview.comments', deckSlug, question.questionId],
    queryFn: () =>
      trpc.questionReview.comments.list.query({deckSlug, questionId: question.questionId}),
    enabled: expanded,
  })

  const addComment = useMutation({
    mutationFn: () =>
      trpc.questionReview.comments.add.mutate({
        deckSlug,
        questionId: question.questionId,
        body: comment,
      }),
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({
        queryKey: ['questionReview.comments', deckSlug, question.questionId],
      })
    },
  })

  const agentMessages = useQuery({
    queryKey: ['discussionAgent.messages', deckSlug, question.questionId],
    queryFn: () =>
      trpc.discussionAgent.messages.list.query({deckSlug, questionId: question.questionId}),
    enabled: agentExpanded && agentEnabled,
  })

  const sendToAgent = useMutation({
    mutationFn: () =>
      trpc.discussionAgent.messages.send.mutate({
        deckSlug,
        questionId: question.questionId,
        questionText,
        content: agentDraft,
      }),
    onSuccess: () => {
      setAgentDraft('')
      void queryClient.invalidateQueries({
        queryKey: ['discussionAgent.messages', deckSlug, question.questionId],
      })
    },
  })

  const statusColor =
    question.review?.status === 'approved' ? 'text-yellow-400' : 'text-gray-lighter'

  return (
    <div className="rounded-2xl bg-gray-light/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase ${statusColor}`}>
          {question.review?.status ?? 'draft'}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(question.variants).map(([slug, text]) => (
          <div
            key={slug}
            className={`flex flex-col gap-3 rounded-xl p-4 ${
              question.review?.currentText === text ? 'bg-yellow-400/10' : 'bg-darker/40'
            }`}
          >
            <div>
              {slug !== 'current' ? <p className="mb-1 text-xs text-gray-dark">{slug}</p> : null}
              <p className="text-base">{text}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => vote.mutate(slug)}
                className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold ${
                  myVote === slug ? 'bg-yellow-400 text-darker' : 'bg-gray-light text-white'
                }`}
              >
                Vote {question.voteTally[slug] ? `(${question.voteTally[slug]})` : ''}
              </button>
              {canApprove ? (
                <button
                  type="button"
                  onClick={() => approve.mutate(text)}
                  disabled={approve.isPending}
                  className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60 ${
                    question.review?.currentText === text
                      ? 'bg-yellow-400 text-darker'
                      : 'bg-darker text-gray-lighter'
                  }`}
                >
                  {approve.isPending
                    ? 'Approving…'
                    : question.review?.currentText === text
                      ? '✓ Approved'
                      : 'Approve'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex min-h-11 items-center text-sm text-gray-lighter underline"
      >
        {expanded
          ? 'Hide comments'
          : `Comments${comments.data?.length ? ` (${comments.data.length})` : ''}`}
      </button>

      {expanded ? (
        <div className="mt-1 flex flex-col gap-2 border-t border-gray-light/40 pt-3">
          {comments.data?.map((c) => (
            <p key={c.id} className="text-sm">
              <span className="text-gray-lighter">{c.authorEmail}:</span> {c.body}
            </p>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (comment.trim()) addComment.mutate()
            }}
            className="flex gap-2"
          >
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a comment…"
              className="min-h-11 flex-1 rounded-full bg-darker px-4 text-sm text-white"
            />
            <button
              type="submit"
              disabled={addComment.isPending || !comment.trim()}
              className="min-h-11 rounded-full bg-gray-light px-4 text-sm disabled:opacity-60"
            >
              {addComment.isPending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </div>
      ) : null}

      {canApprove ? (
        <>
          <button
            type="button"
            onClick={() => setAgentExpanded((v) => !v)}
            className="mt-3 flex min-h-11 items-center text-sm text-gray-lighter underline"
          >
            {agentExpanded ? 'Hide agent' : 'Discuss with agent'}
          </button>
          {agentExpanded ? (
            <div className="mt-1 flex flex-col gap-2 border-t border-gray-light/40 pt-3">
              {agentEnabled ? (
                <>
                  {agentMessages.data?.map((m) => (
                    <p key={m.id} className="text-sm">
                      <span className="text-gray-lighter">
                        {m.role === 'user' ? 'You' : 'Agent'}:
                      </span>{' '}
                      {m.content}
                    </p>
                  ))}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (agentDraft.trim()) sendToAgent.mutate()
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={agentDraft}
                      onChange={(event) => setAgentDraft(event.target.value)}
                      placeholder="Ask the agent about this question…"
                      className="min-h-11 flex-1 rounded-full bg-darker px-4 text-sm text-white"
                    />
                    <button
                      type="submit"
                      disabled={sendToAgent.isPending}
                      className="min-h-11 rounded-full bg-gray-light px-4 text-sm disabled:opacity-60"
                    >
                      {sendToAgent.isPending ? 'Thinking…' : 'Send'}
                    </button>
                  </form>
                </>
              ) : (
                <p className="text-sm text-gray-lighter">
                  Ask an admin to set <code className="text-xs">ANTHROPIC_API_KEY</code> to enable
                  this.
                </p>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
