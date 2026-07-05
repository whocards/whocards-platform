import {Link} from '@tanstack/react-router'

export function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-lg font-semibold">Page not found.</p>
      <Link to="/" className="text-yellow-400 underline">
        Back home
      </Link>
    </div>
  )
}
