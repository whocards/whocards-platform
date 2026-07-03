/**
 * Component test for src/components/language-settings-page.tsx (issue #189,
 * third pass — extracted from the standalone `LanguageModal` the second pass
 * built). SettingsModal's own pager wiring (which row navigates here, the
 * slide — and NOT auto-navigating back on select, unlike Game/Theme) is
 * covered by settings-modal.test.tsx; this file covers the page's own
 * content: the primary-language list, the "Also show" secondary section, the
 * single-language-deck shape, and the back arrow reporting via `onBack`. The
 * header inset/icon logic itself is covered once, generically, in
 * settings-sheet-header.test.tsx — not duplicated per page.
 *
 * Issue #176 moved Tabletop mode out of this sheet entirely (it's now an inline
 * switch row in settings-modal.tsx) and reduced the secondary/"Also show"
 * language from up to 2 down to at most 1 — picking a different one now
 * replaces, rather than appending until a cap blocks further picks.
 *
 * Also covers the single-language-deck shape (issue #148 review, finding 1,
 * carried forward by #176): with one language there's no real choice to make,
 * so the primary-language list is hidden rather than rendering one inert,
 * always-checked row.
 */
import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

import {LanguageSettingsPage} from '../components/language-settings-page'

const renderPage = () =>
  render(
    <LanguageSettingsPage
      languages={['en', 'he']}
      current="en"
      onSelect={() => {}}
      onBack={() => {}}
    />
  )

describe('LanguageSettingsPage — Tabletop mode moved out (issue #176)', () => {
  it('never renders a Tabletop mode row — that setting lives in settings-modal.tsx now', async () => {
    renderPage()
    await screen.findByText('Choose your language')
    expect(screen.queryByText('Tabletop mode')).toBeNull()
    expect(screen.queryByLabelText('Tabletop mode')).toBeNull()
  })
})

describe('LanguageSettingsPage — back arrow', () => {
  it('reports the back arrow press via onBack', async () => {
    const onBack = jest.fn()
    render(
      <LanguageSettingsPage
        languages={['en', 'he']}
        current="en"
        onSelect={() => {}}
        onBack={onBack}
      />
    )
    await screen.findByText('Choose your language')
    fireEvent.press(screen.getByLabelText('back'))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('LanguageSettingsPage — single-language deck (issue #148 review, carried by #176)', () => {
  it('titles the page "Language", not "Choose your language"', async () => {
    render(
      <LanguageSettingsPage languages={['en']} current="en" onSelect={() => {}} onBack={() => {}} />
    )
    await screen.findByText('Language')
    expect(screen.queryByText('Choose your language')).toBeNull()
  })

  it('hides the inert, always-checked language row', async () => {
    render(
      <LanguageSettingsPage languages={['en']} current="en" onSelect={() => {}} onBack={() => {}} />
    )
    await screen.findByText('Language')
    expect(screen.queryByText('English')).toBeNull()
  })

  it('keeps "Choose your language" and the language row for a multi-language deck', async () => {
    renderPage()
    await screen.findByText('Choose your language')
    expect(screen.getByText('English')).toBeTruthy()
  })
})

describe('LanguageSettingsPage — primary selection', () => {
  it('reports the pressed language via onSelect', async () => {
    const onSelect = jest.fn()
    render(
      <LanguageSettingsPage
        languages={['en', 'he']}
        current="en"
        onSelect={onSelect}
        onBack={() => {}}
      />
    )
    const hebrew = await screen.findByText('Hebrew')
    fireEvent.press(hebrew)
    expect(onSelect).toHaveBeenCalledWith('he')
  })
})

const renderWithSecondary = (secondary: string[], onSecondaryChange = jest.fn()) =>
  render(
    <LanguageSettingsPage
      languages={['en', 'he', 'es']}
      current="en"
      secondary={secondary}
      onSelect={() => {}}
      onSecondaryChange={onSecondaryChange}
      onBack={() => {}}
    />
  )

describe('LanguageSettingsPage — "Also show" secondary language (issue #176: at most 1)', () => {
  it('is absent when the caller does not supply onSecondaryChange', async () => {
    render(
      <LanguageSettingsPage
        languages={['en', 'he']}
        current="en"
        onSelect={() => {}}
        onBack={() => {}}
      />
    )
    await screen.findByText('Choose your language')
    expect(screen.queryByText('Also show')).toBeNull()
  })

  it('is absent for a single-language deck (no possible alternate)', async () => {
    render(
      <LanguageSettingsPage
        languages={['en']}
        current="en"
        onSelect={() => {}}
        onSecondaryChange={() => {}}
        onBack={() => {}}
      />
    )
    await screen.findByText('Language')
    expect(screen.queryByText('Also show')).toBeNull()
  })

  it('describes the cap as one more language, not several', async () => {
    renderWithSecondary([])
    await screen.findByText('Also show')
    expect(screen.getByText('Show the question in one more language.')).toBeTruthy()
  })

  it('reflects the checked state of the current secondary', async () => {
    renderWithSecondary(['he'])
    const checked = await screen.findByLabelText('Hebrew')
    expect(checked.props.accessibilityState).toEqual({checked: true})
    const unchecked = screen.getByLabelText('Spanish')
    expect(unchecked.props.accessibilityState).toEqual({checked: false})
  })

  it('picking a new secondary REPLACES the previous one (no append-until-cap)', async () => {
    const onSecondaryChange = jest.fn()
    renderWithSecondary(['he'], onSecondaryChange)
    const spanish = await screen.findByLabelText('Spanish')
    fireEvent.press(spanish)
    expect(onSecondaryChange).toHaveBeenCalledWith(['es'])
  })

  it('pressing the already-chosen secondary clears it', async () => {
    const onSecondaryChange = jest.fn()
    renderWithSecondary(['he'], onSecondaryChange)
    const hebrew = await screen.findByLabelText('Hebrew')
    fireEvent.press(hebrew)
    expect(onSecondaryChange).toHaveBeenCalledWith([])
  })

  it('never lists the current primary as a secondary checkbox option', async () => {
    renderWithSecondary([])
    await screen.findByText('Also show')
    // Only "Also show" rows carry an accessibilityLabel (the primary-language
    // rows above are matched by their Text content, not a label) — so a null
    // result here means "English" (the current primary) never got a checkbox row.
    expect(screen.queryByLabelText('English')).toBeNull()
  })
})
