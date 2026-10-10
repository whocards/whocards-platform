import {useMutation, useQuery} from '@tanstack/react-query'
import {createFileRoute, Link, redirect, useNavigate} from '@tanstack/react-router'
import {useState} from 'react'

import {trpc} from '~/lib/trpc'
import {roleAtLeast} from '~/server/auth/permissions'

export const Route = createFileRoute('/_authed/host/')({
  beforeLoad: ({context}) => {
    if (!context.membership || !roleAtLeast(context.membership.role, 'facilitator')) {
      throw redirect({to: '/'})
    }
  },
  component: HostGames,
})

const STATUS_LABEL = {lobby: 'Lobby', live: 'Live', ended: 'Ended'} as const

function HostGames() {
  const navigate = useNavigate()
  const games = useQuery({queryKey: ['games.list'], queryFn: () => trpc.games.list.query()})
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: () => trpc.games.create.mutate({title}),
    onSuccess: (game) => navigate({to: '/host/$gameId', params: {gameId: game.id}}),
  })

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold md:text-2xl">Host a game</h1>
        <p className="mt-1 text-sm text-gray-lighter">
          Create a game, put its code on the projector, run the rounds.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
        className="mb-8 flex flex-wrap items-center gap-2"
      >
        <input
          required
          maxLength={80}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="SDD 2026 · main room"
          aria-label="Game title"
          className="rounded-full bg-gray-light px-4 py-2 text-white placeholder:text-gray-dark"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-full bg-yellow-400 px-4 py-2 font-bold text-darker disabled:opacity-60"
        >
          Create game
        </button>
        {create.isError ? <p className="w-full text-sm text-red">{create.error.message}</p> : null}
      </form>

      {games.isLoading ? <p className="text-gray-lighter">Loading…</p> : null}
      {games.isError ? <p className="text-red">{games.error.message}</p> : null}
      {games.data?.length === 0 ? <p className="text-gray-lighter">No games yet.</p> : null}

      <ul className="flex flex-col gap-2">
        {games.data?.map((game) => (
          <li key={game.id}>
            <Link
              to="/host/$gameId"
              params={{gameId: game.id}}
              className="flex items-center justify-between gap-3 rounded-2xl bg-gray-light/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold">{game.title}</p>
                <p className="text-xs text-gray-lighter">
                  {`${game.code} · ${game.players} players · ${game.rounds} rounds · ${new Date(game.createdAt).toLocaleDateString()}`}
                </p>
              </div>
              <span
                className={
                  game.status === 'live' ? 'text-sm text-yellow-400' : 'text-sm text-gray-lighter'
                }
              >
                {STATUS_LABEL[game.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
