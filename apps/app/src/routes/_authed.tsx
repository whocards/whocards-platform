import {createFileRoute, Link, Outlet, redirect} from '@tanstack/react-router'
import {useState} from 'react'

import {authClient} from '~/lib/auth-client'
import {roleAtLeast} from '~/server/auth/permissions'
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

const signOut = () =>
  authClient.signOut({fetchOptions: {onSuccess: () => location.assign('/sign-in')}})

/** Every authed page gets this nav (founder feedback, 2026-07-05: "there's no
 *  way to navigate"). One breakpoint: a hamburger + slide-down panel below
 *  md (768px), a plain inline row above it — see app.css's `.md\:flex` etc. */
function AuthedLayout() {
  const {user, membership} = Route.useRouteContext()
  const [menuOpen, setMenuOpen] = useState(false)
  const isAdmin = membership ? roleAtLeast(membership.role, 'admin') : false

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-light">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6 md:py-4">
          <Link to="/" className="shrink-0 font-bold" onClick={() => setMenuOpen(false)}>
            WhoCards <span className="text-yellow-400">@</span> Work
          </Link>

          <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Main">
            <Link to="/" activeOptions={{exact: true}} activeProps={{className: 'text-yellow-400'}}>
              Home
            </Link>
            <Link to="/decks" activeProps={{className: 'text-yellow-400'}}>
              Decks
            </Link>
            {isAdmin ? (
              <Link to="/admin/people" activeProps={{className: 'text-yellow-400'}}>
                Admin › People
              </Link>
            ) : null}
          </nav>

          <div className="hidden items-center gap-4 text-sm text-gray-lighter md:flex">
            <span>{user.email}</span>
            {membership ? <span className="text-yellow-400">{membership.role}</span> : null}
            <button
              type="button"
              onClick={signOut}
              className="flex min-h-11 items-center justify-center rounded-full bg-gray-light px-4 font-semibold text-white"
            >
              Sign out
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-gray-light md:hidden"
          >
            <span className="hamburger-icon">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>

        {menuOpen ? (
          <nav
            className="flex flex-col gap-1 border-t border-gray-light px-4 py-3 md:hidden"
            aria-label="Main"
          >
            <Link
              to="/"
              onClick={() => setMenuOpen(false)}
              activeOptions={{exact: true}}
              activeProps={{className: 'text-yellow-400'}}
              className="flex min-h-11 items-center rounded-xl px-3 py-2"
            >
              Home
            </Link>
            <Link
              to="/decks"
              onClick={() => setMenuOpen(false)}
              activeProps={{className: 'text-yellow-400'}}
              className="flex min-h-11 items-center rounded-xl px-3 py-2"
            >
              Decks
            </Link>
            {isAdmin ? (
              <Link
                to="/admin/people"
                onClick={() => setMenuOpen(false)}
                activeProps={{className: 'text-yellow-400'}}
                className="flex min-h-11 items-center rounded-xl px-3 py-2"
              >
                Admin › People
              </Link>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-gray-light/40 pt-3">
              <div className="text-sm text-gray-lighter">
                <p>{user.email}</p>
                {membership ? <p className="text-yellow-400">{membership.role}</p> : null}
              </div>
              <button
                type="button"
                onClick={signOut}
                className="flex min-h-11 shrink-0 items-center justify-center rounded-full bg-gray-light px-4 text-sm font-semibold text-white"
              >
                Sign out
              </button>
            </div>
          </nav>
        ) : null}
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
