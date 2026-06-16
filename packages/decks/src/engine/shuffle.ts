/** Fisher–Yates shuffle returning a new array; the input is left untouched. */
export const shuffle = <T>(input: readonly T[]): T[] => {
  const out = [...input]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]] as [T, T]
  }
  return out
}
