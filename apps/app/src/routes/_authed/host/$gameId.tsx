import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createFileRoute, Link, redirect} from '@tanstack/react-router'
import {qrPath} from '@whocards/game'
import type {OddRule, Overtime} from '@whocards/game'
import {useMemo, useState} from 'react'

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

const primary = 'rounded-full bg-yellow-400 px-4 py-2 font-bold text-darker disabled:opacity-60'
const secondary =
  'rounded-full bg-gray-light px-4 py-2 font-semibold text-white disabled:opacity-60'
const field = 'rounded-full bg-gray-light px-4 py-2 text-white'

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

  if (detail.isLoading) return <p className="p-6 text-gray-lighter">Loading…</p>
  if (!detail.data)
    return <p className="p-6 text-red">{detail.error?.message ?? 'No such game.'}</p>
  const {game, rounds, players, counts, liveRoundId} = detail.data
  const ended = game.status === 'ended'

  const endGame = () => {
    const ok = window.confirm(
      'End the game? Any live round stops, and players who asked for a recap get their email now.'
    )
    if (ok) act.mutate(() => trpc.games.endGame.mutate({gameId}))
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <Link to="/host" className="text-sm text-gray-lighter">
        ← All games
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{game.title}</h1>
          <p className="mt-1 text-sm text-gray-lighter">
            {`Code ${game.code} · ${game.status === 'lobby' ? 'Lobby' : ended ? 'Ended' : 'Live'}`}
          </p>
        </div>
        {ended ? null : (
          <button type="button" onClick={endGame} disabled={act.isPending} className={secondary}>
            End game
          </button>
        )}
      </div>

      {act.isError ? <p className="mb-3 text-sm text-red">{act.error.message}</p> : null}
      {detail.isError ? (
        <p className="mb-3 text-sm text-red">{`Refresh failed: ${detail.error.message}`}</p>
      ) : null}
      {game.recap ? (
        <p
          className={
            game.recap.failed > 0 ? 'mb-6 text-sm text-red' : 'mb-6 text-sm text-gray-lighter'
          }
        >
          {`Recap emails: ${game.recap.sent} sent, ${game.recap.failed} failed${game.recap.error ? ` (${game.recap.error})` : ''}.`}
        </p>
      ) : null}

      <JoinPanel code={game.code} />

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold">Right now</h2>
        <div className="flex flex-wrap gap-3">
          <Stat label="players joined" value={counts.players} />
          <Stat label="pairs this round" value={counts.pairs} />
          <Stat label="turns in progress" value={counts.turnsInProgress} />
          <Stat label="answers saved" value={counts.responses} />
        </div>
      </section>

      <RoundsPanel
        gameId={gameId}
        rounds={rounds}
        liveRoundId={liveRoundId}
        ended={ended}
        pending={act.isPending}
        run={(fn) => act.mutate(fn)}
      />

      <section>
        <h2 className="mb-3 text-lg font-bold">{`Players (${players.length})`}</h2>
        {players.length === 0 ? <p className="text-gray-lighter">Nobody has joined yet.</p> : null}
        <ul className="flex flex-col gap-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-gray-light/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-gray-lighter">
                  {`${p.language.toUpperCase()}${p.recap ? ' · wants recap' : ''}`}
                </p>
              </div>
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => {
                  const ok = window.confirm(
                    `Remove ${p.name}? Their saved answers are deleted too; a stranded partner can re-pair.`
                  )
                  if (ok) act.mutate(() => trpc.games.removePlayer.mutate({gameId, playerId: p.id}))
                }}
                className="rounded-full bg-darker px-3 py-1.5 text-sm text-white disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Stat({label, value}: Readonly<{label: string; value: number}>) {
  return (
    <div className="rounded-2xl bg-gray-light/40 px-4 py-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-gray-lighter">{label}</p>
    </div>
  )
}

