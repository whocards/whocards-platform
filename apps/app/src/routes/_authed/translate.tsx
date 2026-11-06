import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createFileRoute, Link, redirect} from '@tanstack/react-router'
import {useState} from 'react'
import {z} from 'zod'

import {Empty, ErrorText, Page, PageHeader, SectionTitle} from '~/components/page'
import {Badge} from '~/components/ui/badge'
import {Button} from '~/components/ui/button'
import {Card} from '~/components/ui/card'
import {Textarea} from '~/components/ui/field'
import {trpc} from '~/lib/trpc'
import {roleAtLeast} from '~/server/auth/permissions'

type Question = Awaited<
  ReturnType<(typeof trpc)['translation']['workspace']['query']>
>['decks'][number]['questions'][number]

export const Route = createFileRoute('/_authed/translate')({
  validateSearch: z.object({lang: z.string().optional()}),
  beforeLoad: ({context}) => {
    const role = context.membership?.role
    if (!role || (role !== 'translator' && !roleAtLeast(role, 'admin'))) throw redirect({to: '/'})
  },
  component: Translate,
})

function Translate() {
  const {lang} = Route.useSearch()
  const workspace = useQuery({
    queryKey: ['translation.workspace', lang],
    queryFn: () => trpc.translation.workspace.query({language: lang}),
  })
  const [showDiff, setShowDiff] = useState(false)
  const data = workspace.data

  return (
    <Page>
      <PageHeader
        title="Translate"
        description={
          data?.language
            ? `Edit the first-pass drafts into ${data.language}, then approve each one.`
            : 'Pick a language.'
        }
        actions={
          data?.patch ? (
            <Button variant="secondary" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? 'Hide diff' : 'Show diff'}
            </Button>
          ) : null
        }
      />
      {workspace.isLoading ? <p className="text-gray-dark">Loading…</p> : null}
      {workspace.isError ? <ErrorText>{workspace.error.message}</ErrorText> : null}

      {data && data.languages.length > 0 ? (
        <nav className="mb-8 flex flex-wrap gap-2" aria-label="Languages">
          {data.languages.map((code) => (
            <Link
              key={code}
              to="/translate"
              search={{lang: code}}
              className="rounded-full border border-white/10 px-3 py-1 text-sm hover:border-yellow-400/60"
              activeProps={{className: 'border-yellow-400/60 text-yellow-400'}}
            >
              {code}
            </Link>
          ))}
        </nav>
      ) : null}

      {showDiff && data?.patch ? (
        <Card className="mb-8">
          <p className="mb-3 text-sm text-gray-lighter">
            Approved translations as a diff against packages/decks. Apply it with{' '}
            <code>git apply</code> in a PR; this app never writes to git.
          </p>
          <pre className="max-h-96 overflow-auto rounded-xl bg-darkest/60 p-4 text-xs whitespace-pre-wrap">
            {data.patch}
          </pre>
        </Card>
      ) : null}

      {data?.language && data.decks.length === 0 ? (
        <Empty>Every deck already ships {data.language}.</Empty>
      ) : null}

      {data?.language
        ? data.decks.map((deck) => {
            const approved = deck.questions.filter((q) => q.status === 'approved').length
            return (
              <section key={deck.slug} className="mb-10">
                <SectionTitle
                  aside={
                    <span className="text-sm text-gray-dark">
                      {approved}/{deck.questions.length} approved
                    </span>
                  }
                >
                  {deck.title}
                </SectionTitle>
                <ul className="flex flex-col gap-3">
                  {deck.questions.map((question) => (
                    <QuestionRow
                      key={`${data.language}/${question.id}`}
                      language={data.language ?? ''}
                      lang={lang}
                      deckSlug={deck.slug}
                      question={question}
                    />
                  ))}
                </ul>
              </section>
            )
          })
        : null}
    </Page>
  )
}

function QuestionRow({
  language,
  lang,
  deckSlug,
  question,
}: Readonly<{language: string; lang: string | undefined; deckSlug: string; question: Question}>) {
  const queryClient = useQueryClient()
  const [text, setText] = useState(question.text)
  const save = useMutation({
    mutationFn: (status: 'draft' | 'approved') =>
      trpc.translation.save.mutate({
        language: lang,
        deckSlug,
        questionId: question.id,
        text,
        status,
      }),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['translation.workspace']}),
  })
  const unchanged = text.trim() === question.text

  return (
    <li className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm whitespace-pre-line text-gray-lighter">{question.source}</p>
        {question.status ? (
          <Badge tone={question.status === 'approved' ? 'good' : 'muted'} className="capitalize">
            {question.status}
          </Badge>
        ) : null}
      </div>
      <Textarea
        lang={language}
        aria-label={`Translation of: ${question.source}`}
        rows={2}
        className="field-sizing-content"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {save.isError ? <ErrorText className="mr-auto">{save.error.message}</ErrorText> : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={save.isPending || !text.trim() || unchanged}
          onClick={() => save.mutate('draft')}
        >
          Save draft
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={save.isPending || !text.trim() || (unchanged && question.status === 'approved')}
          onClick={() => save.mutate('approved')}
        >
          Approve
        </Button>
      </div>
    </li>
  )
}
