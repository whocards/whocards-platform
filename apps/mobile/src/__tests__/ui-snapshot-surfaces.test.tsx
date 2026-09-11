/**
 * UI snapshots of the app's interactive surfaces: the Settings sheet and its
 * pages, the Share sheet, and the player bar.
 *
 * These are regression baselines for the upgraded React Native / NativeWind v5
 * toolchain. They include styles compiled from the app's CSS and injected into
 * Jest, while native layout and rasterization still require comparison on a
 * device.
 *
 * The format is `@/test-utils/ui-snapshot`: host type + flattened resolved
 * style + text + presentational accessibility props, and nothing else. See that
 * file for what it deliberately cannot see (everything native-side).
 *
 * Deliberately written to run under BOTH @testing-library/react-native 13 and
 * 14: `await render(...)` / `await fireEvent.press(...)` are no-ops on 13 and
 * the awaited form on 14, and none of the removed `UNSAFE_*` queries appear.
 */
import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react-native'
import {GestureHandlerRootView} from 'react-native-gesture-handler'
import {setColorScheme} from '@/lib/color-scheme'

import {uiSnapshot} from '@/test-utils/ui-snapshot'

// See settings-modal.test.tsx for why this file is slow enough to need its own
// timeout on CI's shared runners: the first `render()` also pays NativeWind's
// one-off style-registry init.
jest.setTimeout(20_000)

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

jest.mock('react-native-reanimated', () => require('@/test-utils/reanimated-mock').reanimatedMock())

// The storage libs are mocked for the same reason settings-modal.test.tsx mocks
// them: their module-level caches bleed between tests. Fixed resolved values
// also keep the rendered sheet deterministic, which a snapshot needs.
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

jest.mock('@/lib/share-image', () => ({
  downloadAndShareImage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@whocards/observability/events', () => {
  const actual = jest.requireActual('@whocards/observability/events')
  return {...actual, track: jest.fn()}
})

import {GameSettingsPage} from '../components/game-settings-page'
import {LanguageSettingsPage} from '../components/language-settings-page'
import {PlayerBar} from '../components/player-bar'
import {SecondLanguageSettingsPage} from '../components/second-language-settings-page'
import {SettingsModal} from '../components/settings-modal'
import {ShareModal} from '../components/share-modal'
import {ThemeSettingsPage} from '../components/theme-settings-page'

const noop = () => {}

/**
 * Every surface here sits under the root layout's `GestureHandlerRootView` in
 * the real app, and gesture-handler's `GestureDetector` (the Share sheet's
 * drag handle, `PressableScale`'s press) refuses to mount without it. Wrapping
 * the render is both what the app does and what keeps the snapshot honest —
 * `PressableScale` renders for real here rather than being swapped for a plain
 * `Pressable` the way the behavioural suites do.
 */
const Root = ({children}: {children: React.ReactNode}) => (
  <GestureHandlerRootView>{children}</GestureHandlerRootView>
)

const renderUi = async (ui: React.ReactElement) => await render(ui, {wrapper: Root})

beforeEach(async () => {
  await act(() => setColorScheme('light'))
})

const renderSettings = (overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {}) =>
  renderUi(
    <SettingsModal
      visible
      onClose={noop}
      deckSlug="library"
      languages={['en', 'he']}
      theme="system"
      onSelectTheme={noop}
      {...overrides}
    />
  )

describe('Settings sheet', () => {
  it('renders the menu', async () => {
    await renderSettings()
    await screen.findByText('Settings')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders the menu in the Dark Theme Display setting', async () => {
    await act(() => setColorScheme('dark'))
    await renderSettings({theme: 'dark'})
    await screen.findByText('Settings')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders a risen page over the dimmed menu', async () => {
    await renderSettings()
    await fireEvent.press(await screen.findByLabelText('Game: Classic'))
    await screen.findByText('Choose your game')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })
})

describe('Settings pages', () => {
  it('renders the Game page', async () => {
    await renderUi(<GameSettingsPage current="wh" onSelect={noop} onBack={noop} />)
    await screen.findByText('Choose your game')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders the Theme page', async () => {
    await renderUi(<ThemeSettingsPage current="system" onSelect={noop} onBack={noop} />)
    await screen.findByText('Theme')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders the Language page', async () => {
    await renderUi(
      <LanguageSettingsPage languages={['en', 'he']} current="en" onSelect={noop} onBack={noop} />
    )
    await screen.findByText('Choose your language')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders the Second language page', async () => {
    await renderUi(
      <SecondLanguageSettingsPage
        languages={['en', 'he', 'es']}
        current="en"
        secondary={['he']}
        onChange={noop}
        onBack={noop}
      />
    )
    await screen.findByText('None')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })
})

describe('Share sheet', () => {
  const SHARE_PROPS = {
    visible: true,
    questionText: 'What is your favorite memory?',
    shareUrl: 'https://whocards.cc/play?lang=en&q=q-1',
    onShare: noop,
    onClose: noop,
  }

  it('renders all three rows for a Pool-backed Deck', async () => {
    await renderUi(
      <ShareModal
        {...SHARE_PROPS}
        storyImageUrl="https://whocards.cc/share-card/story/en/q-1.png"
        postImageUrl="https://whocards.cc/share-card/post/en/q-1.png"
      />
    )
    await screen.findByLabelText('Share link')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders the link row alone for an inline-source Deck', async () => {
    await renderUi(<ShareModal {...SHARE_PROPS} />)
    await screen.findByLabelText('Share link')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })
})

describe('Player bar', () => {
  it('renders Prev / Exit / Share / Next', async () => {
    await renderUi(<PlayerBar onPrevious={noop} onNext={noop} onShare={noop} onExit={noop} />)
    await screen.findByLabelText('exit deck')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })

  it('renders without Share (the pick screen before a deal)', async () => {
    await renderUi(
      <PlayerBar showShare={false} onPrevious={noop} onNext={noop} onShare={noop} onExit={noop} />
    )
    await screen.findByLabelText('exit deck')
    expect(uiSnapshot(screen)).toMatchSnapshot()
  })
})
