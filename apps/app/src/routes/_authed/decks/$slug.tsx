import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createFileRoute, redirect} from '@tanstack/react-router'
import {useState} from 'react'

import {DECK_STATUS} from '~/components/deck-status'
import {Empty, ErrorText, Page, PageHeader, SectionTitle} from '~/components/page'
import {Badge} from '~/components/ui/badge'
import {Button} from '~/components/ui/button'
import {Card} from '~/components/ui/card'
import {Input, Label, Select, Textarea} from '~/components/ui/field'
import {Progress} from '~/components/ui/progress'
import {cn} from '~/lib/cn'
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

const REVIEW_TONE: Partial<Record<string, 'good' | 'accent' | 'muted'>> = {
  approved: 'good',
  in_review: 'accent',
  rejected: 'muted',
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
      <Page>
        <PageHeader back={{to: '/decks', label: 'All decks'}} title="Couldn’t load that deck" />
        <ErrorText>{deckMeta.error.message}</ErrorText>
      </Page>
    )
  }

  const total = questions.data?.length ?? 0
  const status = deckMeta.data ? DECK_STATUS[deckMeta.data.status] : null

  return (
    <Page>
      <PageHeader
        back={{to: '/decks', label: 'All decks'}}
        eyebrow={status && !canApprove ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        title={deckMeta.data?.title ?? 'Loading…'}
        description={deckMeta.data?.description}
        actions={
          canApprove ? (
            <>
              {deckMeta.data ? (
                <Select
                  aria-label="Deck status"
                  value={deckMeta.data.status}
                  onChange={(event) => {
                    // The <option> values are always nextStatusOptions(...) below, so this
                    // is only false if the DOM value is tampered with — bail rather than cast.
                    const {value} = event.target
                    if (isDeckStatus(value)) updateStatus.mutate(value)
                  }}
                  disabled={updateStatus.isPending}
                  className="w-auto"
                >
                  {nextStatusOptions(deckMeta.data.status).map((option) => (
                    <option key={option} value={option}>
                      {DECK_STATUS[option].label}
                    </option>
                  ))}
                </Select>
              ) : null}
              {deckMeta.data?.canEmitDiff ? (
                <Button onClick={() => setShowDiff((v) => !v)}>
                  {showDiff ? 'Hide diff' : 'Generate diff'}
                </Button>
              ) : null}
              <Button
                variant={showAddQuestion ? 'ghost' : 'primary'}
                onClick={() => setShowAddQuestion((v) => !v)}
              >
                {showAddQuestion ? 'Cancel' : '+ Add question'}
              </Button>
            </>
          ) : null
        }
      >
        {questions.data ? (
          <div className="flex items-center gap-3">
            <Progress
              value={approvedCount}
              max={total}
              aria-label="Questions approved"
              className="max-w-xs flex-1"
            />
            <span className="shrink-0 text-sm text-gray-lighter">
              {`${approvedCount}/${total} questions approved`}
            </span>
          </div>
        ) : null}
      </PageHeader>

      {updateStatus.isError ? (
        <ErrorText className="mb-4">{updateStatus.error.message}</ErrorText>
      ) : null}

      {showDiff && diff.data ? (
        <Card className="mb-8">
          <p className="mb-3 text-sm text-gray-lighter">
            Unified diff against packages/decks/src/decks/ai-at-work.questions.json — apply by hand
            (or paste into a PR); this app never writes to git directly.
          </p>
          <pre className="max-h-96 overflow-auto rounded-xl bg-darkest/60 p-4 text-xs whitespace-pre-wrap">
            {diff.data.patch}
          </pre>
        </Card>
      ) : null}

      {canApprove && showAddQuestion ? (
        <AddQuestionForm
          deckSlug={slug}
          defaultActLabel={groups.at(-1)?.actLabel ?? ''}
          onDone={() => {
            setShowAddQuestion(false)
            void queryClient.invalidateQueries({queryKey: ['questionReview.variants', slug]})
          }}
        />
      ) : null}

      {questions.isLoading ? <p className="text-gray-dark">Loading…</p> : null}
      {questions.data?.length === 0 ? <Empty>No questions in this deck yet.</Empty> : null}

      <div className="flex flex-col gap-10">
        {groups.map((group) => (
          <section key={group.actLabel}>
            <SectionTitle
              aside={<span className="shrink-0 text-sm text-gray-dark">{group.items.length}</span>}
            >
              {group.actLabel}
            </SectionTitle>
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
    </Page>
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
    <Card className="mb-10 border-yellow-400/30">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim() && actLabel.trim()) addQuestion.mutate()
        }}
        className="flex flex-col gap-4"
      >
        <Label label="Section (act)">
          <Input
            value={actLabel}
            onChange={(event) => setActLabel(event.target.value)}
            placeholder="e.g. Act 2 — Map the work"
            required
          />
        </Label>
        <Label label="Question text">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="What do you want to ask?"
            required
            rows={3}
          />
        </Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={addQuestion.isPending || !text.trim() || !actLabel.trim()}
          >
            {addQuestion.isPending ? 'Adding…' : 'Add question'}
          </Button>
          {addQuestion.isError ? <ErrorText>{addQuestion.error.message}</ErrorText> : null}
        </div>
      </form>
    </Card>
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

  const reviewStatus = question.review?.status ?? 'draft'

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Badge tone={REVIEW_TONE[reviewStatus] ?? 'neutral'} className="capitalize">
          {reviewStatus.replace('_', ' ')}
        </Badge>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(question.variants).map(([slug, text]) => {
          const isCurrent = question.review?.currentText === text
          return (
            <div
              key={slug}
              className={cn(
                'flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center',
                isCurrent
                  ? 'border-yellow-400/40 bg-yellow-400/[0.06]'
                  : 'border-white/8 bg-darkest/40'
              )}
            >
              <div className="min-w-0 flex-1">
                {slug === 'current' ? null : (
                  <p className="mb-1.5 text-xs font-semibold tracking-wide text-gray-dark uppercase">
                    {slug}
                  </p>
                )}
                <p className="text-base leading-relaxed text-pretty md:text-lg">{text}</p>
              </div>
              <div className="flex gap-2 sm:shrink-0">
                <Button
                  variant={myVote === slug ? 'selected' : 'secondary'}
                  aria-pressed={myVote === slug}
                  onClick={() => vote.mutate(slug)}
                  className="flex-1 sm:w-28 sm:flex-none"
                >
                  Vote {question.voteTally[slug] ? `(${question.voteTally[slug]})` : ''}
                </Button>
                {canApprove ? (
                  <Button
                    variant={isCurrent ? 'primary' : 'accent'}
                    onClick={() => approve.mutate(text)}
                    disabled={approve.isPending}
                    className="flex-1 sm:w-32 sm:flex-none"
                  >
                    {approve.isPending ? 'Approving…' : isCurrent ? '✓ Approved' : 'Approve'}
                  </Button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-1 border-t border-white/8 pt-2">
        <Button
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="px-3"
        >
          {expanded
            ? 'Hide comments'
            : `Comments${comments.data?.length ? ` (${comments.data.length})` : ''}`}
        </Button>
        {canApprove ? (
          <Button
            variant="ghost"
            aria-expanded={agentExpanded}
            onClick={() => setAgentExpanded((v) => !v)}
            className="px-3"
          >
            {agentExpanded ? 'Hide agent' : 'Discuss with agent'}
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-2 flex flex-col gap-3">
          {comments.data?.map((c) => (
            <div key={c.id} className="rounded-xl bg-white/[0.04] px-3.5 py-2.5">
              <p className="text-xs text-gray-dark">{c.authorEmail}</p>
              <p className="text-sm">{c.body}</p>
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (comment.trim()) addComment.mutate()
            }}
            className="flex gap-2"
          >
            <Input
              aria-label="Comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a comment…"
              className="flex-1 text-sm"
            />
            <Button type="submit" disabled={addComment.isPending || !comment.trim()}>
              {addComment.isPending ? 'Sending…' : 'Send'}
            </Button>
          </form>
        </div>
      ) : null}

      {canApprove && agentExpanded ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-primary-dark/30 bg-primary-dark/[0.06] p-3">
          {agentEnabled ? (
            <>
              {agentMessages.data?.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm',
                    m.role === 'user' ? 'self-end bg-white/8' : 'self-start bg-darkest/60'
                  )}
                >
                  <p
                    className={cn(
                      'text-xs font-semibold',
                      m.role === 'user' ? 'text-gray-lighter' : 'text-accentOnDark'
                    )}
                  >
                    {m.role === 'user' ? 'You' : 'Agent'}
                  </p>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (agentDraft.trim()) sendToAgent.mutate()
                }}
                className="flex gap-2"
              >
                <Input
                  aria-label="Message to agent"
                  value={agentDraft}
                  onChange={(event) => setAgentDraft(event.target.value)}
                  placeholder="Ask the agent about this question…"
                  className="flex-1 text-sm"
                />
                <Button type="submit" variant="accent" disabled={sendToAgent.isPending}>
                  {sendToAgent.isPending ? 'Thinking…' : 'Send'}
                </Button>
              </form>
            </>
          ) : (
            <p className="text-sm text-gray-lighter">
              Ask an admin to set <code className="text-xs text-white">ANTHROPIC_API_KEY</code> to
              enable this.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  )
}
