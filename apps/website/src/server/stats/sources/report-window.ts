export const REPORT_WINDOW_DAYS = 30

/** The last `REPORT_WINDOW_DAYS` UTC dates (`YYYY-MM-DD`), starting yesterday — today's store reports aren't final. */
export const reportWindowDates = (now: Date = new Date()): string[] => {
  const dates: string[] = []
  for (let daysAgo = 1; daysAgo <= REPORT_WINDOW_DAYS; daysAgo++) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - daysAgo)
    const [iso] = d.toISOString().split('T')
    if (iso) dates.push(iso)
  }
  return dates
}
