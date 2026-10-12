import {Link, useRouter} from '@tanstack/react-router'
import type {ErrorComponentProps} from '@tanstack/react-router'

import {AuthScreen} from '~/components/auth-screen'
import {ErrorText} from '~/components/page'
import {Button, buttonVariants} from '~/components/ui/button'

export function DefaultCatchBoundary({error}: ErrorComponentProps) {
  const router = useRouter()

  return (
    <AuthScreen>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-title text-3xl font-bold tracking-wide">Something went wrong</h1>
        <ErrorText className="break-words">
          {error instanceof Error ? error.message : String(error)}
        </ErrorText>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            void router.invalidate()
          }}
        >
          Try again
        </Button>
        <Link to="/" className={buttonVariants({variant: 'ghost', size: 'lg'})}>
          Home
        </Link>
      </div>
    </AuthScreen>
  )
}
