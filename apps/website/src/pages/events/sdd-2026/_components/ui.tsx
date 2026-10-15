import type {ButtonHTMLAttributes, ReactNode} from 'react'

import {qrPath} from '@whocards/game'
import {cn} from '~utils/cn'

type Variant = 'primary' | 'ghost'

export const buttonClass = (variant: Variant = 'primary') =>
  cn(
    'inline-flex h-14 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 text-lg font-semibold transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-yellow-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary'
      ? 'bg-yellow-400 text-darkest hover:bg-yellow-300'
      : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
  )

/** Toggle chips (language, rating): yellow-tinted when picked, like the host app. */
export const choiceClass = (selected: boolean) =>
  cn(
    'cursor-pointer rounded-2xl border text-lg transition-colors',
    selected
      ? 'border-yellow-400/60 bg-yellow-400/10 text-yellow-300'
      : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
  )

export const Spinner = ({className}: {className?: string}) => (
  <span
    aria-hidden='true'
    className={cn(
      'inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none',
      className
    )}
  />
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  /** A network call is in flight: disabled, with a spinner beside the label. */
  pending?: boolean
}

export const Button = ({
  variant,
  className,
  type = 'button',
  pending = false,
  disabled,
  children,
  ...props
}: ButtonProps) => (
  <button
    type={type}
    className={cn(
      buttonClass(variant),
      pending && 'disabled:cursor-progress disabled:opacity-80',
      className
    )}
    disabled={disabled || pending}
    aria-busy={pending || undefined}
    {...props}
  >
    {pending && <Spinner />}
    {children}
  </button>
)

export const Notice = ({children, onDismiss}: {children: ReactNode; onDismiss?: () => void}) => (
  <output className='flex w-full items-center justify-between gap-3 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-yellow-300'>
    <span>{children}</span>
    {onDismiss && (
      <button
        type='button'
        aria-label='Dismiss'
        className='cursor-pointer text-xl leading-none'
        onClick={onDismiss}
      >
        ×
      </button>
    )}
  </output>
)

export const Screen = ({title, children}: {title?: string; children: ReactNode}) => (
  <section className='flex w-full flex-col items-center gap-5 py-6'>
    {title && <h1 className='font-title text-center text-3xl font-bold'>{title}</h1>}
    {children}
  </section>
)

/** Calm, centred wait state for the first load: no content to jump from. */
export const Loading = ({label, className}: {label: string; className?: string}) => (
  <output className={cn('flex flex-1 flex-col items-center justify-center gap-4 py-24', className)}>
    <Spinner className='size-10 border-[3px] text-yellow-400' />
    <span className='text-gray-dark'>{label}</span>
  </output>
)

export const inputClass =
  'h-14 w-full rounded-2xl border border-white/10 bg-darkest/60 px-4 text-lg text-white transition-colors outline-none placeholder:text-gray-dark hover:border-white/20 focus-visible:border-yellow-400/70 focus-visible:ring-2 focus-visible:ring-yellow-400/25'

export const textareaClass =
  'w-full rounded-2xl border border-white/10 bg-darkest/60 p-4 text-lg text-white outline-none placeholder:text-gray-dark focus-visible:border-yellow-400/70 focus-visible:ring-2 focus-visible:ring-yellow-400/25'

export const QrCode = ({value, className}: {value: string; className?: string}) => {
  const {size, d} = qrPath(value)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#08001a"/></svg>`
  return (
    <img
      src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
      alt={value}
      className={cn('aspect-square rounded-2xl [image-rendering:pixelated]', className)}
    />
  )
}
