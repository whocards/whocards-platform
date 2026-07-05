import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createFileRoute, redirect} from '@tanstack/react-router'
import {useState} from 'react'

import {trpc} from '~/lib/trpc'
import {roleAtLeast} from '~/server/auth/permissions'
import type {VariantSlug} from '~/server/trpc/routers/question-review'

type QuestionData = Awaited<
  ReturnType<(typeof trpc)['questionReview']['variants']['query']>
>[number]

export const Route = createFileRoute('/_authed/review')({
  beforeLoad: ({context}) => {
    if (!context.membership || !roleAtLeast(context.membership.role, 'reviewer')) {
      throw redirect({to: '/'})
    }
    return {canApprove: roleAtLeast(context.membership.role, 'facilitator')}
  },
  component: Review,
})

function Review() {
  const {canApprove} = Route.useRouteContext()
  const questions = useQuery({
    queryKey: ['questionReview.variants'],
    queryFn: () => trpc.questionReview.variants.query(),
  })
  const myVotes = useQuery({
    queryKey: ['questionReview.myVotes'],
    queryFn: () => trpc.questionReview.myVotes.query(),
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
    queryKey: ['questionReview.emitDiff'],
    queryFn: () => trpc.questionReview.emitDiff.query(),
    enabled: showDiff,
  })

  const approvedCount = questions.data?.filter((q) => q.review?.status === 'approved').length ?? 0

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">AI Check-In — question review</h1>
          <p className="text-sm text-gray-lighter">
            {approvedCount}/{questions.data?.length ?? 37} questions approved
          </p>
          <p className="mt-1 text-xs text-gray-dark">
            Tap a wording to vote for it
            {canApprove
              ? '; tap Approve to lock the version to ship.'
              : '. A facilitator locks the final version.'}
          </p>
        </div>
        {canApprove ? (
          <button
            type="button"
            onClick={() => setShowDiff((v) => !v)}
            className="rounded-full bg-gray-light px-4 py-2 text-sm font-semibold"
          >
            {showDiff ? 'Hide' : 'Generate'} diff
          </button>
        ) : null}
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

      {questions.isLoading ? <p className="text-gray-lighter">Loading…</p> : null}

      <div className="flex flex-col gap-4">
        {questions.data?.map((question) => (
          <QuestionCard
            key={question.questionId}
            question={question}
            myVote={myVotes.data?.[question.questionId]}
            canApprove={canApprove}
            agentEnabled={agentStatus.data?.enabled ?? false}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionCard({
  question,
  myVote,
  canApprove,
  agentEnabled,
}: {
  question: QuestionData
  myVote: VariantSlug | undefined
  canApprove: boolean
  agentEnabled: boolean
}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [comment, setComment] = useState('')
  const [agentExpanded, setAgentExpanded] = useState(false)
  const [agentDraft, setAgentDraft] = useState('')
  const questionText = question.review?.currentText ?? question.shippedText

  const invalidateQuestions = () =>
    queryClient.invalidateQueries({queryKey: ['questionReview.variants']})

  const vote = useMutation({
    mutationFn: (variant: VariantSlug) =>
      trpc.questionReview.vote.mutate({questionId: question.questionId, variant}),
    // Optimistic: reflect the vote instantly so a slow serverless round-trip
    // never feels like a dead tap; reconcile (or roll back) once it settles.
    onMutate: async (variant) => {
      await queryClient.cancelQueries({queryKey: ['questionReview.variants']})
      await queryClient.cancelQueries({queryKey: ['questionReview.myVotes']})
      const prevVariants = queryClient.getQueryData<QuestionData[]>(['questionReview.variants'])
      const prevVotes = queryClient.getQueryData<Record<string, VariantSlug>>([
        'questionReview.myVotes',
      ])
      const previous = prevVotes?.[question.questionId]
      queryClient.setQueryData<Record<string, VariantSlug>>(['questionReview.myVotes'], (old) => ({
        ...old,
        [question.questionId]: variant,
      }))
      queryClient.setQueryData<QuestionData[]>(['questionReview.variants'], (old) =>
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
        queryClient.setQueryData(['questionReview.variants'], context.prevVariants)
      }
      if (context?.prevVotes) {
        queryClient.setQueryData(['questionReview.myVotes'], context.prevVotes)
      }
    },
    onSettled: () => {
      invalidateQuestions()
      queryClient.invalidateQueries({queryKey: ['questionReview.myVotes']})
    },
  })

  const approve = useMutation({
    mutationFn: (text: string) =>
      trpc.questionReview.approve.mutate({questionId: question.questionId, text}),
    onSuccess: invalidateQuestions,
  })

  const comments = useQuery({
    queryKey: ['questionReview.comments', question.questionId],
    queryFn: () => trpc.questionReview.comments.list.query({questionId: question.questionId}),
    enabled: expanded,
  })

  const addComment = useMutation({
    mutationFn: () =>
      trpc.questionReview.comments.add.mutate({questionId: question.questionId, body: comment}),
    onSuccess: () => {
      setComment('')
      queryClient.invalidateQueries({queryKey: ['questionReview.comments', question.questionId]})
    },
  })

  const agentMessages = useQuery({
    queryKey: ['discussionAgent.messages', question.questionId],
    queryFn: () => trpc.discussionAgent.messages.list.query({questionId: question.questionId}),
    enabled: agentExpanded && agentEnabled,
  })

  const sendToAgent = useMutation({
    mutationFn: () =>
      trpc.discussionAgent.messages.send.mutate({
        questionId: question.questionId,
        questionText,
        content: agentDraft,
      }),
    onSuccess: () => {
      setAgentDraft('')
      queryClient.invalidateQueries({queryKey: ['discussionAgent.messages', question.questionId]})
    },
  })

  const statusColor =
    question.review?.status === 'approved' ? 'text-yellow-400' : 'text-gray-lighter'

  return (
    <div className="rounded-2xl bg-gray-light/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-lighter">{question.actLabel}</span>
        <span className={`text-xs font-semibold uppercase ${statusColor}`}>
          {question.review?.status ?? 'draft'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {(Object.entries(question.variants) as [VariantSlug, string][]).map(([slug, text]) => (
          <div
            key={slug}
            className={`flex items-start justify-between gap-3 rounded-xl p-3 ${
              question.review?.currentText === text ? 'bg-yellow-400/10' : 'bg-darker/40'
            }`}
          >
            <div>
              <p className="text-xs text-gray-dark">{slug}</p>
              <p>{text}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => vote.mutate(slug)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
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
                  className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-60 ${
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
        className="mt-2 text-xs text-gray-lighter underline"
      >
        {expanded ? 'Hide comments' : 'Comments'}
      </button>

      {expanded ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-gray-light/40 pt-2">
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
              className="flex-1 rounded-full bg-darker px-3 py-1.5 text-sm text-white"
            />
            <button
              type="submit"
              disabled={addComment.isPending || !comment.trim()}
              className="rounded-full bg-gray-light px-3 py-1.5 text-sm disabled:opacity-60"
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
            className="mt-2 ml-3 text-xs text-gray-lighter underline"
          >
            {agentExpanded ? 'Hide agent' : 'Discuss with agent'}
          </button>
          {agentExpanded ? (
            <div className="mt-2 flex flex-col gap-2 border-t border-gray-light/40 pt-2">
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
                      className="flex-1 rounded-full bg-darker px-3 py-1.5 text-sm text-white"
                    />
                    <button
                      type="submit"
                      disabled={sendToAgent.isPending}
                      className="rounded-full bg-gray-light px-3 py-1.5 text-sm disabled:opacity-60"
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
