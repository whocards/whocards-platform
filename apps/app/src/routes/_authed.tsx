import {createFileRoute, Link, Outlet, redirect, useMatches} from '@tanstack/react-router'
import {useState} from 'react'

import {Logo} from '~/components/logo'
import {Page, PageHeader} from '~/components/page'
import {Button} from '~/components/ui/button'
import {authClient} from '~/lib/auth-client'
import {roleAtLeast} from '~/server/auth/permissions'
import {getCurrentMember} from '~/server/auth/session'
import type {CurrentMember} from '~/server/auth/session'

declare module '@tanstack/react-router' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- module augmentation only merges into an interface
  interface StaticDataRouteOption {
    /** Full-screen page: no app header. */
    bare?: boolean
  }
}

export const Route = createFileRoute('/_authed')({
  beforeLoad: async (): Promise<CurrentMember> => {
    const member = await getCurrentMember()
    if (!member) throw redirect({to: '/sign-in'})
    return member
  },
  component: AuthedLayout,
})

const signOut = () => {
  void authClient.signOut({fetchOptions: {onSuccess: () => location.assign('/sign-in')}})
}

const navLink =
  'flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-gray-lighter transition-colors hover:bg-white/5 hover:text-white md:min-h-9'
const navActive = {
  className: 'bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/10 hover:text-yellow-400',
}

function AuthedLayout() {
  const {user, membership} = Route.useRouteContext()
  const [menuOpen, setMenuOpen] = useState(false)
  const bare = useMatches({select: (matches) => matches.some((m) => m.staticData.bare)})
  const isAdmin = membership ? roleAtLeast(membership.role, 'admin') : false
  const isHost = membership ? roleAtLeast(membership.role, 'facilitator') : false
  const close = () => setMenuOpen(false)

  if (bare && membership) return <Outlet />

  const links = (
    <>
      <Link to="/decks" onClick={close} activeProps={navActive} className={navLink}>
        Decks
      </Link>
      {isHost ? (
        <Link to="/host" onClick={close} activeProps={navActive} className={navLink}>
          Host
        </Link>
      ) : null}
      {isAdmin ? (
        <Link to="/admin/people" onClick={close} activeProps={navActive} className={navLink}>
          People
        </Link>
      ) : null}
    </>
  )

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-background/75 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 md:px-8">
          <Link
            to="/"
            className="shrink-0 text-2xl"
            onClick={close}
            aria-label="WhoCards @ Work home"
          >
            <Logo />
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
            {links}
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            <Account email={user.email} role={membership?.role} />
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>

          <Button
            variant="secondary"
            size="icon"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="ml-auto md:hidden"
          >
            <span className="flex w-4.5 flex-col gap-1">
              <span className="h-0.5 rounded-full bg-current" />
              <span className="h-0.5 rounded-full bg-current" />
              <span className="h-0.5 rounded-full bg-current" />
            </span>
          </Button>
        </div>

        {menuOpen ? (
          <nav
            className="flex flex-col gap-1 border-t border-white/8 px-4 py-3 md:hidden"
            aria-label="Main"
          >
            {links}
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/8 pt-3">
              <Account email={user.email} role={membership?.role} />
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </nav>
        ) : null}
      </header>
      <main className="flex-1">
        {membership ? (
          <Outlet />
        ) : (
          <Page className="text-center">
            <PageHeader title="Not on the team yet" />
            <p className="text-gray-lighter">Ask an admin to invite {user.email} from People.</p>
          </Page>
        )}
      </main>
    </div>
  )
}

function Account({email, role}: Readonly<{email: string; role: string | undefined}>) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-primary font-title text-lg font-bold text-darkest uppercase">
        {email.charAt(0)}
      </span>
      <div className="min-w-0 text-xs leading-tight">
        <p className="truncate text-gray-lighter">{email}</p>
        {role ? <p className="font-semibold text-accentOnDark capitalize">{role}</p> : null}
      </div>
    </div>
  )
}
