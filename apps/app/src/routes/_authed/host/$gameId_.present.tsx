import {createFileRoute, Link} from '@tanstack/react-router'
import {answerModeSchema, qrPath} from '@whocards/game'
import {useRoundTimer} from '@whocards/game/hooks'
import {useMemo} from 'react'

import {roundBrief, roundToBrief} from '~/components/host/round-brief'
import {ANSWER_MODES, isConflict, requireHost, useHostGame} from '~/components/host/use-host-game'
import {Logo} from '~/components/logo'
import {Button} from '~/components/ui/button'
import {cn} from '~/lib/cn'
import {eventLinks} from '~/lib/event-links'
import type {GameDetail} from '~/server/trpc/routers/games'

export const Route = createFileRoute('/_authed/host/$gameId_/present')({
  beforeLoad: requireHost,
  staticData: {bare: true},
  head: () => ({meta: [{title: 'Projector · WhoCards @ Work'}]}),
  component: Present,
})

type RoundRow = GameDetail['rounds'][number]

/** `m:ss`, rounding up so the clock never shows 0:00 while time is left. */
const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const toggleFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

// Sized off the viewport so 1280x720 and 1920x1080 lay out identically.
const screen = 'h-dvh w-full overflow-hidden text-[min(1.9vh,1.07vw)]'

