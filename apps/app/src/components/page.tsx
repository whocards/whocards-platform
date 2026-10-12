import {Link} from '@tanstack/react-router'
import type {LinkProps} from '@tanstack/react-router'

import {cn} from '~/lib/cn'

export function Page({className, ...props}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-12', className)}
      {...props}
    />
  )
}

export function PageHeader({
  title,
  description,
  eyebrow,
  back,
  actions,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  back?: {to: LinkProps['to']; label: string}
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <header className="mb-8 md:mb-10">
      {back ? (
        <Link
          to={back.to}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-dark transition-colors hover:text-yellow-400"
        >
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
          <h1 className="font-title text-4xl leading-none font-bold tracking-wide md:text-5xl">
            {title}
          </h1>
          {description ? <p className="mt-3 max-w-2xl text-gray-lighter">{description}</p> : null}
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

export function SectionTitle({
  children,
  aside,
  className,
}: {
  children: React.ReactNode
  aside?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex items-center justify-between gap-3', className)}>
      <h2 className="font-title text-2xl font-bold tracking-wide">{children}</h2>
      {aside}
    </div>
  )
}

export function Empty({children}: {children: React.ReactNode}) {
  return (
    <p className="rounded-2.5xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-gray-dark">
      {children}
    </p>
  )
}

export function ErrorText({children, className}: {children: React.ReactNode; className?: string}) {
  return <p className={cn('text-sm text-errorOnDark', className)}>{children}</p>
}
