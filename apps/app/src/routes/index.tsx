import {createFileRoute, Link, redirect} from '@tanstack/react-router'

import {AuthScreen} from '~/components/auth-screen'
import {buttonVariants} from '~/components/ui/button'
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
    <AuthScreen>
      {member ? (
        <p className="text-center text-gray-lighter">
          You&apos;re signed in as <span className="text-white">{member.user.email}</span>, but not
          on the team yet. Ask an admin to invite you from People.
        </p>
      ) : (
        <Link
          to="/sign-in"
          className={buttonVariants({variant: 'primary', size: 'lg', className: 'w-full'})}
        >
          Sign in
        </Link>
      )}
    </AuthScreen>
  )
}
