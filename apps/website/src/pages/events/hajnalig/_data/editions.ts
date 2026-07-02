export type EditionYear = 2025 | 2026

export type Edition = {
  year: EditionYear
  /** landing page URL */
  href: string
  /** play page URL */
  playHref: string
  /**
   * Engagement snapshot from the `conference_question_tracking` table
   * (read 2026-06-21). `people` = distinct participants, `questions` = cards
   * reached, `moments` = total navigation interactions. Refresh occasionally;
   * these are intentionally static (no build-time DB dependency).
   */
  stats: {people: number; questions: number; moments: number}
}

export const editions: Record<EditionYear, Edition> = {
  2025: {
    year: 2025,
    href: '/events/hajnalig/2025',
    playHref: '/events/hajnalig/2025/play',
    stats: {people: 270, questions: 140, moments: 3641},
  },
  2026: {
    year: 2026,
    href: '/events/hajnalig',
    playHref: '/events/hajnalig/play',
    stats: {people: 199, questions: 163, moments: 3468},
  },
}

/** The current edition served at /events/hajnalig. */
export const CURRENT_EDITION: EditionYear = 2026
