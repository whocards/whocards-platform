/**
 * Tests for src/components/settings-modal.tsx (issue #176) — the one Settings
 * menu now reachable only from the home screen, replacing the old Library
 * chips (Game, Theme) and the play-screen language sheet (Language, secondary
 * language, Tabletop mode).
 *
 * Issue #189, third pass: this sheet is now a single `Modal` with internal
 * pages (menu, Game, Theme, Language) rather than a stack of separate,
 * on-top-of-each-other `Modal`s (the second #189 pass's approach, dropped
 * after on-device feedback found the modal-swap handoff flickered).
 *
 * Issue #189, fourth pass: two more owner on-device rounds.
 * - Motion: pages now rise from the bottom over the menu (translateY-driven)
 *   instead of sliding in horizontally — the horizontal version "read like
 *   page navigation," jarring next to every other sheet in the app. The menu
 *   stays mounted and dims underneath rather than sliding away.
 * - Dismiss semantics shifted with the motion: a tap on the dim behind a
 *   risen page now pops that page (same as Android back), not a full close —
 *   the *outer* sheet's own backdrop still fully closes, but it's covered
 *   while a page is risen so it isn't reachable in that state.
 * - "Second language" split out of the Language page into its own menu row
 *   and page (owner: "split the second language selector into a separate
 *   section in game play options") — see second-language-settings-page.test.tsx
 *   for that page's own content tests. Splitting it also removed the one
 *   reason primary Language used to stay open after a pick, so it now
 *   auto-returns to the menu like every other single-pick page.
 * - The menu is grouped into two sections, Gameplay and Appearance — see
 *   settings-modal.tsx's own doc comment for where Language landed and why.
 *
 * The storage libs (game-store, tabletop-store, language-store) are mocked
 * outright rather than run for real: they already have their own dedicated
 * test files (game-store.test.ts, tabletop-store.test.ts,
 * language-store.test.ts), and their module-level in-memory caches would
 * otherwise bleed state between the `it()` blocks in this file. This file's
 * job is the component's wiring — not the storage layer itself.
 */
import React from 'react'
import {Modal} from 'react-native'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

// react-native-reanimated's native Worklets module isn't available under plain
// jest-expo — importing it for real (even just to spread its official jest mock's
// exports via jest.requireActual, which bypasses moduleNameMapper) throws
// "Native part of Worklets doesn't seem to be initialized" (see
// pressable-scale.tsx / player-bar.test.tsx's own mock for the identical,
// pre-existing issue — that one sidesteps it by mocking the *component* that
// uses reanimated instead, but settings-modal.tsx uses it directly). So this is
// a small, self-contained mock of just the reanimated surface settings-modal.tsx
// actually uses, never touching the real package: withTiming jumps straight to
// the end value and fires its completion callback synchronously (no timers to
// fake), runOnJS is the identity function, and useReducedMotion (which the
// official mock doesn't implement either — its own source flags it "ADD ME IF
// NEEDED") returns `false`. `__esModule: true` matters here — without it,
// Babel's CJS interop resolves `import Animated from '...'` to this whole mock
// object instead of its `default` property, and `Animated.View` silently
// becomes `undefined`.
jest.mock('react-native-reanimated', () => {
  const {View} = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: {View},
    // Only ever called here as `.set(withTiming(...))` — a plain value, never
    // the functional-updater form — so this doesn't need to support that form.
    useSharedValue: (init: unknown) => {
      const ref = {value: init}
      return {get: () => ref.value, set: (next: unknown) => (ref.value = next)}
    },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => false,
    withTiming: (toValue: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true)
      return toValue
    },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  }
})

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

jest.mock('@whocards/observability/events', () => {
  const actual = jest.requireActual('@whocards/observability/events')
  return {...actual, track: jest.fn()}
})

import {track} from '@whocards/observability/events'
import {SettingsModal} from '../components/settings-modal'
import {getStoredGame, setStoredGame} from '../lib/game-store'
import {
  getStoredLanguage,
  getStoredSecondaryLanguages,
  setStoredLanguage,
} from '../lib/language-store'
import {getStoredTabletopMode, setStoredTabletopMode} from '../lib/tabletop-store'

