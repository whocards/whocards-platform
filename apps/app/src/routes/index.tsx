import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-bold">
        WhoCards <span className="text-yellow-400">@</span> Work
      </h1>
      <p className="text-gray-lighter">Foundation deploy is live.</p>
    </div>
  )
}
