import {ErrorComponent, Link, useRouter} from '@tanstack/react-router'
import type {ErrorComponentProps} from '@tanstack/react-router'

export function DefaultCatchBoundary({error}: ErrorComponentProps) {
  const router = useRouter()

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
      <ErrorComponent error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => router.invalidate()}
          className="rounded-full bg-gray-light px-4 py-2 text-sm font-bold text-white uppercase"
        >
          Try again
        </button>
        <Link
          to="/"
          className="rounded-full bg-gray-light px-4 py-2 text-sm font-bold text-white uppercase"
        >
          Home
        </Link>
      </div>
    </div>
  )
}