const mockedGetStoredGame = getStoredGame as jest.Mock
const mockedSetStoredGame = setStoredGame as jest.Mock
const mockedGetStoredTabletopMode = getStoredTabletopMode as jest.Mock
const mockedSetStoredTabletopMode = setStoredTabletopMode as jest.Mock
const mockedGetStoredLanguage = getStoredLanguage as jest.Mock
const mockedGetStoredSecondaryLanguages = getStoredSecondaryLanguages as jest.Mock
const mockedSetStoredLanguage = setStoredLanguage as jest.Mock
const mockedTrack = track as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockedGetStoredGame.mockResolvedValue('wh')
  mockedGetStoredTabletopMode.mockResolvedValue(false)
  mockedGetStoredLanguage.mockResolvedValue(undefined)
  mockedGetStoredSecondaryLanguages.mockResolvedValue([])
})

const renderModal = (overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {}) =>
  render(
    <SettingsModal
      visible
      onClose={() => {}}
      deckSlug="library"
      languages={['en', 'he']}
      theme="system"
      onSelectTheme={() => {}}
      {...overrides}
    />
  )

describe('SettingsModal — menu', () => {
  it('shows Gameplay (Game, Language, Second language, Tabletop) and Appearance (Theme)', async () => {
    renderModal()
    await screen.findByText('Settings')
    expect(screen.getByText('Gameplay')).toBeTruthy()
    expect(screen.getByText('Game')).toBeTruthy()
    expect(screen.getByText('Language')).toBeTruthy()
    expect(screen.getByText('Second language')).toBeTruthy()
    expect(screen.getByText('Tabletop mode')).toBeTruthy()
    expect(screen.getByText('Appearance')).toBeTruthy()
    expect(screen.getByText('Theme')).toBeTruthy()
  })

  it('reflects the loaded Game, Theme, Language, and Second language values', async () => {
    mockedGetStoredGame.mockResolvedValue('pick')
    mockedGetStoredLanguage.mockResolvedValue('he')
    mockedGetStoredSecondaryLanguages.mockResolvedValue(['en'])
    renderModal({theme: 'dark', languages: ['en', 'he']})
    await waitFor(() => expect(screen.getByText('Pick a Card')).toBeTruthy())
    expect(screen.getByText('Dark')).toBeTruthy()
    expect(screen.getByLabelText('Language: Hebrew')).toBeTruthy()
    expect(screen.getByLabelText('Second language: English')).toBeTruthy()
  })

  it('shows "None" for Second language when no secondary is stored', async () => {
    renderModal()
    await screen.findByText('Settings')
    expect(screen.getByLabelText('Second language: None')).toBeTruthy()
  })

  it('disables the Language row for a single-language deck (no chevron, no navigation)', async () => {
    renderModal({languages: ['en']})
    const row = await screen.findByLabelText('Language: English')
    expect(row.props.accessibilityState).toEqual({disabled: true})
    fireEvent.press(row)
    expect(screen.queryByText('Choose your language')).toBeNull()
  })

  it('disables the Second language row for a single-language deck (no possible secondary)', async () => {
    renderModal({languages: ['en']})
    const row = await screen.findByLabelText('Second language: None')
    expect(row.props.accessibilityState).toEqual({disabled: true})
    fireEvent.press(row)
    // No page opened — "back" only ever renders on a pushed page's header.
    expect(screen.queryByLabelText('back')).toBeNull()
  })
})

describe('SettingsModal — Game page', () => {
  it('navigates on press, applies + persists a selection, and returns to the menu', async () => {
    renderModal()
    const gameRow = await screen.findByLabelText('Game: Classic')
    fireEvent.press(gameRow)
    const pick = await screen.findByLabelText('Pick a Card')
    fireEvent.press(pick)
    expect(mockedSetStoredGame).toHaveBeenCalledWith('pick')
    // Back on the menu (not left on the Game page) — updated value shown.
    await waitFor(() => expect(screen.queryByText('Choose your game')).toBeNull())
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('Pick a Card')).toBeTruthy()
  })
})

