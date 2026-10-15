export const WEBSITE_ORIGIN = 'https://whocards.cc'
export const EVENT_PATH = '/events/sdd-2026'

export const eventLinks = (code: string) => {
  const event = `${WEBSITE_ORIGIN}${EVENT_PATH}`
  const q = `?code=${encodeURIComponent(code)}`
  return {
    event,
    join: `${event}${q}`,
    screen: `${event}/screen${q}`,
    me: `${event}/me${q}`,
    app: `${WEBSITE_ORIGIN}/app`,
    play: `${WEBSITE_ORIGIN}/play`,
  }
}
