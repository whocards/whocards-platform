const EVENT_PATH = '/events/sdd-2026'

/** Where a player joins this game; the bare event page when there is no code. */
export const joinPath = (code: string | null): string =>
  code ? `${EVENT_PATH}?code=${encodeURIComponent(code)}` : EVENT_PATH