function JoinPanel({code}: Readonly<{code: string}>) {
  const links = eventLinks(code)
  const {size, d} = useMemo(() => qrPath(links.join), [links.join])
  return (
    <section className="mb-8 flex flex-wrap items-center gap-6 rounded-2xl bg-gray-light/40 p-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={200} height={200} shapeRendering="crispEdges">
        <title>{`QR code for ${links.join}`}</title>
        <rect width={size} height={size} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm text-gray-lighter">Players join at</p>
        <a href={links.join} target="_blank" rel="noreferrer" className="font-semibold underline">
          {links.join}
        </a>
        <p className="text-2xl font-bold text-yellow-400">{code}</p>
        <a href={links.screen} target="_blank" rel="noreferrer" className="text-sm underline">
          Open the projector screen
        </a>
      </div>
    </section>
  )
}

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
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Rounds</h2>
        {ended || editing === 'new' ? null : (
          <button type="button" onClick={() => setEditing('new')} className={secondary}>
            Add round
          </button>
        )}
      </div>
      {rounds.length === 0 && editing !== 'new' ? (
        <p className="text-gray-lighter">No rounds yet. Add one to start playing.</p>
      ) : null}

      <ul className="flex flex-col gap-2">
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
              className="flex flex-col gap-2 rounded-2xl bg-gray-light/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {`Round ${round.n} · `}
                  <span
                    className={round.status === 'live' ? 'text-yellow-400' : 'text-gray-lighter'}
                  >
                    {round.status === 'live'
                      ? `Live, planned end ${clock(round.endsAt)}`
                      : round.status === 'done'
                        ? 'Done'
                        : 'Ready'}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {round.status === 'done' || ended ? null : (
                    <button
                      type="button"
                      onClick={() => setEditing(round.id)}
                      className={secondary}
                    >
                      Edit
                    </button>
                  )}
                  {round.status === 'pending' && !ended ? (
                    <button
                      type="button"
                      disabled={pending || liveRoundId !== null}
                      onClick={() =>
                        run(() => trpc.games.startRound.mutate({gameId, roundId: round.id}))
                      }
                      className={primary}
                    >
                      Start round
                    </button>
                  ) : null}
                  {round.status === 'live' ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => trpc.games.endRound.mutate({gameId, roundId: round.id}))
                      }
                      className={primary}
                    >
                      End round
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-gray-lighter">
                {`${round.deckSlug} · ${round.turnSeconds}s turns · odd one out: ${round.oddRule} · overtime: ${round.overtime}${round.overtime === 'nudge' ? ` ${round.overtimeSeconds}s` : ''}`}
                {round.status === 'pending' ? '' : ` · ${round.pairs} pairs · ${round.turns} turns`}
              </p>
            </li>
          )
        )}
      </ul>

      {editing === 'new' ? (
        <div className="mt-2">
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
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSave({deckSlug: slug, turnSeconds, oddRule, overtime, overtimeSeconds})
      }}
      className="flex flex-col gap-3 rounded-2xl border border-gray-light px-4 py-3"
    >
      <label className="flex flex-col gap-1 text-sm text-gray-lighter">
        Deck
        <select
          value={slug}
          disabled={deckLocked}
          onChange={(event) => setDeckSlug(event.target.value)}
          className={field}
        >
          {decks.data?.map((d) => (
            <option key={d.slug} value={d.slug}>
              {`${d.title} (${d.questions} questions)`}
            </option>
          ))}
        </select>
        {deckLocked ? (
          <span className="text-xs">The deck is fixed once a round starts.</span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-lighter">
        Seconds per turn
        <input
          type="number"
          required
          min={10}
          max={1800}
          value={turnSeconds}
          onChange={(event) => setTurnSeconds(event.target.valueAsNumber)}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-lighter">
        Odd one out
        <select
          value={oddRule}
          onChange={(event) => {
            const {value} = event.target
            if (isOddRule(value)) setOddRule(value)
          }}
          className={field}
        >
          <option value="trio">Joins a pair as a trio</option>
          <option value="sitout">Sits out this round</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-lighter">
        When time is up
        <select
          value={overtime}
          onChange={(event) => {
            const {value} = event.target
            if (isOvertime(value)) setOvertime(value)
          }}
          className={field}
        >
          <option value="nudge">Nudge, then stop after a grace period</option>
          <option value="hard">Stop right away</option>
        </select>
      </label>
      {overtime === 'nudge' ? (
        <label className="flex flex-col gap-1 text-sm text-gray-lighter">
          Grace seconds
          <input
            type="number"
            required
            min={0}
            max={600}
            value={overtimeSeconds}
            onChange={(event) => setOvertimeSeconds(event.target.valueAsNumber)}
            className={field}
          />
        </label>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !slug} className={primary}>
          Save round
        </button>
        <button type="button" onClick={onCancel} className={secondary}>
          Cancel
        </button>
      </div>
    </form>
  )
}
