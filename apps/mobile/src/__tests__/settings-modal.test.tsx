/**
 * Tests for src/components/settings-modal.tsx (issue #176) — the one Settings
 * menu now reachable only from the home screen, replacing the old Library
 * chips (Game, Theme) and the play-screen language sheet (Language, secondary
 * language, Tabletop mode).
 *
 * The storage libs (game-store, tabletop-store, language-store) are mocked
 * outright rather than run for real: they already have their own dedicated
 * test files (game-store.test.ts, tabletop-store.test.ts,
 * language-store.test.ts), and their module-level in-memory caches would
 * otherwise bleed state between the `it()` blocks in this file. This file's
 * job is the component's wiring — which row opens which nested sheet, which
 * setter each selection calls, which analytics event each change fires — not
 * the storage layer itself.
 */
import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

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
import {getStoredLanguage, setStoredLanguage} from '../lib/language-store'
import {getStoredTabletopMode, setStoredTabletopMode} from '../lib/tabletop-store'

const mockedGetStoredGame = getStoredGame as jest.Mock
const mockedSetStoredGame = setStoredGame as jest.Mock
const mockedGetStoredTabletopMode = getStoredTabletopMode as jest.Mock
const mockedSetStoredTabletopMode = setStoredTabletopMode as jest.Mock
const mockedGetStoredLanguage = getStoredLanguage as jest.Mock
const mockedSetStoredLanguage = setStoredLanguage as jest.Mock
const mockedTrack = track as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockedGetStoredGame.mockResolvedValue('wh')
  mockedGetStoredTabletopMode.mockResolvedValue(false)
  mockedGetStoredLanguage.mockResolvedValue(undefined)
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

describe('SettingsModal — rows', () => {
  it('shows Game, Theme, Language, and Tabletop mode', async () => {
    renderModal()
    await screen.findByText('Settings')
    expect(screen.getByText('Game')).toBeTruthy()
    expect(screen.getByText('Theme')).toBeTruthy()
    expect(screen.getByText('Language')).toBeTruthy()
    expect(screen.getByText('Tabletop mode')).toBeTruthy()
  })

  it('reflects the loaded Game and the current Theme/Language values', async () => {
    mockedGetStoredGame.mockResolvedValue('pick')
    mockedGetStoredLanguage.mockResolvedValue('he')
    renderModal({theme: 'dark'})
    await waitFor(() => expect(screen.getByText('Pick a Card')).toBeTruthy())
    expect(screen.getByText('Dark')).toBeTruthy()
    expect(screen.getByText('Hebrew')).toBeTruthy()
  })

  it('disables the Language row for a single-language deck (no chevron, no nested sheet)', async () => {
    renderModal({languages: ['en']})
    const row = await screen.findByLabelText('Language: English')
    expect(row.props.accessibilityState).toEqual({disabled: true})
    fireEvent.press(row)
    expect(screen.queryByText('Choose your language')).toBeNull()
  })
})

describe('SettingsModal — Game (nested sheet)', () => {
  it('opens GameModal on press and applies + persists a selection', async () => {
    renderModal()
    const gameRow = await screen.findByLabelText('Game: Classic')
    fireEvent.press(gameRow)
    const pick = await screen.findByLabelText('Pick a Card')
    fireEvent.press(pick)
    expect(mockedSetStoredGame).toHaveBeenCalledWith('pick')
    await waitFor(() => expect(screen.getByText('Pick a Card')).toBeTruthy())
  })
})

describe('SettingsModal — Theme (nested sheet)', () => {
  it('opens ThemeModal on press and reports a selection via onSelectTheme', async () => {
    const onSelectTheme = jest.fn()
    renderModal({onSelectTheme})
    const themeRow = await screen.findByLabelText('Theme: System')
    fireEvent.press(themeRow)
    const dark = await screen.findByLabelText('Theme: Dark')
    fireEvent.press(dark)
    expect(onSelectTheme).toHaveBeenCalledWith('dark')
  })
})

describe('SettingsModal — Language (nested sheet)', () => {
  it('opens LanguageModal on press, applies + persists a primary selection, tracks LANGUAGE_CHANGED', async () => {
    renderModal()
    const languageRow = await screen.findByLabelText('Language: English')
    fireEvent.press(languageRow)
    await screen.findByText('Choose your language')
    // "Hebrew" appears twice — once as the primary-language row, once again in
    // "Also show" (any non-current language can also be a secondary) — the
    // primary row renders first, so index 0 is the one under test here.
    const [hebrew] = await screen.findAllByText('Hebrew')
    fireEvent.press(hebrew)
    expect(mockedSetStoredLanguage).toHaveBeenCalledWith('library', 'he')
    expect(mockedTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'language_changed',
        props: expect.objectContaining({deck_id: 'library', from: 'en', to: 'he'}),
      })
    )
    await waitFor(() => expect(screen.getByText('Hebrew')).toBeTruthy())
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
