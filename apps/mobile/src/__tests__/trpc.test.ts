/**
 * Tests for the getBaseUrl() logic in src/lib/trpc.ts
 *
 * Exercises the three URL-selection branches:
 *   1. EXPO_PUBLIC_API_URL env var is set → use it directly
 *   2. Release build (!__DEV__) with no env → https://whocards.cc
 *   3. Dev build with no env → LAN host from Constants, port 4321
 *
 * Implementation notes:
 * - `__esModule: true` is required in the expo-constants mock so that
 *   babel's `_interopRequireDefault` treats it as an ES-module default export
 *   rather than double-wrapping it into `{ default: { default: ... } }`.
 * - We use a mutable `mockHostUri` variable (read by the mock getter) so each
 *   test can configure what Constants.expoConfig.hostUri returns without
 *   needing to re-register the mock.
 * - `jest.isolateModules` loads trpc.ts fresh each call so `getBaseUrl`
 *   re-evaluates Constants/env/`__DEV__` on each invocation.
 * - `__DEV__` is a React Native global. We set it via `setDev(bool)` to avoid
 *   the oxlint `no-underscore-dangle` rule on the access site.
 */

// @whocards/api is not needed for these tests — mock it out entirely.
jest.mock('@whocards/api', () => ({AppRouter: {}}))

// Mutable so each test can set a different hostUri.
let mockHostUri: string | undefined = undefined

jest.mock('expo-constants', () => ({
  // __esModule: true tells babel's interop to use .default directly rather
  // than wrapping the whole object in another { default: ... } layer.
  __esModule: true,
  default: {
    get expoConfig() {
      return mockHostUri !== undefined ? {hostUri: mockHostUri} : {}
    },
  },
}))

const PROD_URL = 'https://whocards.cc'
const ORIGINAL_ENV = process.env.EXPO_PUBLIC_API_URL

/** Toggle the React Native `__DEV__` global. Wrapped to avoid no-underscore-dangle. */
// oxlint-disable-next-line no-underscore-dangle
const setDev = (value: boolean) => void ((globalThis as Record<string, unknown>)['__DEV__'] = value)

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL
  } else {
    process.env.EXPO_PUBLIC_API_URL = ORIGINAL_ENV
  }
  // Restore __DEV__ to the jest-expo default (true).
  setDev(true)
  mockHostUri = undefined
})

/** Loads a fresh trpc module so getBaseUrl re-evaluates env/globals. */
type TrpcModule = {getBaseUrl: () => string}

const freshGetBaseUrl = (): (() => string) => {
  let fn!: () => string
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fn = (require('../lib/trpc') as TrpcModule).getBaseUrl
  })
  return fn
}

describe('getBaseUrl', () => {
  it('returns EXPO_PUBLIC_API_URL when set', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://staging.whocards.cc'
    setDev(false)
    expect(freshGetBaseUrl()()).toBe('https://staging.whocards.cc')
  })

  it('returns prod URL when !__DEV__ and env is unset', () => {
    delete process.env.EXPO_PUBLIC_API_URL
    setDev(false)
    expect(freshGetBaseUrl()()).toBe(PROD_URL)
  })

  it('returns LAN host URL in dev when no env is set', () => {
    delete process.env.EXPO_PUBLIC_API_URL
    setDev(true)
    mockHostUri = '192.168.1.42:8081'
    // getBaseUrl strips the expo port from hostUri and uses Astro's default.
    expect(freshGetBaseUrl()()).toBe('http://192.168.1.42:4321')
  })

  it('falls back to localhost:4321 in dev when hostUri is absent', () => {
    delete process.env.EXPO_PUBLIC_API_URL
    setDev(true)
    mockHostUri = undefined
    expect(freshGetBaseUrl()()).toBe('http://localhost:4321')
  })

  it('EXPO_PUBLIC_API_URL takes priority over the __DEV__ LAN fallback', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://custom.whocards.cc'
    setDev(true)
    mockHostUri = '192.168.1.42:8081'
    expect(freshGetBaseUrl()()).toBe('https://custom.whocards.cc')
  })
})
