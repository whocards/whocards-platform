const tokenKey = (code: string) => `whocards:game:${code.toUpperCase()}:token`
const recordsKey = (code: string) => `whocards:game:${code.toUpperCase()}:records`
const LAST_CODE_KEY = 'whocards:game:last-code'

// Private mode and blocked storage throw; the game still runs for this tab.
const safely = <T>(run: () => T, fallback: T): T => {
  try {
    return run()
  } catch {
    return fallback
  }
}

export type TokenStore = {
  get: (code: string) => string | null
  set: (code: string, token: string) => void
  clear: (code: string) => void
  lastCode: () => string | null
  /** The player's consent choice: record and transcribe, or just talk. */
  records: (code: string) => boolean
  setRecords: (code: string, records: boolean) => void
}

export const createTokenStore = (
  storage: Storage | null = globalThis.localStorage ?? null
): TokenStore => ({
  get: (code) => safely(() => storage?.getItem(tokenKey(code)) ?? null, null),
  set: (code, token) =>
    safely(() => {
      storage?.setItem(tokenKey(code), token)
      storage?.setItem(LAST_CODE_KEY, code.toUpperCase())
    }, undefined),
  clear: (code) => safely(() => storage?.removeItem(tokenKey(code)), undefined),
  lastCode: () => safely(() => storage?.getItem(LAST_CODE_KEY) ?? null, null),
  records: (code) => safely(() => storage?.getItem(recordsKey(code)) === '1', false),
  setRecords: (code, records) =>
    safely(() => storage?.setItem(recordsKey(code), records ? '1' : '0'), undefined),
})
