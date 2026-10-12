import {cn} from '~/lib/cn'

export function Progress({className, ...props}: React.ComponentProps<'progress'>) {
  return (
    <progress
      className={cn(
        'h-1.5 appearance-none overflow-hidden rounded-full bg-white/8 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-yellow-400 [&::-webkit-progress-bar]:bg-white/8 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-gradient-to-r [&::-webkit-progress-value]:from-yellow-500 [&::-webkit-progress-value]:to-yellow-300',
        className
      )}
      {...props}
    />
  )
}
