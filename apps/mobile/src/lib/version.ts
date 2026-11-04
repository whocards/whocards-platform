const parts = (version: string) => version.split('.').map(Number)

/** True only when both versions parse and `installed` is strictly below `minimum`, so anything unknown passes. */
export const isBelowMinimum = (installed: string | null, minimum: string | null): boolean => {
  if (!installed || !minimum) return false
  const a = parts(installed)
  const b = parts(minimum)
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    // NaN (an unparsable part) is never below zero, so it passes.
    if (diff !== 0) return diff < 0
  }
  return false
}
