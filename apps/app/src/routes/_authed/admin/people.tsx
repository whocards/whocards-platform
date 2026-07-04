import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createFileRoute, redirect} from '@tanstack/react-router'
import {useState} from 'react'

import {trpc} from '~/lib/trpc'
import {ROLE_RANK, roleAtLeast} from '~/server/auth/permissions'
import type {AppRole} from '~/server/auth/permissions'

export const Route = createFileRoute('/_authed/admin/people')({
  beforeLoad: ({context}) => {
    if (!context.membership || !roleAtLeast(context.membership.role, 'admin')) {
      throw redirect({to: '/'})
    }
  },
  component: People,
})

function People() {
  const queryClient = useQueryClient()
  const people = useQuery({queryKey: ['people.list'], queryFn: () => trpc.people.list.query()})

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AppRole>('reviewer')

  const invite = useMutation({
    mutationFn: () => trpc.people.invite.mutate({email, role}),
    onSuccess: () => {
      setEmail('')
      queryClient.invalidateQueries({queryKey: ['people.list']})
    },
  })

  const updateRole = useMutation({
    mutationFn: (input: {userId: string; role: AppRole}) => trpc.people.updateRole.mutate(input),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['people.list']}),
  })

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-xl font-bold">People</h1>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          invite.mutate()
        }}
        className="mb-8 flex flex-wrap items-center gap-2"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="teammate@company.com"
          className="rounded-full bg-gray-light px-4 py-2 text-white placeholder:text-gray-dark"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as AppRole)}
          className="rounded-full bg-gray-light px-3 py-2 text-white"
        >
          {ROLE_RANK.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={invite.isPending}
          className="rounded-full bg-yellow-400 px-4 py-2 font-bold text-darker disabled:opacity-60"
        >
          Invite
        </button>
        {invite.isError ? <p className="w-full text-sm text-red">{invite.error.message}</p> : null}
      </form>

      {people.isLoading ? <p className="text-gray-lighter">Loading…</p> : null}
      {people.isError ? <p className="text-red">{people.error.message}</p> : null}

      <ul className="flex flex-col gap-2">
        {people.data?.map((person) => (
          <li
            key={person.userId}
            className="flex items-center justify-between gap-3 rounded-2xl bg-gray-light/40 px-4 py-3"
          >
            <div>
              <p className="font-semibold">{person.email}</p>
              <p className="text-xs text-gray-lighter">
                joined {new Date(person.joinedAt).toLocaleDateString()}
              </p>
            </div>
            <select
              value={person.role}
              onChange={(event) =>
                updateRole.mutate({userId: person.userId, role: event.target.value as AppRole})
              }
              className="rounded-full bg-darker px-3 py-1.5 text-sm text-white"
            >
              {ROLE_RANK.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}
