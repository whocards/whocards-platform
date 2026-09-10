/** Monday (UTC) of the week containing `date`, as `YYYY-MM-DD`. */
export const weekStartOf = (date: Date): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // getUTCDay(): 0=Sun..6=Sat
  const dayOfWeek = d.getUTCDay()
  const diffToMonday = (dayOfWeek + 6) % 7
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  const [iso] = d.toISOString().split('T')
  return iso ?? d.toISOString()
}

export const currentWeekStart = (now: Date = new Date()): Date =>
  new Date(`${weekStartOf(now)}T00:00:00.000Z`)
