import {cva} from 'class-variance-authority'
import type {VariantProps} from 'class-variance-authority'

import {cn} from '~/lib/cn'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-yellow-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-yellow-400 text-darkest hover:bg-yellow-300',
        accent: 'border border-primary-dark text-accentOnDark hover:bg-primary-dark/15',
        secondary: 'border border-white/10 bg-white/5 text-white hover:bg-white/10',
        selected:
          'border border-yellow-400/50 bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/15',
        ghost: 'text-gray-lighter hover:bg-white/5 hover:text-white',
        danger: 'border border-errorOnDark/40 text-errorOnDark hover:bg-errorOnDark/10',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-sm',
        lg: 'h-14 px-6 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: {variant: 'secondary', size: 'md'},
  }
)

type ButtonVariants = VariantProps<typeof buttonVariants>

export function Spinner({className}: Readonly<{className?: string}>) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none',
        className
      )}
    />
  )
}

export function Button({
  className,
  variant,
  size,
  type = 'button',
  pending = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> & ButtonVariants & {pending?: boolean}) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cn(buttonVariants({variant, size}), className)}
      {...props}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  )
}
