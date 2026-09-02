/** Fisher–Yates shuffle returning a new array; the input is left untouched. */
export const shuffle = <T>(input: readonly T[]): T[] => {
  const out = [...input]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- noUncheckedIndexedAccess widens out[i]/out[j] to T | undefined; both indices are within [0, out.length) by the loop bounds, so the swap is always sound.
    ;[out[i], out[j]] = [out[j], out[i]] as [T, T]
  }
  return out
}
