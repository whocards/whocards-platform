const blob = 'absolute rounded-full motion-reduce:animate-none'

export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className={`${blob} -top-[35vmax] -right-[25vmax] size-[90vmax] animate-breathe-a bg-[radial-gradient(closest-side,--alpha(var(--color-primary-dark)/32%),transparent)]`}
      />
      <div
        className={`${blob} -bottom-[40vmax] -left-[30vmax] size-[90vmax] animate-breathe-b bg-[radial-gradient(closest-side,--alpha(var(--color-yellow-400)/16%),transparent)]`}
      />
      <div
        className={`${blob} top-[15vh] left-[25vw] size-[60vmax] animate-breathe-c bg-[radial-gradient(closest-side,--alpha(var(--color-accentOnDark)/14%),transparent)]`}
      />
      <div className="absolute inset-0 bg-maze bg-cover bg-center opacity-40" />
    </div>
  )
}
