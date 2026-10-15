import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createFileRoute, redirect} from '@tanstack/react-router'
import {TRPCClientError} from '@trpc/client'
import {answerModeSchema, CUSTOM_SOURCE, qrPath, sourceOf} from '@whocards/game'
import type {AnswerMode, OddRule, Overtime, QuestionPlan} from '@whocards/game'
import {useMemo, useState} from 'react'

import {Empty, ErrorText, Page, PageHeader, SectionTitle} from '~/components/page'
import {Badge} from '~/components/ui/badge'
import {Button, buttonVariants} from '~/components/ui/button'
import {Card} from '~/components/ui/card'
import {Input, Label, Select} from '~/components/ui/field'
import {cn} from '~/lib/cn'
import {eventLinks} from '~/lib/event-links'
import {trpc} from '~/lib/trpc'
import {roleAtLeast} from '~/server/auth/permissions'
import type {GameDetail} from '~/server/trpc/routers/games'

export const Route = createFileRoute('/_authed/host/$gameId')({
  beforeLoad: ({context}) => {
    if (!context.membership || !roleAtLeast(context.membership.role, 'facilitator')) {
      throw redirect({to: '/'})
    }
  },
  component: HostGame,
})

const LIVE_REFRESH_MS = 4000

type RoundRow = GameDetail['rounds'][number]
type CustomRow = GameDetail['questions'][number]
type RoundSettings = {
  questionPlan: QuestionPlan
  turnSeconds: number
  oddRule: OddRule
  overtime: Overtime
  overtimeSeconds: number
}
type Mode = QuestionPlan['mode']
type Run = (id: string, fn: () => Promise<GameDetail>, onDone?: () => void) => void

const settingsOf = (r: RoundSettings): RoundSettings => ({
  questionPlan: r.questionPlan,
  turnSeconds: r.turnSeconds,
  oddRule: r.oddRule,
  overtime: r.overtime,
  overtimeSeconds: r.overtimeSeconds,
})

const isOddRule = (v: string): v is OddRule => v === 'trio' || v === 'sitout'
const isOvertime = (v: string): v is Overtime => v === 'nudge' || v === 'hard'
const isMode = (v: string): v is Mode => v === 'random' || v === 'same' || v === 'per-turn'

const MODES: Record<Mode, {label: string; option: string}> = {
  random: {label: 'Random', option: 'Random: each player draws their own'},
  same: {label: 'Same question', option: 'Same question for everyone'},
  'per-turn': {label: 'Question per turn', option: 'One question per turn (1st and 2nd speaker)'},
}

const planSummary = (round: RoundRow, deckTitle: (slug: string) => string): string => {
  const plan = round.questionPlan
  if (plan.mode === 'random') return `From ${deckTitle(plan.source)}`
  const [a, b] = round.picks.map((t) => `“${t}”`)
  return plan.mode === 'same' ? `Everyone: ${a}` : `Turn 1: ${a} · Turn 2: ${b}`
}

const clock = (ms: number | null) =>
  ms === null ? '' : new Date(ms).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})

// The server answers CONFLICT when another host moved the game on (a lost race or a stale write).
const isConflict = (error: Error) =>
  error instanceof TRPCClientError && error.data?.code === 'CONFLICT'

const STATUS = {
  lobby: {label: 'Draft', tone: 'neutral'},
  live: {label: 'Live', tone: 'live'},
  ended: {label: 'Ended', tone: 'muted'},
} as const

