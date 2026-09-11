/**
 * UI snapshots of the app's three screens: Library (`src/app/index.tsx`), the
 * player (`src/app/play/[deck].tsx`, in each of its states) and the root layout
 * (`src/app/_layout.tsx`).
 *
 * Same contract as ui-snapshot-surfaces.test.tsx: the baseline `.snap` is
 * recorded on the PRE-upgrade toolchain and replayed untouched against the new
 * one, so a difference here is a finding to read, never a `jest -u`. (Its first
 * line is the exception: jest 30 refuses to read a snapshot file carrying
 * jest 29's guide-link header, and that line is Jest's own file-format marker
 * rather than test output. Everything below it is what the old toolchain
 * recorded.)
 *
 * How much of each screen is real:
 *   - Library and the player render for real, top to bottom — every component,
 *     hook, style and NativeWind class the device renders. Only their I/O is
 *     mocked (storage, the deck manifest fetch, analytics), and only to fixed
 *     values, because a snapshot needs the same input every run.
 *   - The root layout cannot render for real. Its body is expo-router's
 *     `<Stack>`, a navigator that needs the router's own root context plus a
 *     screen registry to mount; standing that up in Jest would test
 *     expo-router, not this app. It is stubbed with a host `View` carrying the
 *     `contentStyle` the layout computes, which keeps the one pixel-relevant
 *     decision the layout makes — the themed screen-transition background —
 *     under snapshot, and drops the rest. Said plainly here rather than shipped
 *     as a hollow full-screen test.
 *
 * Two things the player's snapshot cannot show, for the same no-native-layer
 * reason as everything else in this format:
 *   - The Question's on-device fitted font size. `fitFontSize` grows the text to
 *     fill the box `onLayout` reports, and `onLayout` never fires without a
 *     native layout pass, so the size here is fit against the player's
 *     window-derived first-paint fallback box instead. Deterministic (the
 *     window is fixed under Jest), just not the size a phone lands on.
 *   - Anything gesture-driven (the card swipe, swipe-to-dismiss). Those are
 *     native recognizers; they need the Maestro pass.
 *
 * Deliberately written to run under BOTH @testing-library/react-native 13 and
 * 14: `await render(...)` is a no-op on 13 and the awaited form on 14, and none
 * of the removed `UNSAFE_*` queries appear.
 */
import React from 'react'
import {act, render, screen} from '@testing-library/react-native'
import {GestureHandlerRootView} from 'react-native-gesture-handler'
import {colorScheme} from 'nativewind'

import {uiSnapshot} from '@/test-utils/ui-snapshot'

// Whole screens, so slower than the per-component suites; see
// settings-modal.test.tsx for why CI's shared runners need the headroom.
jest.setTimeout(30_000)

/** The `useLocalSearchParams` the player reads; set per test before rendering. */
let mockParams: Record<string, string> = {}

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

// The real `SafeAreaView` is a `View` plus whatever insets a provider reports;
// with no provider mounted those insets are zero anyway, so this is that minus
// the provider warning — and zero insets keep the padding in the snapshot fixed
// rather than device-shaped.
jest.mock('react-native-safe-area-context', () => {
  const {View} = jest.requireActual('react-native')
  return {
    useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
    SafeAreaView: View,
    SafeAreaProvider: View,
  }
})

jest.mock('react-native-reanimated', () => require('@/test-utils/reanimated-mock').reanimatedMock())

// expo-image asks at import time whether the optional `expo-observe` native
// module is present, and calls `getIntegrations()` on whatever comes back. Under
// jest-expo 56 (the pre-upgrade toolchain) every native module name resolves to
// a generic stub, so that answer is a truthy object without `getIntegrations`
// and importing expo-image — which the Library does — throws. jest-expo 57
// returns undefined for an unknown module and the import is fine.
//
// expo-observe is not a dependency of this app on either branch, so `null` is
// the truthful answer, and giving the same answer on both toolchains is what
// keeps a baseline recorded on one comparable with a run on the other. Only this
// one lookup is redirected; the rest of `expo` — and all of expo-image — is real.
jest.mock('expo', () => {
  const actual = jest.requireActual('expo')
  return {
    ...actual,
    requireOptionalNativeModule: (name: string) =>
      name === 'ExpoObserve' ? null : actual.requireOptionalNativeModule(name),
  }
})

// expo-router: `useLocalSearchParams` is the player's only input, `<Link asChild>`
// renders its child (on device it clones it with an href/onPress — function props,
// which this format drops anyway), and `<Stack>` is the navigator stub described
// in the header comment.
jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual('react')
  const {View} = jest.requireActual('react-native')
  return {
    __esModule: true,
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({back: jest.fn(), push: jest.fn(), replace: jest.fn()}),
    Link: ({children}: {children: React.ReactNode}) => children,
    Stack: ({screenOptions}: {screenOptions?: {contentStyle?: unknown}}) =>
      ReactActual.createElement(View, {style: screenOptions?.contentStyle}),
  }
})

// The root layout imports the Tailwind entry stylesheet for Metro to compile;
// Jest has no CSS transform (and no Metro), so stub the module rather than let
// it try to parse `@tailwind base` as JavaScript. Nothing is lost that this
// format could have seen — see ui-snapshot.ts on unresolved classes.
jest.mock('../global.css', () => ({}))

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(true),
  hideAsync: jest.fn().mockResolvedValue(true),
}))

