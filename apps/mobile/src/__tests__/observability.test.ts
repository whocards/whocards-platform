/**
 * Tests for src/lib/observability.ts's `is_internal` flagging (issue #178):
 *
 * - a Release build (or EXPO_PUBLIC_DEBUG dev) on non-real hardware
 *   (`Device.isDevice === false`) auto-registers `is_internal: true` on
 *   construction, so simulators/emulators — including Maestro release-check
 *   runs — are flagged rather than silently dropped;
 * - a real device does NOT get that auto-flag;
 * - `setInternalMarker` is the manual escape hatch used by the hidden dev
 *   marker (use-internal-marker.ts) for the 2 physical dev phones that can't
 *   be auto-detected the same way.
 *
 * `posthog-react-native` and `expo-device` are both mocked so this stays
 * hermetic — no real network client, no native module. `@/env` is stubbed
 * per test via `jest.doMock` (before `require`-ing the module fresh with
 * `jest.isolateModules`) so each test can set its own PostHog key / isDevice
 * combination — the auto-flag branch runs once at import time, so a fresh
 * module instance is required per case.
 */

const mockRegister = jest.fn()
const mockUnregister = jest.fn()

jest.mock('posthog-react-native', () => {
  return jest.fn().mockImplementation(() => ({
    register: mockRegister,
    unregister: mockUnregister,
    capture: jest.fn(),
    captureException: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
  }))
})

let mockIsDevice = true
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice
  },
}))

import type * as ObservabilityModule from '../lib/observability'

beforeEach(() => {
  jest.clearAllMocks()
  mockIsDevice = true
})

/** Loads a fresh copy of the module under a given env + Device.isDevice. */
const freshObservability = (
  isDevice: boolean,
  envOverrides: Partial<{EXPO_PUBLIC_POSTHOG_KEY: string; EXPO_PUBLIC_DEBUG: boolean}> = {}
): typeof ObservabilityModule => {
  mockIsDevice = isDevice
  let mod!: typeof ObservabilityModule
  jest.isolateModules(() => {
    jest.doMock('@/env', () => ({
      env: {
        EXPO_PUBLIC_POSTHOG_KEY: 'test-key',
        EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
        EXPO_PUBLIC_DEBUG: false,
        ...envOverrides,
      },
    }))
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('../lib/observability')
  })
  return mod
}

describe('observability — auto-flag non-real hardware', () => {
  it('registers is_internal:true on construction when Device.isDevice is false', () => {
    freshObservability(false)
    expect(mockRegister).toHaveBeenCalledWith({is_internal: true})
  })

  it('does NOT register is_internal on a real device', () => {
    freshObservability(true)
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('does nothing when no PostHog key is configured, real hardware or not', () => {
    freshObservability(false, {EXPO_PUBLIC_POSTHOG_KEY: ''})
    expect(mockRegister).not.toHaveBeenCalled()
  })
})

describe('observability — setInternalMarker (hidden dev marker, issue #178)', () => {
  it('registers is_internal:true when turned on', () => {
    const mod = freshObservability(true)
    mockRegister.mockClear()
    mod.setInternalMarker(true)
    expect(mockRegister).toHaveBeenCalledWith({is_internal: true})
  })

  it('unregisters is_internal when turned off', () => {
    const mod = freshObservability(true)
    mod.setInternalMarker(false)
    expect(mockUnregister).toHaveBeenCalledWith('is_internal')
  })

  it('is a no-op when no PostHog client exists', () => {
    const mod = freshObservability(true, {EXPO_PUBLIC_POSTHOG_KEY: ''})
    expect(() => mod.setInternalMarker(true)).not.toThrow()
    expect(mockRegister).not.toHaveBeenCalled()
  })
})