function HostGame() {
  const {gameId} = Route.useParams()
  const queryClient = useQueryClient()
  const key = ['games.detail', gameId]
  const detail = useQuery({
    queryKey: key,
    queryFn: () => trpc.games.detail.query({gameId}),
    refetchInterval: (query) => {
      const game = query.state.data?.game
      return game?.status === 'ended' && !game.recap?.pending ? false : LIVE_REFRESH_MS
    },
  })
  const act = useMutation({
    mutationFn: (action: {id: string; fn: () => Promise<GameDetail>}) => action.fn(),
    onMutate: () => queryClient.cancelQueries({queryKey: key}),
    onSuccess: async (data) => {
      // A poll that started before the write would land after it and flash the old state back.
      await queryClient.cancelQueries({queryKey: key})
      queryClient.setQueryData(key, data)
    },
    onError: (error) => {
      if (isConflict(error)) void queryClient.invalidateQueries({queryKey: key})
    },
  })
  const busy = act.isPending ? act.variables.id : null
  const run: Run = (id, fn, onDone) => {
    if (act.isPending) return
    act.mutate({id, fn}, {onSuccess: onDone})
  }
  const [editingDetails, setEditingDetails] = useState(false)

  if (detail.isLoading) return <HostSkeleton />
  if (!detail.data)
    return (
      <Page>
        <ErrorText>{detail.error?.message ?? 'No such game.'}</ErrorText>
      </Page>
    )
  const {game, rounds, players, counts, liveRoundId} = detail.data
  const ended = game.status === 'ended'
  const draft = game.status === 'lobby'
  const status = STATUS[game.status]

  const endGame = () => {
    const ok = window.confirm(
      'End the game? Any live round stops and players can no longer play. You preview the recap email next and send it when ready.'
    )
    if (ok) run('end-game', () => trpc.games.endGame.mutate({gameId}))
  }

  const goLive = () => {
    const ok = window.confirm('Go live? Players can join with the code from now on.')
    if (ok) run('go-live', () => trpc.games.goLive.mutate({gameId}))
  }

  return (
    <Page className="max-w-5xl">
      <PageHeader
        back={{to: '/host', label: 'Your workshops'}}
        eyebrow={<Badge tone={status.tone}>{status.label}</Badge>}
        title={game.title}
        description={[
          game.organizer ? `Hosted by ${game.organizer}` : null,
          game.createdBy ? `created by ${game.createdBy}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          ended ? null : (
            <>
              {editingDetails ? null : (
                <Button variant="ghost" onClick={() => setEditingDetails(true)}>
                  Edit details
                </Button>
              )}
              {draft ? (
                <Button
                  variant="primary"
                  onClick={goLive}
                  disabled={act.isPending}
                  pending={busy === 'go-live'}
                >
                  {busy === 'go-live' ? 'Going live…' : 'Go live'}
                </Button>
              ) : null}
              <Button
                variant="danger"
                onClick={endGame}
                disabled={act.isPending}
                pending={busy === 'end-game'}
              >
                {busy === 'end-game' ? 'Ending…' : 'End game'}
              </Button>
            </>
          )
        }
      />

      {act.isError ? (
        <ErrorText className="mb-4">
          {isConflict(act.error)
            ? `${act.error.message} The page now shows the latest state.`
            : act.error.message}
        </ErrorText>
      ) : null}
      {detail.isError ? (
        <ErrorText className="mb-4">{`Refresh failed: ${detail.error.message}`}</ErrorText>
      ) : null}
      {editingDetails && !ended ? (
        <DetailsEditor
          title={game.title}
          organizer={game.organizer ?? ''}
          pending={busy === 'details'}
          disabled={act.isPending}
          onCancel={() => setEditingDetails(false)}
          onSave={(input) =>
            run(
              'details',
              () => trpc.games.updateGame.mutate({gameId, ...input}),
              () => setEditingDetails(false)
            )
          }
        />
      ) : null}
      {draft ? (
        <Card className="mb-6 border-yellow-400/30">
          <p className="font-semibold">Draft: players can't join yet.</p>
          <p className="text-sm text-gray-lighter">
            Set up the rounds, then press Go live. The projector shows "Not open yet" until then.
          </p>
        </Card>
      ) : null}
      {ended ? (
        <RecapPanel gameId={gameId} recap={game.recap} />
      ) : (
        <AnswerModePanel
          mode={game.answerMode}
          live={!draft}
          disabled={act.isPending}
          pendingMode={busy?.startsWith('mode:') ? busy.slice('mode:'.length) : null}
          onChange={(mode) =>
            run(`mode:${mode}`, () => trpc.games.setAnswerMode.mutate({gameId, mode}))
          }
        />
      )}

      <div className="mb-12 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <JoinPanel code={game.code} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-2">
          <Stat label="Players joined" value={counts.players} />
          <Stat label="Pairs this round" value={counts.pairs} />
          <Stat label="Turns in progress" value={counts.turnsInProgress} />
          <Stat label="Answers saved" value={counts.responses} />
        </div>
      </div>

      <QuestionsPanel
        gameId={gameId}
        questions={detail.data.questions}
        ended={ended}
        onSaved={(data) => queryClient.setQueryData(key, data)}
      />

      <RoundsPanel
        gameId={gameId}
        rounds={rounds}
        custom={detail.data.questions}
        liveRoundId={liveRoundId}
        ended={ended}
        draft={draft}
        disabled={act.isPending}
        busy={busy}
        run={run}
      />

      <HostsPanel gameId={gameId} game={game} disabled={act.isPending} busy={busy} run={run} />

      <section>
        <SectionTitle aside={<span className="text-sm text-gray-dark">{players.length}</span>}>
          Players
        </SectionTitle>
        {players.length === 0 ? <Empty>Nobody has joined yet.</Empty> : null}
        <ul className="grid gap-2 sm:grid-cols-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] py-2 pr-2 pl-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8 font-title text-lg font-bold text-yellow-400">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-xs text-gray-dark">
                  {`${p.language.toUpperCase()}${p.recap ? ' · wants recap' : ''}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={act.isPending}
                pending={busy === `remove:${p.id}`}
                onClick={() => {
                  const ok = window.confirm(
                    `Remove ${p.name}? Their saved answers are deleted too; a stranded partner can re-pair.`
                  )
                  if (ok)
                    run(`remove:${p.id}`, () =>
                      trpc.games.removePlayer.mutate({gameId, playerId: p.id})
                    )
                }}
                className="text-gray-dark hover:text-errorOnDark"
              >
                {busy === `remove:${p.id}` ? 'Removing…' : 'Remove'}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  )
}

const skeleton = 'animate-pulse rounded-2.5xl bg-white/[0.05] motion-reduce:animate-none'

function HostSkeleton() {
  return (
    <Page className="max-w-5xl" aria-busy aria-label="Loading workshop">
      <div className="mb-8 md:mb-10">
        <div className={cn(skeleton, 'mb-4 h-4 w-32 rounded-full')} />
        <div className={cn(skeleton, 'mb-3 h-5 w-16 rounded-full')} />
        <div className={cn(skeleton, 'h-12 w-2/3 rounded-xl')} />
      </div>
      <div className={cn(skeleton, 'mb-6 h-20')} />
      <div className="mb-12 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className={cn(skeleton, 'h-56')} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-2">
          {['players', 'pairs', 'turns', 'answers'].map((k) => (
            <div key={k} className={cn(skeleton, 'h-26')} />
          ))}
        </div>
      </div>
      <div className={cn(skeleton, 'mb-3 h-24')} />
      <div className={cn(skeleton, 'h-24')} />
    </Page>
  )
}

function Stat({label, value}: Readonly<{label: string; value: number}>) {
  return (
    <Card className="flex flex-col justify-between gap-3">
      <p className="text-xs font-semibold tracking-wide text-gray-dark uppercase">{label}</p>
      <p className="font-title text-5xl leading-none font-bold">{value}</p>
    </Card>
  )
}

function JoinPanel({code}: Readonly<{code: string}>) {
  const links = eventLinks(code)
  const {size, d} = useMemo(() => qrPath(links.join), [links.join])
  return (
    <Card className="flex flex-col gap-5 border-yellow-400/20 bg-gradient-to-br from-yellow-400/[0.07] to-primary-dark/[0.07] sm:flex-row sm:items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        className="size-44 shrink-0 self-center rounded-2xl bg-white p-2"
      >
        <title>{`QR code for ${links.join}`}</title>
        <rect width={size} height={size} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-gray-lighter uppercase">Game code</p>
        <p className="font-title text-6xl leading-none font-bold tracking-[0.12em] text-yellow-400">
          {code}
        </p>
        <a
          href={links.join}
          target="_blank"
          rel="noreferrer"
          className="mt-2 truncate text-sm text-gray-lighter underline decoration-white/20 underline-offset-4 hover:text-white"
        >
          {links.join.replace(/^https?:\/\//, '')}
        </a>
        <a
          href={links.screen}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({variant: 'accent', size: 'sm', className: 'mt-3 self-start'})}
        >
          Open projector screen ↗
        </a>
      </div>
    </Card>
  )
}

function DetailsEditor({
  title: initialTitle,
  organizer: initialOrganizer,
  pending,
  disabled,
  onCancel,
  onSave,
}: Readonly<{
  title: string
  organizer: string
  pending: boolean
  disabled: boolean
  onCancel: () => void
  onSave: (input: {title: string; organizer: string}) => void
}>) {
  const [title, setTitle] = useState(initialTitle)
  const [organizer, setOrganizer] = useState(initialOrganizer)
  return (
    <Card className="mb-6 border-yellow-400/30">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSave({title, organizer})
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <Label label="Workshop name" className="flex-1">
          <Input required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Label>
        <Label label="Hosted by" className="flex-1">
          <Input
            required
            maxLength={80}
            value={organizer}
            onChange={(e) => setOrganizer(e.target.value)}
            placeholder="Conference or company"
          />
        </Label>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={disabled} pending={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

const ANSWER_MODES: Record<AnswerMode, {label: string; hint: string}> = {
  voice: {label: 'Voice', hint: 'Players record, read the transcript, and save it.'},
  type: {label: 'Type', hint: 'No mic. Players type their answer.'},
  none: {label: 'None', hint: 'Nothing captured. Phones only pace turns.'},
}

function AnswerModePanel({
  mode,
  live,
  disabled,
  pendingMode,
  onChange,
}: Readonly<{
  mode: AnswerMode
  live: boolean
  disabled: boolean
  pendingMode: string | null
  onChange: (mode: AnswerMode) => void
}>) {
  return (
    <Card className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">How players answer</p>
        <p className="text-sm text-gray-lighter">
          {`${ANSWER_MODES[mode].hint}${live ? ' A switch applies from the next turn.' : ''}`}
        </p>
      </div>
      <fieldset aria-label="Answer mode" className="flex gap-1">
        {answerModeSchema.options.map((m) => (
          <Button
            key={m}
            size="sm"
            variant={m === mode ? 'selected' : 'secondary'}
            aria-pressed={m === mode}
            disabled={disabled}
            pending={pendingMode === m}
            onClick={() => {
              if (m !== mode) onChange(m)
            }}
          >
            {ANSWER_MODES[m].label}
          </Button>
        ))}
      </fieldset>
    </Card>
  )
}

function RecapPanel({
  gameId,
  recap,
}: Readonly<{gameId: string; recap: GameDetail['game']['recap']}>) {
  const queryClient = useQueryClient()
  const preview = useQuery({
    queryKey: ['games.recapPreview', gameId],
    queryFn: () => trpc.games.recapPreview.query({gameId}),
    staleTime: Infinity,
  })
  const send = useMutation({
    mutationFn: () => trpc.games.sendRecaps.mutate({gameId}),
    onSuccess: async (data) => {
      await queryClient.cancelQueries({queryKey: ['games.detail', gameId]})
      queryClient.setQueryData(['games.detail', gameId], data)
    },
    onError: (error) => {
      if (isConflict(error))
        void queryClient.invalidateQueries({queryKey: ['games.detail', gameId]})
    },
  })
  // A send that delivered nothing can go again; anything else is final.
  const canSend = !recap || (!recap.pending && recap.sent === 0)
  const recipients = preview.data?.recipients ?? 0
  const plural = recipients === 1 ? 'player' : 'players'

  const status = () => {
    if (!recap) return null
    if (recap.pending) return <p className="text-sm text-gray-lighter">Sending…</p>
    return (
      <p className={cn('text-sm', recap.failed > 0 ? 'text-errorOnDark' : 'text-gray-lighter')}>
        {`Recap emails: ${recap.sent} sent, ${recap.failed} failed${recap.error ? ` (${recap.error})` : ''}.`}
      </p>
    )
  }

  return (
    <section className="mb-12">
      <SectionTitle>Recap email</SectionTitle>
      <Card className="flex flex-col gap-4">
        {preview.isLoading ? (
          <div
            aria-busy
            className={cn(skeleton, 'grid h-[36rem] place-items-center text-sm text-gray-dark')}
          >
            Rendering preview…
          </div>
        ) : null}
        {preview.isError ? <ErrorText>{preview.error.message}</ErrorText> : null}
        {preview.data ? (
          <>
            <p className="text-sm text-gray-lighter">
              {preview.data.sample
                ? 'Nobody asked for a recap, so this preview uses a sample player.'
                : `Preview of one player's email. Each player gets their own numbers and question.`}
            </p>
            <iframe
              title="Recap email preview"
              sandbox=""
              srcDoc={preview.data.html}
              className="h-[36rem] w-full rounded-2xl bg-white"
            />
          </>
        ) : null}
        {status()}
        {canSend ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={!preview.data || recipients === 0}
              pending={send.isPending}
              onClick={() => {
                const ok = window.confirm(
                  `Send the recap to ${recipients} ${plural}? It goes out once and can't be recalled.`
                )
                if (ok && !send.isPending) send.mutate()
              }}
            >
              {send.isPending
                ? 'Sending…'
                : `${recap ? 'Retry: send' : 'Send'}${preview.data ? ` to ${recipients} ${plural}` : ''}`}
            </Button>
            {send.isError ? <ErrorText>{send.error.message}</ErrorText> : null}
          </div>
        ) : null}
      </Card>
    </section>
  )
}

function HostsPanel({
  gameId,
  game,
  disabled,
  busy,
  run,
}: Readonly<{
  gameId: string
  game: GameDetail['game']
  disabled: boolean
  busy: string | null
  run: Run
}>) {
  const options = useQuery({
    queryKey: ['games.facilitatorOptions', gameId, game.facilitators.length],
    queryFn: () => trpc.games.facilitatorOptions.query({gameId}),
    enabled: game.canManageHosts,
    placeholderData: keepPreviousData,
  })
  const [picked, setPicked] = useState('')
  const set = (userId: string, on: boolean, onDone?: () => void) =>
    run(`host:${userId}`, () => trpc.games.setFacilitator.mutate({gameId, userId, on}), onDone)

  return (
    <section className="mb-12">
      <SectionTitle>Hosts</SectionTitle>
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-gray-lighter">
          {`${game.createdBy ?? 'Unknown'} (creator). Co-facilitators can run everything here; only the creator or an admin changes this list.`}
        </p>
        {game.facilitators.length === 0 ? (
          <p className="text-sm text-gray-dark">No co-facilitators yet.</p>
        ) : null}
        <ul className="flex flex-wrap gap-2">
          {game.facilitators.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] py-1 pr-1 pl-3 text-sm"
            >
              {f.label}
              {game.canManageHosts ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  pending={busy === `host:${f.id}`}
                  aria-label={`Remove ${f.label}`}
                  onClick={() => set(f.id, false)}
                  className="text-gray-dark hover:text-errorOnDark"
                >
                  {busy === `host:${f.id}` ? null : '×'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {game.canManageHosts && options.data && options.data.length > 0 ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (picked) set(picked, true, () => setPicked(''))
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <Label label="Add a co-facilitator" className="flex-1">
              <Select
                value={picked}
                disabled={disabled || options.isPlaceholderData}
                onChange={(event) => setPicked(event.target.value)}
              >
                <option value="">Choose a facilitator…</option>
                {options.data.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Label>
            <Button
              type="submit"
              disabled={disabled || !picked || options.isPlaceholderData}
              pending={busy === `host:${picked}`}
            >
              {busy === `host:${picked}` ? 'Adding…' : 'Add'}
            </Button>
          </form>
        ) : null}
      </Card>
    </section>
  )
}

const ROUND_STATUS = {
  pending: {label: 'Ready', tone: 'neutral'},
  live: {label: 'Live', tone: 'live'},
  done: {label: 'Done', tone: 'muted'},
} as const

function QuestionsPanel({
  gameId,
  questions,
  ended,
  onSaved,
}: Readonly<{
  gameId: string
  questions: CustomRow[]
  ended: boolean
  onSaved: (detail: GameDetail) => void
}>) {
  const [editing, setEditing] = useState(false)
  const save = useMutation({
    mutationFn: (input: {questions: QuestionInput[]; baseIds: string[]}) =>
      trpc.games.saveQuestions.mutate({gameId, ...input}),
    onSuccess: (data) => {
      onSaved(data)
      setEditing(false)
    },
  })

  return (
    <section className="mb-12">
      <SectionTitle
        aside={
          ended || editing ? null : (
            <Button
              size="sm"
              onClick={() => {
                save.reset()
                setEditing(true)
              }}
            >
              Edit questions
            </Button>
          )
        }
      >
        Custom questions
      </SectionTitle>
      {editing ? (
        <QuestionsEditor
          initial={questions}
          pending={save.isPending}
          error={save.error?.message ?? null}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            if (!save.isPending) save.mutate({questions: next, baseIds: questions.map((q) => q.id)})
          }}
        />
      ) : (
        <>
          {questions.length === 0 ? (
            <Empty>No custom questions yet. Rounds can use them alongside the decks.</Empty>
          ) : null}
          <ol className="flex list-decimal flex-col gap-2 pl-6 marker:text-gray-dark">
            {questions.map((q) => (
              <li key={q.id}>
                <p>{q.en}</p>
                {q.hu ? <p className="text-sm text-gray-lighter">{q.hu}</p> : null}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

type QuestionInput = {id?: string; en: string; hu?: string}
type DraftQuestion = {key: string; id?: string; en: string; hu: string; used: boolean}

function QuestionsEditor({
  initial,
  pending,
  error,
  onCancel,
  onSave,
}: Readonly<{
  initial: CustomRow[]
  pending: boolean
  error: string | null
  onCancel: () => void
  onSave: (questions: QuestionInput[]) => void
}>) {
  const [invalid, setInvalid] = useState(false)
  const [draft, setDraft] = useState<DraftQuestion[]>(() =>
    initial.map((q) => ({key: q.id, id: q.id, en: q.en, hu: q.hu ?? '', used: q.used}))
  )
  const [added, setAdded] = useState(0)
  const patch = (key: string, change: Partial<DraftQuestion>) =>
    setDraft((rows) => rows.map((r) => (r.key === key ? {...r, ...change} : r)))
  const move = (from: number, to: number) =>
    setDraft((rows) => {
      const next = [...rows]
      const [row] = next.splice(from, 1)
      if (row) next.splice(to, 0, row)
      return next
    })

  return (
    <Card className="border-yellow-400/30">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const rows = draft.map((r) => ({id: r.id, en: r.en.trim(), hu: r.hu.trim()}))
          const missing = rows.some((r) => r.en === '')
          setInvalid(missing)
          if (missing) return
          onSave(
            rows.map((r) => ({...(r.id ? {id: r.id} : {}), en: r.en, ...(r.hu ? {hu: r.hu} : {})}))
          )
        }}
        className="flex flex-col gap-4"
      >
        {draft.map((row, i) => (
          <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              required
              maxLength={400}
              placeholder="English (required)"
              aria-label={`Question ${i + 1} in English`}
              value={row.en}
              onChange={(event) => patch(row.key, {en: event.target.value})}
            />
            <Input
              maxLength={400}
              placeholder="Magyarul (optional, falls back to English)"
              aria-label={`Question ${i + 1} in Hungarian`}
              value={row.hu}
              onChange={(event) => patch(row.key, {hu: event.target.value})}
            />
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move question ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move question ${i + 1} down`}
                disabled={i === draft.length - 1}
                onClick={() => move(i, i + 1)}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={row.used}
                title={row.used ? 'Used in a round. Edit it instead.' : undefined}
                onClick={() => setDraft((rows) => rows.filter((r) => r.key !== row.key))}
                className="text-gray-dark hover:text-errorOnDark"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        {invalid ? <ErrorText>Every question needs English text.</ErrorText> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setAdded((n) => n + 1)
              setDraft((rows) => [...rows, {key: `new-${added}`, en: '', hu: '', used: false}])
            }}
          >
            + Add question
          </Button>
          <Button type="submit" variant="primary" size="sm" pending={pending}>
            {pending ? 'Saving…' : 'Save questions'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

function RoundsPanel({
  gameId,
  rounds,
  custom,
  liveRoundId,
  ended,
  draft,
  disabled,
  busy,
  run,
}: Readonly<{
  gameId: string
  rounds: RoundRow[]
  custom: CustomRow[]
  liveRoundId: string | null
  ended: boolean
  draft: boolean
  disabled: boolean
  busy: string | null
  run: Run
}>) {
  const [editing, setEditing] = useState<string | null>(null)
  const last = rounds.at(-1)
  const decks = useDecks()
  const deckTitle = (slug: string) =>
    slug === CUSTOM_SOURCE
      ? 'custom questions'
      : (decks.data?.find((d) => d.slug === slug)?.title ?? slug)

  return (
    <section className="mb-12">
      <SectionTitle
        aside={
          ended || editing === 'new' ? null : (
            <Button size="sm" onClick={() => setEditing('new')}>
              + Add round
            </Button>
          )
        }
      >
        Rounds
      </SectionTitle>
      {rounds.length === 0 && editing !== 'new' ? (
        <Empty>No rounds yet. Add one to start playing.</Empty>
      ) : null}

      <ol className="flex flex-col gap-3">
        {rounds.map((round) =>
          editing === round.id ? (
            <li key={round.id}>
              <RoundEditor
                initial={settingsOf(round)}
                custom={custom}
                questionsLocked={round.status === 'live'}
                disabled={disabled}
                pending={busy === `save:${round.id}`}
                onCancel={() => setEditing(null)}
                onSave={(settings) =>
                  run(
                    `save:${round.id}`,
                    () => trpc.games.updateRound.mutate({gameId, roundId: round.id, settings}),
                    () => setEditing(null)
                  )
                }
              />
            </li>
          ) : (
            <li
              key={round.id}
              className={cn(
                'flex flex-col gap-4 rounded-2.5xl border p-4 sm:flex-row sm:items-center sm:p-5',
                round.status === 'live'
                  ? 'border-yellow-400/40 bg-yellow-400/[0.06]'
                  : 'border-white/8 bg-white/[0.035]',
                round.status === 'done' && 'opacity-70'
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span
                  className={cn(
                    'font-title text-5xl leading-none font-bold',
                    round.status === 'live' ? 'text-yellow-400' : 'text-gray-light'
                  )}
                >
                  {String(round.n).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{MODES[round.questionPlan.mode].label}</p>
                    <Badge tone={ROUND_STATUS[round.status].tone}>
                      {ROUND_STATUS[round.status].label}
                    </Badge>
                    {round.status === 'live' ? (
                      <span className="text-xs text-gray-lighter">{`ends ${clock(round.endsAt)}`}</span>
                    ) : null}
                  </div>
                  <p className="mb-1 line-clamp-2 text-sm text-gray-lighter">
                    {planSummary(round, deckTitle)}
                  </p>
                  <p className="text-xs text-gray-dark">
                    {`${round.turnSeconds}s turns · odd one out: ${round.oddRule} · overtime: ${round.overtime}${round.overtime === 'nudge' ? ` ${round.overtimeSeconds}s` : ''}`}
                    {round.status === 'pending'
                      ? ''
                      : ` · ${round.pairs} pairs · ${round.turns} turns`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {round.status === 'done' || ended ? null : (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(round.id)}>
                    Edit
                  </Button>
                )}
                {round.status === 'pending' && !ended ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={disabled || draft || liveRoundId !== null}
                    pending={busy === `start:${round.id}`}
                    title={draft ? 'Go live first' : undefined}
                    onClick={() =>
                      run(`start:${round.id}`, () =>
                        trpc.games.startRound.mutate({gameId, roundId: round.id})
                      )
                    }
                  >
                    {busy === `start:${round.id}` ? 'Starting…' : 'Start round'}
                  </Button>
                ) : null}
                {round.status === 'live' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={disabled}
                    pending={busy === `end:${round.id}`}
                    onClick={() =>
                      run(`end:${round.id}`, () =>
                        trpc.games.endRound.mutate({gameId, roundId: round.id})
                      )
                    }
                  >
                    {busy === `end:${round.id}` ? 'Ending…' : 'End round'}
                  </Button>
                ) : null}
              </div>
            </li>
          )
        )}
      </ol>

      {editing === 'new' ? (
        <div className="mt-3">
          <RoundEditor
            initial={last ? settingsOf(last) : null}
            custom={custom}
            questionsLocked={false}
            disabled={disabled}
            pending={busy === 'add-round'}
            onCancel={() => setEditing(null)}
            onSave={(settings) =>
              run(
                'add-round',
                () => trpc.games.addRound.mutate({gameId, settings}),
                () => setEditing(null)
              )
            }
          />
        </div>
      ) : null}
    </section>
  )
}

const useDecks = () =>
  useQuery({
    queryKey: ['games.decks'],
    queryFn: () => trpc.games.decks.query(),
    staleTime: Infinity,
  })

function QuestionPicker({
  label,
  value,
  custom,
  disabled,
  onChange,
}: Readonly<{
  label: string
  value: string
  custom: CustomRow[]
  disabled: boolean
  onChange: (ref: string) => void
}>) {
  const decks = useDecks()
  const [source, setSource] = useState(() =>
    value ? sourceOf(value) : custom.length > 0 ? CUSTOM_SOURCE : ''
  )
  const from = source || decks.data?.[0]?.slug || ''
  const options =
    from === CUSTOM_SOURCE
      ? custom.map((q) => ({ref: q.id, en: q.en}))
      : (decks.data?.find((d) => d.slug === from)?.questions ?? [])

  return (
    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <Label label={`${label}: from`}>
        <Select
          value={from}
          disabled={disabled || decks.isLoading}
          onChange={(event) => {
            setSource(event.target.value)
            onChange('')
          }}
        >
          <option value={CUSTOM_SOURCE}>{`Custom questions (${custom.length})`}</option>
          {decks.data?.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.title}
            </option>
          ))}
        </Select>
      </Label>
      <Label label={`${label}: question`}>
        <Select
          required
          value={value}
          disabled={disabled || decks.isLoading}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" disabled>
            {options.length === 0 ? 'No questions here yet' : 'Pick a question…'}
          </option>
          {options.map((o) => (
            <option key={o.ref} value={o.ref}>
              {o.en}
            </option>
          ))}
        </Select>
      </Label>
    </div>
  )
}

function RoundEditor({
  initial,
  custom,
  questionsLocked,
  disabled,
  pending,
  onCancel,
  onSave,
}: Readonly<{
  initial: RoundSettings | null
  custom: CustomRow[]
  questionsLocked: boolean
  disabled: boolean
  pending: boolean
  onCancel: () => void
  onSave: (settings: RoundSettings) => void
}>) {
  const decks = useDecks()
  const plan = initial?.questionPlan
  const [mode, setMode] = useState<Mode>(plan?.mode ?? 'random')
  const [source, setSource] = useState(plan?.mode === 'random' ? plan.source : '')
  const [first, setFirst] = useState(
    plan?.mode === 'same' ? plan.question : plan?.mode === 'per-turn' ? plan.questions[0] : ''
  )
  const [second, setSecond] = useState(plan?.mode === 'per-turn' ? plan.questions[1] : '')
  const [turnSeconds, setTurnSeconds] = useState(initial?.turnSeconds ?? 60)
  const [oddRule, setOddRule] = useState<OddRule>(initial?.oddRule ?? 'trio')
  const [overtime, setOvertime] = useState<Overtime>(initial?.overtime ?? 'nudge')
  const [overtimeSeconds, setOvertimeSeconds] = useState(initial?.overtimeSeconds ?? 30)
  const randomSource = source || decks.data?.[0]?.slug || ''

  const questionPlan = ((): QuestionPlan | null => {
    if (mode === 'random') return randomSource ? {mode, source: randomSource} : null
    if (mode === 'same') return first ? {mode, question: first} : null
    return first && second ? {mode, questions: [first, second]} : null
  })()

  return (
    <Card className="border-yellow-400/30">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (questionPlan) onSave({questionPlan, turnSeconds, oddRule, overtime, overtimeSeconds})
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Label
          label="Questions"
          hint={questionsLocked ? 'Questions are fixed once a round starts.' : undefined}
          className="sm:col-span-2"
        >
          <Select
            value={mode}
            disabled={questionsLocked}
            onChange={(event) => {
              const {value} = event.target
              if (isMode(value)) setMode(value)
            }}
          >
            {Object.entries(MODES).map(([value, m]) => (
              <option key={value} value={value}>
                {m.option}
              </option>
            ))}
          </Select>
        </Label>
        {mode === 'random' ? (
          <Label label="Draw from" className="sm:col-span-2">
            <Select
              value={randomSource}
              disabled={questionsLocked || decks.isLoading}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value={CUSTOM_SOURCE}>{`Custom questions (${custom.length})`}</option>
              {decks.data?.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {`${d.title} (${d.questions.length} questions)`}
                </option>
              ))}
            </Select>
          </Label>
        ) : (
          <QuestionPicker
            label={mode === 'same' ? 'Everyone' : 'Turn 1'}
            value={first}
            custom={custom}
            disabled={questionsLocked}
            onChange={setFirst}
          />
        )}
        {mode === 'per-turn' ? (
          <QuestionPicker
            label="Turn 2"
            value={second}
            custom={custom}
            disabled={questionsLocked}
            onChange={setSecond}
          />
        ) : null}
        <Label label="Seconds per turn">
          <Input
            type="number"
            required
            min={10}
            max={1800}
            value={turnSeconds}
            onChange={(event) => setTurnSeconds(event.target.valueAsNumber)}
          />
        </Label>
        <Label label="Odd one out">
          <Select
            value={oddRule}
            onChange={(event) => {
              const {value} = event.target
              if (isOddRule(value)) setOddRule(value)
            }}
          >
            <option value="trio">Joins a pair as a trio</option>
            <option value="sitout">Sits out this round</option>
          </Select>
        </Label>
        <Label label="When time is up">
          <Select
            value={overtime}
            onChange={(event) => {
              const {value} = event.target
              if (isOvertime(value)) setOvertime(value)
            }}
          >
            <option value="nudge">Nudge, then stop after a grace period</option>
            <option value="hard">Stop right away</option>
          </Select>
        </Label>
        {overtime === 'nudge' ? (
          <Label label="Grace seconds">
            <Input
              type="number"
              required
              min={0}
              max={600}
              value={overtimeSeconds}
              onChange={(event) => setOvertimeSeconds(event.target.valueAsNumber)}
            />
          </Label>
        ) : null}
        <div className="flex gap-2 sm:col-span-2">
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || !questionPlan}
            pending={pending}
          >
            {pending ? 'Saving…' : 'Save round'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