describe('SettingsModal — Theme page', () => {
  it('navigates on press, reports a selection via onSelectTheme, and returns to the menu', async () => {
    const onSelectTheme = jest.fn()
    renderModal({onSelectTheme})
    const themeRow = await screen.findByLabelText('Theme: System')
    fireEvent.press(themeRow)
    const dark = await screen.findByLabelText('Theme: Dark')
    fireEvent.press(dark)
    expect(onSelectTheme).toHaveBeenCalledWith('dark')
    await waitFor(() => expect(screen.queryByLabelText('Theme: Dark')).toBeNull())
    expect(screen.getByText('Settings')).toBeTruthy()
  })
})

describe('SettingsModal — Language page', () => {
  it('navigates on press, applies + persists a primary selection, tracks LANGUAGE_CHANGED, and returns to the menu', async () => {
    renderModal()
    const languageRow = await screen.findByLabelText('Language: English')
    fireEvent.press(languageRow)
    await screen.findByText('Choose your language')
    const hebrew = await screen.findByText('Hebrew')
    fireEvent.press(hebrew)
    expect(mockedSetStoredLanguage).toHaveBeenCalledWith('library', 'he')
    expect(mockedTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'language_changed',
        props: expect.objectContaining({deck_id: 'library', from: 'en', to: 'he'}),
      })
    )
    // Issue #189, fourth pass: now auto-returns like every other single-pick
    // page (splitting "Second language" out removed the reason to linger).
    await waitFor(() => expect(screen.queryByText('Choose your language')).toBeNull())
    expect(screen.getByLabelText('Language: Hebrew')).toBeTruthy()
  })

  it('clears an existing Second language when it becomes the new primary', async () => {
    renderModal({languages: ['en', 'he']})
    // Set Hebrew as the secondary first.
    fireEvent.press(await screen.findByLabelText('Second language: None'))
    fireEvent.press(await screen.findByText('Hebrew'))
    await waitFor(() => expect(screen.getByLabelText('Second language: Hebrew')).toBeTruthy())

    // Now pick Hebrew as the primary too — it can't remain the secondary.
    fireEvent.press(screen.getByLabelText('Language: English'))
    fireEvent.press(await screen.findByText('Hebrew'))
    await waitFor(() => expect(screen.getByLabelText('Second language: None')).toBeTruthy())
  })
})

describe('SettingsModal — Second language page (issue #189, owner on-device feedback)', () => {
  it('navigates on press, applies + persists a selection, tracks SECONDARY_LANGUAGES_CHANGED, and returns to the menu', async () => {
    renderModal({languages: ['en', 'he']})
    fireEvent.press(await screen.findByLabelText('Second language: None'))
    await screen.findByText('Second language')
    fireEvent.press(await screen.findByText('Hebrew'))
    expect(mockedTrack).toHaveBeenCalledWith({
      name: 'secondary_languages_changed',
      props: {deck_id: 'library', secondary: ['he']},
    })
    // Back on the menu — "back" only ever renders on a pushed page's header.
    await waitFor(() => expect(screen.queryByLabelText('back')).toBeNull())
    expect(screen.getByLabelText('Second language: Hebrew')).toBeTruthy()
  })

  it('never lists the current primary as a choice', async () => {
    renderModal({languages: ['en', 'he']})
    fireEvent.press(await screen.findByLabelText('Second language: None'))
    await screen.findByText('Second language')
    expect(screen.queryByText('English')).toBeNull()
  })

  it('picking "None" clears an existing secondary', async () => {
    renderModal({languages: ['en', 'he']})
    fireEvent.press(await screen.findByLabelText('Second language: None'))
    fireEvent.press(await screen.findByText('Hebrew'))
    await waitFor(() => expect(screen.getByLabelText('Second language: Hebrew')).toBeTruthy())

    fireEvent.press(screen.getByLabelText('Second language: Hebrew'))
    const [none] = await screen.findAllByText('None')
    fireEvent.press(none)
    await waitFor(() => expect(screen.getByLabelText('Second language: None')).toBeTruthy())
  })
})

