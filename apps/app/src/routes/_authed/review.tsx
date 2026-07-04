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
}: {
  question: QuestionData
  myVote: VariantSlug | undefined
  canApprove: boolean
}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [comment, setComment] = useState('')

  const invalidateQuestions = () =>
    queryClient.invalidateQueries({queryKey: ['questionReview.variants']})

  const vote = useMutation({
    mutationFn: (variant: VariantSlug) =>
      trpc.questionReview.vote.mutate({questionId: question.questionId, variant}),
    onSuccess: () => {
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
                  className="rounded-full bg-transparent px-3 py-1 text-xs text-gray-lighter underline"
                >
                  Approve this
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
            <button type="submit" className="rounded-full bg-gray-light px-3 py-1.5 text-sm">
              Send
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
