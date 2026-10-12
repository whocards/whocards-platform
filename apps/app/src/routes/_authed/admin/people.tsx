import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createFileRoute, redirect} from '@tanstack/react-router'
import {useState} from 'react'

import {ErrorText, Page, PageHeader, SectionTitle} from '~/components/page'
import {Button} from '~/components/ui/button'
import {Card} from '~/components/ui/card'
import {Input, Label, Select} from '~/components/ui/field'
import {trpc} from '~/lib/trpc'
import {isAppRole, ROLE_RANK, roleAtLeast} from '~/server/auth/permissions'
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
      void queryClient.invalidateQueries({queryKey: ['people.list']})
    },
  })

  const updateRole = useMutation({
    mutationFn: (input: {userId: string; role: AppRole}) => trpc.people.updateRole.mutate(input),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['people.list']}),
  })

  return (
    <Page>
      <PageHeader title="People" description="Invite teammates and choose what they can do." />

      <Card className="mb-10">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            invite.mutate()
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Label label="Email" className="flex-1">
            <Input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@company.com"
            />
          </Label>
          <Label label="Role" className="sm:w-44">
            <Select
              value={role}
              onChange={(event) => {
                // <option> values are always ROLE_RANK below, so this only fails on a
                // tampered DOM value — bail rather than cast.
                const {value} = event.target
                if (isAppRole(value)) setRole(value)
              }}
              className="capitalize"
            >
              {ROLE_RANK.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Label>
          <Button type="submit" variant="primary" disabled={invite.isPending}>
            Invite
          </Button>
        </form>
        {invite.isError ? <ErrorText className="mt-3">{invite.error.message}</ErrorText> : null}
      </Card>

      <SectionTitle
        aside={
          people.data ? <span className="text-sm text-gray-dark">{people.data.length}</span> : null
        }
      >
        Team
      </SectionTitle>
      {people.isLoading ? <p className="text-gray-dark">Loading…</p> : null}
      {people.isError ? <ErrorText>{people.error.message}</ErrorText> : null}

      <ul className="flex flex-col gap-2">
        {people.data?.map((person) => (
          <li
            key={person.userId}
            className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] py-2.5 pr-2.5 pl-3"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8 font-title text-lg font-bold text-yellow-400 uppercase">
              {person.email.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold wrap-anywhere">{person.email}</p>
              <p className="text-xs text-gray-dark">
                {`Joined ${new Date(person.joinedAt).toLocaleDateString()}`}
              </p>
            </div>
            <Select
              aria-label={`Role for ${person.email}`}
              value={person.role}
              onChange={(event) => {
                const {value} = event.target
                if (isAppRole(value)) updateRole.mutate({userId: person.userId, role: value})
              }}
              className="w-auto shrink-0 text-sm capitalize"
            >
              {ROLE_RANK.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
    </Page>
  )
}
