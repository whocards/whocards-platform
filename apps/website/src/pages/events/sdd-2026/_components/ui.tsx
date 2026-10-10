import type {ButtonHTMLAttributes, ReactNode} from 'react'

import {qrPath} from '@whocards/game'
import {cn} from '~utils/cn'

type Variant = 'primary' | 'ghost'

export const buttonClass = (variant: Variant = 'primary') =>
  cn(
    'btn h-14 w-full rounded-full text-lg normal-case',
    variant === 'primary'
      ? 'bg-darkest text-primary-light hover:bg-dark border-none'
      : 'btn-ghost text-darkest border-darkest/20 border'
  )

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {variant?: Variant}

export const Button = ({variant, className, type = 'button', ...props}: ButtonProps) => (
  <button type={type} className={cn(buttonClass(variant), className)} {...props} />
)

export const Notice = ({children, onDismiss}: {children: ReactNode; onDismiss?: () => void}) => (
  <output className='bg-primary-light text-darkest flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3'>
    <span>{children}</span>
    {onDismiss && (
      <button
        type='button'
        aria-label='Dismiss'
        className='text-xl leading-none'
        onClick={onDismiss}
      >
        ×
      </button>
    )}
  </output>
)

export const Screen = ({title, children}: {title?: string; children: ReactNode}) => (
  <section className='flex w-full flex-col items-center gap-5 py-6'>
    {title && <h1 className='font-title text-center text-3xl font-semibold'>{title}</h1>}
    {children}
  </section>
)

export const inputClass =
  'input bg-white text-darkest border-darkest/20 h-14 w-full rounded-2xl text-lg focus:outline-primary-dark'

export const QrCode = ({value, className}: {value: string; className?: string}) => {
  const {size, d} = qrPath(value)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#08001a"/></svg>`
  return (
    <img
      src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
      alt={value}
      className={cn('aspect-square rounded-xl [image-rendering:pixelated]', className)}
    />
  )
}
