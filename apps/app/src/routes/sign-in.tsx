import {createServerFn} from '@tanstack/react-start'
import {createFileRoute, redirect} from '@tanstack/react-router'
import {useState} from 'react'

import {AuthScreen} from '~/components/auth-screen'
import {ErrorText} from '~/components/page'
import {Button} from '~/components/ui/button'
import {Input} from '~/components/ui/field'
import {authClient} from '~/lib/auth-client'
import {getCurrentMember} from '~/server/auth/session'
import {googleAuthEnabled} from '@whocards/env/app'

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
    <AuthScreen>
      {status === 'sent' ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-title text-4xl font-bold tracking-wide">Check your inbox</h1>
          <p className="text-gray-lighter">
            We sent a sign-in link to <span className="text-white">{email}</span>.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setStatus('idle')}>
            Use a different email
          </Button>
        </div>
      ) : (
        <>
          <div className="text-center">
            <h1 className="font-title text-4xl font-bold tracking-wide">Sign in</h1>
            <p className="mt-2 text-gray-lighter">Review decks and run live games.</p>
          </div>
          <form
            onSubmit={(event) => {
              void submit(event)
            }}
            className="flex w-full flex-col gap-3"
          >
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              aria-label="Email"
              className="h-12"
            />
            <Button type="submit" variant="primary" size="lg" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
            </Button>
            {status === 'error' ? (
              <ErrorText className="text-center">
                Couldn&apos;t send that link — try again in a moment.
              </ErrorText>
            ) : null}
          </form>
          {googleEnabled ? (
            <>
              <div className="flex w-full items-center gap-3 text-xs text-gray-dark">
                <span className="h-px flex-1 bg-white/10" />
                or
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <Button
                variant="accent"
                size="lg"
                className="w-full"
                onClick={() => {
                  void authClient.signIn.social({provider: 'google', callbackURL: '/'})
                }}
              >
                Continue with Google
              </Button>
            </>
          ) : null}
        </>
      )}
    </AuthScreen>
  )
}
