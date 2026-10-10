/** `m:ss`, rounding up so a timer never shows 0:00 while time is left. */
export const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
