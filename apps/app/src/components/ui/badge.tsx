import {cva} from 'class-variance-authority'
import type {VariantProps} from 'class-variance-authority'

import {cn} from '~/lib/cn'

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-white/10 bg-white/5 text-gray-lighter',
        live: 'live-glow border-yellow-400/40 bg-yellow-400/10 text-yellow-400',
        good: 'border-yellow-400/30 text-yellow-400',
        accent: 'border-primary-dark/50 bg-primary-dark/10 text-accentOnDark',
        muted: 'border-transparent text-gray-dark',
      },
    },
    defaultVariants: {tone: 'neutral'},
  }
)

export function Badge({
  className,
  tone,
  children,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({tone}), className)} {...props}>
      {tone === 'live' ? (
        <span className="size-1.5 animate-pulse rounded-full bg-yellow-400 motion-reduce:animate-none" />
      ) : null}
      {children}
    </span>
  )
}