// Offline-first (ADR-0002): the Library renders the bundled Deck numbers and
// silently reconciles with the API. An empty manifest is the offline path, and
// the one that doesn't depend on what the server happens to hold today.
jest.mock('@/lib/trpc', () => ({
  trpc: {decks: {manifest: {query: jest.fn().mockResolvedValue([])}}},
}))

// The storage libs are mocked for the same reason settings-modal.test.tsx mocks
// them — their module-level caches bleed between tests — and to fixed values,
// which is what makes each screen render the same way twice.
jest.mock('@/lib/game-store', () => ({
  getStoredGame: jest.fn().mockResolvedValue('wh'),
  setStoredGame: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/tabletop-store', () => ({
  getStoredTabletopMode: jest.fn().mockResolvedValue(false),
  setStoredTabletopMode: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/language-store', () => ({
  getStoredLanguage: jest.fn().mockResolvedValue(undefined),
  getStoredSecondaryLanguages: jest.fn().mockResolvedValue([]),
  setStoredLanguage: jest.fn().mockResolvedValue(undefined),
  setStoredSecondaryLanguages: jest.fn().mockResolvedValue(undefined),
}))

// The Theme Display setting is stored, and the Library restores it on mount
// (use-theme-setting.ts) — so a Dark-theme snapshot of the Library is taken by
// storing 'dark', not by poking NativeWind's observable, which the restore would
// immediately overwrite with the stored value anyway.
jest.mock('@/lib/theme-store', () => ({
  getStoredTheme: jest.fn().mockResolvedValue('system'),
  setStoredTheme: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/device-id', () => ({
  getDeviceId: jest.fn().mockResolvedValue('ui-snapshot-device'),
}))

// No answer leaves the machine during a snapshot run.
jest.mock('@/lib/answer-transport', () => ({
  send: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/observability', () => ({
  initObservability: jest.fn(),
  posthog: null,
}))

jest.mock('@whocards/observability', () => {
  const actual = jest.requireActual('@whocards/observability')
  return {...actual, identify: jest.fn(), trackEvent: jest.fn()}
})

jest.mock('@whocards/observability/events', () => {
  const actual = jest.requireActual('@whocards/observability/events')
  return {...actual, track: jest.fn()}
})

import {getStoredGame} from '@/lib/game-store'
import {getStoredTheme} from '@/lib/theme-store'

import RootLayout from '../app/_layout'
import LandingScreen from '../app/index'
import PlayScreen from '../app/play/[deck]'

/** Every screen sits under the root layout's gesture root on device. */
const Root = ({children}: {children: React.ReactNode}) => (
  <GestureHandlerRootView>{children}</GestureHandlerRootView>
)

const renderUi = (ui: React.ReactElement) => render(ui, {wrapper: Root})

/**
 * Let the screen finish arriving. Both screens run their entrance behind a
 * short real timer (the Library's splash handoff waits 120 ms for layout and
 * insets to settle), and the animations themselves are already settled by the
 * reanimated mock, so one flushed beat past the longest of those timers leaves
 * a screen that is done moving.
 */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250))
  })
}

beforeEach(() => {
  mockParams = {}
  // The Deck engine shuffles with Math.random; a snapshot needs one deal.
  jest.spyOn(Math, 'random').mockReturnValue(0.42)
})

afterEach(async () => {
  jest.restoreAllMocks()
  // NativeWind's colorScheme is a global observable — reset it so a Dark-theme
  // snapshot can't bleed into whichever test runs next.
  await act(() => colorScheme.set('system'))
})

describe('Library screen', () => {
  it('renders the Library unchanged', async () => {
    await renderUi(<LandingScreen />)
    await screen.findByLabelText('Play')
    await settle()
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders the Library unchanged in the Dark Theme Display setting', async () => {
    jest.mocked(getStoredTheme).mockResolvedValueOnce('dark')
    await renderUi(<LandingScreen />)
    await screen.findByLabelText('Play')
    await settle()
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })
})

describe('Play screen', () => {
  it('renders a Question unchanged', async () => {
    // `?q=` opens the classic player at that Question in natural order instead
    // of shuffling (ADR-0003) — which is also what makes it snapshottable.
    mockParams = {deck: 'library', q: '1'}
    await renderUi(<PlayScreen />)
    await screen.findByLabelText('exit deck')
    await settle()
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders a Question unchanged in the Dark Theme Display setting', async () => {
    mockParams = {deck: 'library', q: '1'}
    await act(() => colorScheme.set('dark'))
    await renderUi(<PlayScreen />)
    await screen.findByLabelText('exit deck')
    await settle()
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders the Pick a Card deck unchanged before a deal', async () => {
    mockParams = {deck: 'library'}
    jest.mocked(getStoredGame).mockResolvedValueOnce('pick')
    await renderUi(<PlayScreen />)
    await screen.findByLabelText('exit deck')
    await settle()
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders the unknown-Deck message unchanged', async () => {
    mockParams = {deck: 'no-such-deck'}
    await renderUi(<PlayScreen />)
    await screen.findByText('Deck not found.')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })
})

describe('Root layout', () => {
  // Only the themed screen-transition background is under test here; see the
  // header comment for why the navigator itself is stubbed.
  it('renders the screen-transition background unchanged', async () => {
    await render(<RootLayout />)
    await settle()
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders the screen-transition background unchanged in Dark', async () => {
    await act(() => colorScheme.set('dark'))
    await render(<RootLayout />)
    await settle()
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })
})
