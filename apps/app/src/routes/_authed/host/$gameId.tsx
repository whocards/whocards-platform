import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createFileRoute, redirect} from '@tanstack/react-router'
import {qrPath} from '@whocards/game'
import type {OddRule, Overtime} from '@whocards/game'
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
type RoundSettings = {
  deckSlug: string
  turnSeconds: number
  oddRule: OddRule
  overtime: Overtime
  overtimeSeconds: number
}

const settingsOf = (r: RoundSettings): RoundSettings => ({
  deckSlug: r.deckSlug,
  turnSeconds: r.turnSeconds,
  oddRule: r.oddRule,
  overtime: r.overtime,
  overtimeSeconds: r.overtimeSeconds,
})

const isOddRule = (v: string): v is OddRule => v === 'trio' || v === 'sitout'
const isOvertime = (v: string): v is Overtime => v === 'nudge' || v === 'hard'

const clock = (ms: number | null) =>
  ms === null ? '' : new Date(ms).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})

const STATUS = {
  lobby: {label: 'Lobby', tone: 'neutral'},
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
    refetchInterval: (query) =>
      query.state.data?.game.status === 'ended' ? false : LIVE_REFRESH_MS,
  })
  const act = useMutation({
    mutationFn: (run: () => Promise<GameDetail>) => run(),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  })

  if (detail.isLoading)
    return (
      <Page>
        <p className="text-gray-dark">Loading…</p>
      </Page>
    )
  if (!detail.data)
    return (
      <Page>
        <ErrorText>{detail.error?.message ?? 'No such game.'}</ErrorText>
      </Page>
    )
  const {game, rounds, players, counts, liveRoundId} = detail.data
  const ended = game.status === 'ended'
  const status = STATUS[game.status]

  const endGame = () => {
    const ok = window.confirm(
      'End the game? Any live round stops, and players who asked for a recap get their email now.'
    )
    if (ok) act.mutate(() => trpc.games.endGame.mutate({gameId}))
  }

  return (
    <Page className="max-w-5xl">
      <PageHeader
        back={{to: '/host', label: 'All games'}}
        eyebrow={<Badge tone={status.tone}>{status.label}</Badge>}
        title={game.title}
        actions={
          ended ? null : (
            <Button variant="danger" onClick={endGame} disabled={act.isPending}>
              End game
            </Button>
          )
        }
      />

      {act.isError ? <ErrorText className="mb-4">{act.error.message}</ErrorText> : null}
      {detail.isError ? (
        <ErrorText className="mb-4">{`Refresh failed: ${detail.error.message}`}</ErrorText>
      ) : null}
      {game.recap ? (
        <p
          className={cn(
            'mb-6 text-sm',
            game.recap.failed > 0 ? 'text-errorOnDark' : 'text-gray-lighter'
          )}
        >
          {`Recap emails: ${game.recap.sent} sent, ${game.recap.failed} failed${game.recap.error ? ` (${game.recap.error})` : ''}.`}
        </p>
      ) : null}

      <div className="mb-12 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <JoinPanel code={game.code} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-2">
          <Stat label="Players joined" value={counts.players} />
          <Stat label="Pairs this round" value={counts.pairs} />
          <Stat label="Turns in progress" value={counts.turnsInProgress} />
          <Stat label="Answers saved" value={counts.responses} />
        </div>
      </div>

      <RoundsPanel
        gameId={gameId}
        rounds={rounds}
        liveRoundId={liveRoundId}
        ended={ended}
        pending={act.isPending}
        run={(fn) => act.mutate(fn)}
      />

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
                onClick={() => {
                  const ok = window.confirm(
                    `Remove ${p.name}? Their saved answers are deleted too; a stranded partner can re-pair.`
                  )
                  if (ok) act.mutate(() => trpc.games.removePlayer.mutate({gameId, playerId: p.id}))
                }}
                className="text-gray-dark hover:text-errorOnDark"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </section>
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

const ROUND_STATUS = {
  pending: {label: 'Ready', tone: 'neutral'},
  live: {label: 'Live', tone: 'live'},
  done: {label: 'Done', tone: 'muted'},
} as const

function RoundsPanel({
  gameId,
  rounds,
  liveRoundId,
  ended,
  pending,
  run,
}: Readonly<{
  gameId: string
  rounds: RoundRow[]
  liveRoundId: string | null
  ended: boolean
  pending: boolean
  run: (fn: () => Promise<GameDetail>) => void
}>) {
  const [editing, setEditing] = useState<string | null>(null)
  const last = rounds.at(-1)

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
                deckLocked={round.status === 'live'}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(settings) => {
                  setEditing(null)
                  run(() => trpc.games.updateRound.mutate({gameId, roundId: round.id, settings}))
                }}
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
                    <p className="font-semibold">{round.deckSlug}</p>
                    <Badge tone={ROUND_STATUS[round.status].tone}>
                      {ROUND_STATUS[round.status].label}
                    </Badge>
                    {round.status === 'live' ? (
                      <span className="text-xs text-gray-lighter">{`ends ${clock(round.endsAt)}`}</span>
                    ) : null}
                  </div>
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
                    disabled={pending || liveRoundId !== null}
                    onClick={() =>
                      run(() => trpc.games.startRound.mutate({gameId, roundId: round.id}))
                    }
                  >
                    Start round
                  </Button>
                ) : null}
                {round.status === 'live' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => trpc.games.endRound.mutate({gameId, roundId: round.id}))
                    }
                  >
                    End round
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
            deckLocked={false}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSave={(settings) => {
              setEditing(null)
              run(() => trpc.games.addRound.mutate({gameId, settings}))
            }}
          />
        </div>
      ) : null}
    </section>
  )
}

function RoundEditor({
  initial,
  deckLocked,
  pending,
  onCancel,
  onSave,
}: Readonly<{
  initial: RoundSettings | null
  deckLocked: boolean
  pending: boolean
  onCancel: () => void
  onSave: (settings: RoundSettings) => void
}>) {
  const decks = useQuery({
    queryKey: ['games.decks'],
    queryFn: () => trpc.games.decks.query(),
    staleTime: Infinity,
  })
  const [deckSlug, setDeckSlug] = useState(initial?.deckSlug ?? '')
  const [turnSeconds, setTurnSeconds] = useState(initial?.turnSeconds ?? 60)
  const [oddRule, setOddRule] = useState<OddRule>(initial?.oddRule ?? 'trio')
  const [overtime, setOvertime] = useState<Overtime>(initial?.overtime ?? 'nudge')
  const [overtimeSeconds, setOvertimeSeconds] = useState(initial?.overtimeSeconds ?? 30)
  const slug = deckSlug || decks.data?.[0]?.slug || ''

  return (
    <Card className="border-yellow-400/30">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSave({deckSlug: slug, turnSeconds, oddRule, overtime, overtimeSeconds})
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Label
          label="Deck"
          hint={deckLocked ? 'The deck is fixed once a round starts.' : undefined}
          className="sm:col-span-2"
        >
          <Select
            value={slug}
            disabled={deckLocked}
            onChange={(event) => setDeckSlug(event.target.value)}
          >
            {decks.data?.map((d) => (
              <option key={d.slug} value={d.slug}>
                {`${d.title} (${d.questions} questions)`}
              </option>
            ))}
          </Select>
        </Label>
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
          <Button type="submit" variant="primary" disabled={pending || !slug}>
            Save round
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
