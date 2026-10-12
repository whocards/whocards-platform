import {cn} from '~/lib/cn'

const control =
  'w-full rounded-xl border border-white/10 bg-darkest/60 px-4 text-white transition-colors outline-none placeholder:text-gray-dark hover:border-white/20 focus-visible:border-yellow-400/70 focus-visible:ring-2 focus-visible:ring-yellow-400/25 disabled:opacity-50'

export function Input({className, ...props}: React.ComponentProps<'input'>) {
  return <input className={cn(control, 'h-11', className)} {...props} />
}

export function Textarea({className, ...props}: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'py-3', className)} {...props} />
}

export function Select({className, ...props}: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        control,
        'h-11 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2016%2016%27%20fill%3D%27%239698af%27%3E%3Cpath%20d%3D%27M4%206l4%204%204-4%27/%3E%3C/svg%3E")] bg-[length:1rem] bg-[right_0.875rem_center] bg-no-repeat pr-10',
        className
      )}
      {...props}
    />
  )
}

export function Label({
  label,
  hint,
  className,
  children,
  ...props
}: React.ComponentProps<'label'> & {label: string; hint?: React.ReactNode}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)} {...props}>
      <span className="text-xs font-semibold tracking-wide text-gray-lighter uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="text-xs text-gray-dark">{hint}</span> : null}
    </label>
  )
}