describe('SettingsModal — Tabletop mode (inline switch, issue #148/#176)', () => {
  it('reflects the loaded preference as the switch checked state', async () => {
    mockedGetStoredTabletopMode.mockResolvedValue(true)
    renderModal()
    const toggle = await screen.findByLabelText('Tabletop mode')
    await waitFor(() => expect(toggle.props.accessibilityState).toEqual({checked: true}))
  })

  it('flips, persists, and tracks TABLETOP_MODE_CHANGED with no deck_id (global setting)', async () => {
    renderModal()
    const toggle = await screen.findByLabelText('Tabletop mode')
    await waitFor(() => expect(toggle.props.accessibilityState).toEqual({checked: false}))
    act(() => fireEvent.press(toggle))
    expect(mockedSetStoredTabletopMode).toHaveBeenCalledWith(true)
    expect(mockedTrack).toHaveBeenCalledWith({
      name: 'tabletop_mode_changed',
      props: {enabled: true},
    })
  })
})

describe('SettingsModal — single Modal, internal pages (issue #189, third/fourth pass)', () => {
  it('hides the menu from the accessibility tree while a page is risen', async () => {
    renderModal()
    const gameRow = await screen.findByLabelText('Game: Classic')
    fireEvent.press(gameRow)
    await screen.findByText('Choose your game')
    // includeHiddenElements bypasses RNTL's default accessibility-hidden filter —
    // the menu's "Tabletop mode" text still exists in the tree (not unmounted,
    // just hidden/dimmed underneath), same technique question-text.test.tsx uses
    // for Tabletop mode's own rotated, hidden half.
    expect(screen.getAllByText('Tabletop mode', {includeHiddenElements: true})).toHaveLength(1)
    expect(screen.queryByText('Tabletop mode')).toBeNull()
  })

  it('reveals the menu again once back on it', async () => {
    renderModal()
    const gameRow = await screen.findByLabelText('Game: Classic')
    fireEvent.press(gameRow)
    fireEvent.press(screen.getByLabelText('back'))
    await waitFor(() => expect(screen.queryByText('Choose your game')).toBeNull())
    expect(screen.getByText('Tabletop mode')).toBeTruthy()
  })

  it('Android back pops to the menu first, then closes only from the menu', async () => {
    const onClose = jest.fn()
    renderModal({onClose})
    const gameRow = await screen.findByLabelText('Game: Classic')
    fireEvent.press(gameRow)
    await screen.findByText('Choose your game')

    // Re-read `onRequestClose` after the first press rather than reusing one
    // reference for both: it's a closure over `page`, freshly recreated on
    // every render (like any prop), so the version bound to "still on the
    // Game page" would forever evaluate that same branch — a stale-closure
    // testing artifact, not how a real re-render behaves.
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose())
    // First press: popped back to the menu, sheet still open.
    await waitFor(() => expect(screen.queryByText('Choose your game')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()

    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose())
    // Second press, now on the menu: closes the sheet.
    expect(onClose).toHaveBeenCalled()
  })

  it('tapping the dim behind a risen page pops it, same as Android back — not a full close', async () => {
    const onClose = jest.fn()
    renderModal({onClose})
    const gameRow = await screen.findByLabelText('Game: Classic')
    fireEvent.press(gameRow)
    await screen.findByText('Choose your game')
    fireEvent.press(screen.getByLabelText('dismiss page'))
    await waitFor(() => expect(screen.queryByText('Choose your game')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('the outer backdrop still fully closes the sheet from the menu', async () => {
    const onClose = jest.fn()
    renderModal({onClose})
    await screen.findByText('Settings')
    fireEvent.press(screen.getByLabelText('dismiss'))
    expect(onClose).toHaveBeenCalled()
  })

  it('starts back at the menu on every fresh open, regardless of where it was left', async () => {
    const {rerender} = renderModal()
    const gameRow = await screen.findByLabelText('Game: Classic')
    fireEvent.press(gameRow)
    await screen.findByText('Choose your game')

    rerender(
      <SettingsModal
        visible={false}
        onClose={() => {}}
        deckSlug="library"
        languages={['en', 'he']}
        theme="system"
        onSelectTheme={() => {}}
      />
    )
    rerender(
      <SettingsModal
        visible
        onClose={() => {}}
        deckSlug="library"
        languages={['en', 'he']}
        theme="system"
        onSelectTheme={() => {}}
      />
    )

    await screen.findByText('Settings')
    expect(screen.queryByText('Choose your game')).toBeNull()
  })
})
