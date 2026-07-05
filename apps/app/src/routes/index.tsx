import {createFileRoute, Link, redirect} from '@tanstack/react-router'

import {getCurrentMember} from '~/server/auth/session'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const member = await getCurrentMember()
    if (member?.membership) throw redirect({to: '/decks'})
    return {member}
  },
  component: Home,
})

function Home() {
  const {member} = Route.useRouteContext()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">
        WhoCards <span className="text-yellow-400">@</span> Work
      </h1>
      {member ? (
        <p className="max-w-sm text-gray-lighter">
          You&apos;re signed in as {member.user.email}, but not on the team yet — ask an admin to
          invite you from Admin → People.
        </p>
      ) : (
        <Link to="/sign-in" className="rounded-full bg-yellow-400 px-5 py-3 font-bold text-darker">
          Sign in
        </Link>
      )}
    </div>
  )
}
