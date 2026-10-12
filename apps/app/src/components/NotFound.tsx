import {Link} from '@tanstack/react-router'

import {AuthScreen} from '~/components/auth-screen'
import {buttonVariants} from '~/components/ui/button'

export function NotFound() {
  return (
    <AuthScreen>
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-title text-6xl leading-none font-bold text-yellow-400">404</p>
        <h1 className="font-title text-3xl font-bold tracking-wide">Page not found</h1>
        <p className="text-gray-lighter">That link doesn’t go anywhere.</p>
      </div>
      <Link
        to="/"
        className={buttonVariants({variant: 'primary', size: 'lg', className: 'w-full'})}
      >
        Back home
      </Link>
    </AuthScreen>
  )
}
