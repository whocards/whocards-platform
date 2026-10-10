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
  // Reading localStorage itself throws where storage is blocked.
  storage: Storage | null = safely(() => globalThis.localStorage ?? null, null)
): TokenStore => {
  // Every write lands here too, so a storage that refuses writes doesn't drop the token.
  const memory = new Map<string, string>()
  const read = (key: string) =>
    safely(() => storage?.getItem(key) ?? null, null) ?? memory.get(key) ?? null
  const write = (key: string, value: string) => {
    memory.set(key, value)
    safely(() => storage?.setItem(key, value), undefined)
  }
  return {
    get: (code) => read(tokenKey(code)),
    set: (code, token) => {
      write(tokenKey(code), token)
      write(LAST_CODE_KEY, code.toUpperCase())
    },
    clear: (code) => {
      memory.delete(tokenKey(code))
      safely(() => storage?.removeItem(tokenKey(code)), undefined)
    },
    lastCode: () => read(LAST_CODE_KEY),
    records: (code) => read(recordsKey(code)) === '1',
    setRecords: (code, records) => write(recordsKey(code), records ? '1' : '0'),
  }
}
