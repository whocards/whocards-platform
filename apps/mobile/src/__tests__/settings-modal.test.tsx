import React from 'react'
import {Linking, Platform} from 'react-native'
import {fireEvent, render, screen, waitFor} from '@testing-library/react-native'

jest.setTimeout(20_000)

jest.mock('@/lib/game-store', () => ({
  getStoredGame: jest.fn().mockResolvedValue('wh'),
  setStoredGame: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/notification-store', () => ({
  DAILY_HOUR: 18,
  getDailySetting: jest.fn(),
  notificationsAllowed: jest.fn(),
  openNotificationSetting: jest.fn().mockResolvedValue(undefined),
  refillDailyQuestions: jest.fn().mockResolvedValue(undefined),
  setDailySetting: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/card-animation-store', () => ({
  getStoredCardAnimation: jest.fn().mockResolvedValue('slide'),
  setStoredCardAnimation: jest.fn().mockResolvedValue(undefined),
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
import {
  getDailySetting,
  notificationsAllowed,
  openNotificationSetting,
  setDailySetting,
} from '../lib/notification-store'
import {setStoredCardAnimation} from '../lib/card-animation-store'
import {getStoredTabletopMode, setStoredTabletopMode} from '../lib/tabletop-store'

const mockedGetStoredGame = jest.mocked(getStoredGame)
const mockedSetStoredGame = jest.mocked(setStoredGame)
const mockedGetStoredTabletopMode = jest.mocked(getStoredTabletopMode)
const mockedSetStoredTabletopMode = jest.mocked(setStoredTabletopMode)
const mockedGetStoredLanguage = jest.mocked(getStoredLanguage)
const mockedGetStoredSecondaryLanguages = jest.mocked(getStoredSecondaryLanguages)
const mockedSetStoredLanguage = jest.mocked(setStoredLanguage)
const mockedTrack = jest.mocked(track)

beforeEach(() => {
  jest.clearAllMocks()
  mockedGetStoredGame.mockResolvedValue('wh')
  mockedGetStoredTabletopMode.mockResolvedValue(false)
  mockedGetStoredLanguage.mockResolvedValue(undefined)
  mockedGetStoredSecondaryLanguages.mockResolvedValue([])
  jest.mocked(getDailySetting).mockResolvedValue({enabled: true, hour: 18, minute: 0})
  jest.mocked(notificationsAllowed).mockResolvedValue(true)
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

const selected = (label: string) => screen.getByLabelText(label).props.accessibilityState.selected

/** What a screen reader's double-tap on a native switch does. */
const toggle = (label: string) =>
  fireEvent(screen.getByLabelText(label), 'accessibilityAction', {
    nativeEvent: {actionName: 'activate'},
  })

describe('SettingsModal — one screen, every control inline', () => {
  it('shows every setting, each with its control', async () => {
    await renderModal()
    await screen.findByText('Settings')
    expect(screen.getByLabelText('Game: Classic')).toBeTruthy()
    expect(screen.getByLabelText('Language: English')).toBeTruthy()
    expect(screen.getByLabelText('Second language').props.accessibilityState.checked).toBe(false)
    expect(screen.getByLabelText('Card animation: Slide')).toBeTruthy()
    expect(screen.getByLabelText('Tabletop mode')).toBeTruthy()
    expect(screen.getByLabelText('Theme: System')).toBeTruthy()
    expect(screen.getByLabelText('Daily question')).toBeTruthy()
    expect(screen.getByLabelText('Send feedback')).toBeTruthy()
  })

  it('reflects the loaded Game, Theme and languages', async () => {
    mockedGetStoredGame.mockResolvedValue('pick')
    mockedGetStoredLanguage.mockResolvedValue('he')
    mockedGetStoredSecondaryLanguages.mockResolvedValue(['en'])
    await renderModal({theme: 'dark'})
    await waitFor(() => expect(selected('Game: Pick a Card')).toBe(true))
    expect(selected('Theme: Dark')).toBe(true)
    expect(selected('Language: Hebrew')).toBe(true)
    expect(selected('Second language: English')).toBe(true)
  })

  it('disables the language picker and drops the second language for a single-language deck', async () => {
    await renderModal({languages: ['en']})
    const language = await screen.findByLabelText('Language: English')
    expect(language.props.accessibilityState.disabled).toBe(true)
    expect(screen.queryByLabelText('Second language')).toBeNull()
  })

  it('closes from the X and from the sheet itself', async () => {
    const onClose = jest.fn()
    await renderModal({onClose})
    await fireEvent.press(await screen.findByLabelText('close'))
    await fireEvent.press(screen.getByLabelText('dismiss'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('re-reads stored settings on every open, so a change made in another sheet shows', async () => {
    const {rerender} = await renderModal({visible: false})
    mockedGetStoredTabletopMode.mockResolvedValue(true)
    mockedGetStoredLanguage.mockResolvedValue('he')
    const props = {
      onClose: () => {},
      deckSlug: 'library',
      languages: ['en', 'he'],
      theme: 'system' as const,
      onSelectTheme: () => {},
    }
    await rerender(<SettingsModal visible {...props} />)
    await waitFor(() =>
      expect(screen.getByLabelText('Tabletop mode').props.accessibilityState).toEqual({
        checked: true,
      })
    )
    expect(selected('Language: Hebrew')).toBe(true)
  })
})

describe('SettingsModal — Game', () => {
  it('stores a pick and reports it, in play too', async () => {
    const onSelectGame = jest.fn()
    await renderModal({onSelectGame})
    await fireEvent.press(await screen.findByLabelText('Game: Pick a Card'))
    expect(mockedSetStoredGame).toHaveBeenCalledWith('pick')
    expect(onSelectGame).toHaveBeenCalledWith('pick')
    expect(selected('Game: Pick a Card')).toBe(true)
  })

  it('shows the Game on screen over the stored one (a deep link always opens Classic)', async () => {
    mockedGetStoredGame.mockResolvedValue('pick')
    await renderModal({currentGame: 'wh'})
    await waitFor(() => expect(selected('Game: Classic')).toBe(true))
  })
})

describe('SettingsModal — languages, one picker each', () => {
  it('applies + persists a primary pick and tracks LANGUAGE_CHANGED', async () => {
    await renderModal()
    await fireEvent.press(await screen.findByLabelText('Language: Hebrew'))
    expect(mockedSetStoredLanguage).toHaveBeenCalledWith('library', 'he')
    expect(mockedTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'language_changed',
        props: expect.objectContaining({deck_id: 'library', from: 'en', to: 'he'}),
      })
    )
    expect(selected('Language: Hebrew')).toBe(true)
  })

  it('applies + persists a second language and tracks SECONDARY_LANGUAGES_CHANGED', async () => {
    await renderModal()
    await screen.findByText('Settings')
    await toggle('Second language')
    expect(mockedTrack).toHaveBeenCalledWith({
      name: 'secondary_languages_changed',
      props: {deck_id: 'library', secondary: ['he']},
    })
    expect(selected('Second language: Hebrew')).toBe(true)
  })

  it('clears the second language when it becomes the primary, and the switch clears and restores it', async () => {
    await renderModal({languages: ['en', 'he', 'es']})
    await screen.findByText('Settings')
    await toggle('Second language')
    expect(selected('Second language: Hebrew')).toBe(true)
    await fireEvent.press(screen.getByLabelText('Language: Hebrew'))
    expect(screen.getByLabelText('Second language').props.accessibilityState.checked).toBe(false)
    await fireEvent.press(screen.getByLabelText('Language: English'))
    await toggle('Second language')
    await fireEvent.press(screen.getByLabelText('Second language: Spanish'))
    await toggle('Second language')
    expect(screen.queryByLabelText('Second language: Spanish')).toBeNull()
    await toggle('Second language')
    expect(selected('Second language: Spanish')).toBe(true)
  })

  it("shows a shared link's language over the stored one and reports a pick of the stored one", async () => {
    mockedGetStoredLanguage.mockResolvedValue('en')
    const onSelectLanguage = jest.fn()
    await renderModal({currentLanguage: 'he', onSelectLanguage})
    await waitFor(() => expect(selected('Language: Hebrew')).toBe(true))
    expect(screen.queryByLabelText('Second language: Hebrew')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Language: English'))
    expect(onSelectLanguage).toHaveBeenCalledWith('en')
  })
})

describe('SettingsModal — inline controls', () => {
  it('switches Theme', async () => {
    const onSelectTheme = jest.fn()
    await renderModal({onSelectTheme})
    await fireEvent.press(await screen.findByLabelText('Theme: Dark'))
    expect(onSelectTheme).toHaveBeenCalledWith('dark')
  })

  it('picks Slide or Flip and stores the choice', async () => {
    await renderModal()
    await fireEvent.press(await screen.findByLabelText('Card animation: Flip'))
    expect(setStoredCardAnimation).toHaveBeenLastCalledWith('flip')
    expect(selected('Card animation: Flip')).toBe(true)
    await fireEvent.press(screen.getByLabelText('Card animation: Slide'))
    expect(setStoredCardAnimation).toHaveBeenLastCalledWith('slide')
  })

  it('flips Tabletop mode, persists it, and tracks it with no deck_id (global setting)', async () => {
    await renderModal()
    await screen.findByLabelText('Tabletop mode')
    await toggle('Tabletop mode')
    expect(mockedSetStoredTabletopMode).toHaveBeenCalledWith(true)
    expect(mockedTrack).toHaveBeenCalledWith({
      name: 'tabletop_mode_changed',
      props: {enabled: true},
    })
    expect(screen.getByLabelText('Tabletop mode').props.accessibilityState).toEqual({checked: true})
  })
})

describe('SettingsModal — Daily question (issues #361, #364)', () => {
  it('turning it off disables the time and keeps it on the row', async () => {
    await renderModal()
    await screen.findByLabelText('Time: 18:0')
    await toggle('Daily question')
    expect(setDailySetting).toHaveBeenCalledWith({enabled: false, hour: 18, minute: 0})
    expect(screen.getByLabelText('Time: 18:0').props.accessibilityState).toEqual({disabled: true})
  })

  it('stores a time picked in the system picker, minutes included', async () => {
    jest.mocked(getDailySetting).mockResolvedValue({enabled: true, hour: 9, minute: 0})
    await renderModal()
    await fireEvent.press(await screen.findByLabelText('Time: 9:0'))
    expect(setDailySetting).toHaveBeenCalledWith({enabled: true, hour: 7, minute: 30})
    expect(screen.getByLabelText('Time: 7:30')).toBeTruthy()
  })

  it('links to the OS setting only while notifications are not allowed', async () => {
    jest.mocked(notificationsAllowed).mockResolvedValue(false)
    await renderModal()
    const allow = await screen.findByLabelText('Allow notifications')
    jest.mocked(notificationsAllowed).mockResolvedValue(true)
    await fireEvent.press(allow)
    expect(openNotificationSetting).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByLabelText('Allow notifications')).toBeNull())
  })

  it('does not nag about OS permission while the daily question is off', async () => {
    jest.mocked(getDailySetting).mockResolvedValue({enabled: false, hour: 18, minute: 0})
    jest.mocked(notificationsAllowed).mockResolvedValue(false)
    await renderModal()
    await waitFor(() =>
      expect(screen.getByLabelText('Daily question').props.accessibilityState).toEqual({
        checked: false,
      })
    )
    expect(screen.queryByLabelText('Allow notifications')).toBeNull()
  })
})

describe('SettingsModal — Send feedback (issue #455)', () => {
  it('opens the contact form set to App feedback with this platform and version', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue()
    await renderModal()
    await fireEvent.press(await screen.findByLabelText('Send feedback'))
    const url = new URL(openURL.mock.calls[0]?.[0] ?? '')
    expect(url.pathname).toBe('/contact')
    expect(url.searchParams.get('about')).toBe('app-feedback')
    expect(url.searchParams.get('platform')).toBe(Platform.OS)
    openURL.mockRestore()
  })
})
