import {Logo} from '~/components/logo'

export function AuthScreen({children}: {children: React.ReactNode}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <Logo className="text-4xl" />
        <div className="flex w-full flex-col items-center gap-5 rounded-3xl border border-white/10 bg-background/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-md md:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