function Present() {
  const {gameId} = Route.useParams()
  const host = useHostGame(gameId)
  const {detail} = host

  if (!detail.data)
    return (
      <div className={cn(screen, 'grid place-items-center text-[2em] text-gray-lighter')}>
        {detail.isLoading ? 'Loading…' : (detail.error?.message ?? 'No such game.')}
      </div>
    )

  const data = detail.data
  const {game} = data
  const round = roundToBrief(data.rounds)
  const offsetMs = data.serverNow - detail.dataUpdatedAt

  return (
    <div className={cn(screen, 'flex flex-col')}>
      <header className="flex items-start justify-between gap-[2em] px-[3em] pt-[2.2em]">
        <div className="min-w-0">
          <h1 className="truncate font-title text-[2.6em] leading-tight font-bold">{game.title}</h1>
          {game.organizer ? (
            <p className="text-[1.3em] text-gray-dark">{`Hosted by ${game.organizer}`}</p>
          ) : null}
        </div>
        <Logo className="shrink-0 text-[2em]" />
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-[2.5em] px-[3em] py-[2em]">
        <div className="flex min-h-0 flex-col gap-[1.6em]">
          {game.status === 'ended' ? (
            <p className="font-title text-[4em] font-bold text-yellow-300">Thanks for playing</p>
          ) : (
            <RoundCard
              round={round}
              draft={game.status === 'lobby'}
              offsetMs={offsetMs}
              lines={
                round
                  ? roundBrief(round, {
                      answerMode: game.answerMode,
                      standby: data.players.some((p) => p.standby),
                    })
                  : []
              }
            />
          )}
          <dl className="mt-auto grid grid-cols-4 gap-[1em]">
            {(['joined', 'paired', 'talking', 'done'] as const).map((k) => (
              <div
                key={k}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/5 px-[1em] py-[0.6em]"
              >
                <dt className="order-2 text-[1.2em] text-gray-dark">{k}</dt>
                <dd className="font-title text-[2.6em] leading-none font-bold tabular-nums">
                  {data.room[k]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {game.status === 'ended' ? null : <JoinCard code={game.code} />}
      </main>

      <ControlBar host={host} data={data} round={round} />
    </div>
  )
}

function RoundCard({
  round,
  draft,
  offsetMs,
  lines,
}: Readonly<{round: RoundRow | null; draft: boolean; offsetMs: number; lines: string[]}>) {
  const timer = useRoundTimer({round, turn: null, offsetMs})
  const live = round?.status === 'live'
  const label = !round ? 'No rounds left' : live ? `Round ${round.n}` : `Up next: Round ${round.n}`
  const status = draft ? 'Not open yet' : live ? null : 'Starting soon'

  return (
    <section className="flex min-h-0 flex-col gap-[1.2em] rounded-3xl border border-white/10 bg-white/[0.04] p-[2em]">
      <div className="flex items-baseline justify-between gap-[1em]">
        <h2 className="font-title text-[2.4em] leading-none font-bold">{label}</h2>
        {live && timer.roundRemainingMs !== null ? (
          <span className="font-mono text-[2.6em] leading-none text-yellow-300 tabular-nums">
            {formatClock(timer.roundRemainingMs)}
          </span>
        ) : status ? (
          <span className="font-title text-[1.6em] font-bold text-yellow-300">{status}</span>
        ) : null}
      </div>
      {lines.length > 0 ? (
        <>
          <p className="text-[1.1em] font-semibold tracking-wider text-gray-dark uppercase">
            How this round works
          </p>
          <ul className="flex flex-col gap-[0.5em] text-[1.6em] leading-snug">
            {lines.map((line) => (
              <li key={line} className="flex gap-[0.6em]">
                <span aria-hidden className="text-yellow-400">
                  •
                </span>
                {line}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

function JoinCard({code}: Readonly<{code: string}>) {
  const {join} = eventLinks(code)
  const {size, d} = useMemo(() => qrPath(join), [join])
  const [path, query] = join.replace(/^https?:\/\//, '').split('?')
  return (
    <aside className="flex w-[24em] flex-col items-center gap-[1em] self-start rounded-3xl border border-yellow-400/20 bg-gradient-to-br from-yellow-400/[0.07] to-primary-dark/[0.07] p-[1.8em]">
      <span className="font-title text-[1.8em] font-bold">Scan to join</span>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        className="w-[min(18em,38vh)] rounded-2xl bg-white p-[0.6em]"
      >
        <title>{`QR code for ${join}`}</title>
        <rect width={size} height={size} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <span className="text-center text-[1.05em] text-gray-lighter">
        {path}
        <wbr />
        {`?${query}`}
      </span>
      <div className="flex flex-col items-center">
        <span className="text-[1em] tracking-wider text-gray-dark uppercase">Game code</span>
        <span className="font-mono text-[2.8em] leading-none font-semibold tracking-[0.2em] text-yellow-300">
          {code}
        </span>
      </div>
      <p className="text-center text-[1.15em] leading-snug text-gray-lighter">
        Scan with your phone camera, enter your name, and pick your language.
      </p>
    </aside>
  )
}

function ControlBar({
  host,
  data,
  round,
}: Readonly<{host: ReturnType<typeof useHostGame>; data: GameDetail; round: RoundRow | null}>) {
  const {act, busy, goLive, endGame, startRound, endRound, setAnswerMode, pendingMode} = host
  const {game} = data
  const ended = game.status === 'ended'
  const draft = game.status === 'lobby'

  const primary = () => {
    if (ended) return null
    if (draft)
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={goLive}
          disabled={act.isPending}
          pending={busy === 'go-live'}
        >
          {busy === 'go-live' ? 'Going live…' : 'Go live'}
        </Button>
      )
    if (!round) return <span className="text-sm text-gray-dark">Add a round on the host page</span>
    const id = round.status === 'live' ? `end:${round.id}` : `start:${round.id}`
    return (
      <Button
        variant="primary"
        size="sm"
        disabled={act.isPending}
        pending={busy === id}
        onClick={() => (round.status === 'live' ? endRound(round.id) : startRound(round.id))}
      >
        {round.status === 'live'
          ? busy === id
            ? 'Ending…'
            : `End round ${round.n}`
          : busy === id
            ? 'Starting…'
            : `Start round ${round.n}`}
      </Button>
    )
  }

  return (
    <nav
      aria-label="Game controls"
      className="flex items-center gap-3 border-t border-white/8 bg-background/80 px-[3em] py-2.5 opacity-50 transition-opacity duration-300 focus-within:opacity-100 hover:opacity-100"
    >
      <Link
        to="/host/$gameId"
        params={{gameId: game.id}}
        className="text-sm text-gray-lighter hover:text-yellow-400"
      >
        ← Host page
      </Link>
      {primary()}
      {ended ? null : (
        <fieldset aria-label="Answer mode" className="flex items-center gap-1">
          <span className="mr-1 text-sm text-gray-dark">Answers</span>
          {answerModeSchema.options.map((m) => (
            <Button
              key={m}
              size="sm"
              variant={m === game.answerMode ? 'selected' : 'ghost'}
              aria-pressed={m === game.answerMode}
              title={ANSWER_MODES[m].hint}
              disabled={act.isPending}
              pending={pendingMode === m}
              onClick={() => {
                if (m !== game.answerMode) setAnswerMode(m)
              }}
            >
              {ANSWER_MODES[m].label}
            </Button>
          ))}
        </fieldset>
      )}
      <p role="alert" className="min-w-0 flex-1 truncate text-right text-sm text-errorOnDark">
        {act.isError
          ? isConflict(act.error)
            ? `${act.error.message} Showing the latest state.`
            : act.error.message
          : host.detail.isError
            ? `Refresh failed: ${host.detail.error.message}`
            : ''}
      </p>
      <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
        Full screen
      </Button>
      {ended ? null : (
        <Button
          variant="danger"
          size="sm"
          onClick={endGame}
          disabled={act.isPending}
          pending={busy === 'end-game'}
        >
          {busy === 'end-game' ? 'Ending…' : 'End game'}
        </Button>
      )}
    </nav>
  )
}
