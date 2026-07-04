import {createServerFn} from '@tanstack/react-start'
import {createFileRoute, redirect} from '@tanstack/react-router'
import {useState} from 'react'

import {authClient} from '~/lib/auth-client'
import {getCurrentMember} from '~/server/auth/session'
import {googleAuthEnabled} from '~/server/env'

const getAuthProviders = createServerFn({method: 'GET'}).handler(async () => ({
  googleEnabled: googleAuthEnabled,
}))

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async () => {
    const member = await getCurrentMember()
    if (member) throw redirect({to: '/'})
  },
  loader: () => getAuthProviders(),
  component: SignIn,
})

function SignIn() {
  const {googleEnabled} = Route.useLoaderData()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus('sending')
    const {error} = await authClient.signIn.magicLink({email, callbackURL: '/'})
    setStatus(error ? 'error' : 'sent')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">
        WhoCards <span className="text-yellow-400">@</span> Work
      </h1>
      {status === 'sent' ? (
        <p className="max-w-sm text-center text-gray-lighter">
          Check <span className="text-white">{email}</span> for a sign-in link.
        </p>
      ) : (
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="rounded-full bg-gray-light px-4 py-3 text-white placeholder:text-gray-dark"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="rounded-full bg-yellow-400 px-4 py-3 font-bold text-darker disabled:opacity-60"
          >
            {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
          </button>
          {status === 'error' ? (
            <p className="text-center text-sm text-red">
              Couldn&apos;t send that link — try again in a moment.
            </p>
          ) : null}
        </form>
      )}
      {googleEnabled ? (
        <button
          type="button"
          onClick={() => authClient.signIn.social({provider: 'google', callbackURL: '/'})}
          className="rounded-full border border-gray-light px-4 py-3 text-sm font-semibold"
        >
          Continue with Google
        </button>
      ) : null}
    </div>
  )
}
