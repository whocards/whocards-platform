import {cn} from '~/lib/cn'

export function Card({className, ...props}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-2.5xl border border-white/8 bg-white/[0.035] p-5', className)}
      {...props}
    />
  )
}
