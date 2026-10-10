// packages/game compiles without DOM or Node types; every JS host has these.
declare function setTimeout(callback: () => void, ms: number): unknown
declare function clearTimeout(id: unknown): void

/** Runs `callback` after `ms`; returns a cancel. */
export const after = (ms: number, callback: () => void): (() => void) => {
  const id = setTimeout(callback, ms)
  return () => clearTimeout(id)
}
