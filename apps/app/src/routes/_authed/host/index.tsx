import {useMutation, useQuery} from '@tanstack/react-query'
import {createFileRoute, Link, redirect, useNavigate} from '@tanstack/react-router'
import {useState} from 'react'

import {Empty, ErrorText, Page, PageHeader, SectionTitle} from '~/components/page'
import {Badge} from '~/components/ui/badge'
import {Button} from '~/components/ui/button'
import {Card} from '~/components/ui/card'
import {Input, Label} from '~/components/ui/field'
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

const STATUS_LABEL = {lobby: 'Draft', live: 'Live', ended: 'Ended'} as const

function HostGames() {
  const navigate = useNavigate()
  const games = useQuery({queryKey: ['games.list'], queryFn: () => trpc.games.list.query()})
  const [title, setTitle] = useState('')
  const [organizer, setOrganizer] = useState('')

  const create = useMutation({
    mutationFn: () => trpc.games.create.mutate({title, organizer}),
    onSuccess: (game) => navigate({to: '/host/$gameId', params: {gameId: game.id}}),
  })

  return (
    <Page>
      <PageHeader
        title="Host a workshop"
        description="Create a draft, set up the rounds, then go live and put the code on the projector."
      />

      <Card className="mb-10">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Label label="Workshop name" className="flex-1">
            <Input
              required
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="SDD 2026 · main room"
            />
          </Label>
          <Label label="Hosted by" className="flex-1">
            <Input
              required
              maxLength={80}
              value={organizer}
              onChange={(event) => setOrganizer(event.target.value)}
              placeholder="Conference or company"
            />
          </Label>
          <Button type="submit" variant="primary" pending={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create draft'}
          </Button>
        </form>
        {create.isError ? <ErrorText className="mt-3">{create.error.message}</ErrorText> : null}
      </Card>

      <SectionTitle>Your workshops</SectionTitle>
      {games.isLoading ? (
        <ul aria-busy aria-label="Loading workshops" className="flex flex-col gap-3">
          {['a', 'b', 'c'].map((k) => (
            <li
              key={k}
              className="h-21 animate-pulse rounded-2.5xl bg-white/[0.05] motion-reduce:animate-none"
            />
          ))}
        </ul>
      ) : null}
      {games.isError ? <ErrorText>{games.error.message}</ErrorText> : null}
      {games.data?.length === 0 ? <Empty>No games yet. Create one above.</Empty> : null}

      <ul className="flex flex-col gap-3">
        {games.data?.map((game) => (
          <li key={game.id}>
            <Link
              to="/host/$gameId"
              params={{gameId: game.id}}
              className="group flex items-center gap-4 rounded-2.5xl border border-white/8 bg-white/[0.035] px-5 py-4 transition-colors hover:border-yellow-400/40 hover:bg-white/[0.06]"
            >
              <span className="font-title text-2xl font-bold tracking-widest text-yellow-400">
                {game.code}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{game.title}</p>
                {game.organizer ? (
                  <p className="truncate text-sm text-gray-lighter">{`Hosted by ${game.organizer}`}</p>
                ) : null}
                <p className="text-xs text-gray-dark">
                  {[
                    `${game.players} players`,
                    `${game.rounds} rounds`,
                    new Date(game.createdAt).toLocaleDateString(),
                    game.createdBy ? `created by ${game.createdBy}` : null,
                    game.facilitators.length > 0 ? `with ${game.facilitators.join(', ')}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Badge tone={game.status === 'live' ? 'live' : 'neutral'}>
                {STATUS_LABEL[game.status]}
              </Badge>
              <span className="text-gray-dark transition-transform group-hover:translate-x-0.5 group-hover:text-yellow-400">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}
