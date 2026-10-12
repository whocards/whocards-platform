import {cn} from '~/lib/cn'

export function Logo({className}: {className?: string}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <img src="/logo.svg" alt="WhoCards" className="h-[1em] w-auto" />
      <span className="font-title text-[0.85em] leading-none font-bold tracking-wide text-gray-lighter">
        @ Work
      </span>
    </span>
  )
}
