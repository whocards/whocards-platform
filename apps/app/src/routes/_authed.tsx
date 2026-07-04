import {createFileRoute, Link, Outlet, redirect} from '@tanstack/react-router'

import {authClient} from '~/lib/auth-client'
import {getCurrentMember} from '~/server/auth/session'
import type {CurrentMember} from '~/server/auth/session'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async (): Promise<CurrentMember> => {
    const member = await getCurrentMember()
    if (!member) throw redirect({to: '/sign-in'})
    return member
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const {user, membership} = Route.useRouteContext()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-light px-6 py-4">
        <Link to="/" className="font-bold">
          WhoCards <span className="text-yellow-400">@</span> Work
        </Link>
        <div className="flex items-center gap-4 text-sm text-gray-lighter">
          <span>{user.email}</span>
          {membership ? <span className="text-yellow-400">{membership.role}</span> : null}
          <button
            type="button"
            onClick={() =>
              authClient.signOut({fetchOptions: {onSuccess: () => location.assign('/sign-in')}})
            }
            className="rounded-full bg-gray-light px-3 py-1.5 font-semibold text-white"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1">
        {membership ? (
          <Outlet />
        ) : (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-lg font-semibold">You&apos;re signed in, but not on the team yet.</p>
            <p className="max-w-sm text-gray-lighter">
              Ask an admin to invite {user.email} from Admin → People.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
