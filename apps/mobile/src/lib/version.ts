const parts = (version: string) =>
  /^\d+(\.\d+)*$/.test(version) ? version.split('.').map(Number) : null

/** True only when both versions parse and `installed` is strictly below `minimum`, so anything unknown passes. */
export const isBelowMinimum = (installed: string | null, minimum: string | null): boolean => {
  const a = installed ? parts(installed) : null
  const b = minimum ? parts(minimum) : null
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff < 0
  }
  return false
}
