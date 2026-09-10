/**
 * Shared 30-day reporting window (UTC) for the two install-count sources.
 * Apple only publishes one SALES/SUMMARY report per day and Google's install
 * report is a monthly CSV — different shapes, but the page labels both counts
 * "last 30 days," so both sources must sum over the exact same trailing
 * window, or the number is a lie for whichever store deviates (CodeRabbit
 * finding on PR #298: Google Play was reading only the current UTC month,
 * i.e. month-to-date, not a true 30-day window).
 */

/** Apple only publishes one SALES/SUMMARY report per day — sum the trailing month for a stable count. */
export const REPORT_WINDOW_DAYS = 30

/**
 * The last `REPORT_WINDOW_DAYS` calendar dates (UTC, `YYYY-MM-DD`), starting
 * yesterday — today's report isn't final yet for either store. `now` is
 * injectable so tests can exercise a window that crosses a month boundary
 * without depending on real wall-clock time.
 */
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
