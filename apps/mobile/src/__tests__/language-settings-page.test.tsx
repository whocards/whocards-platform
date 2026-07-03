/**
 * Component test for src/components/language-settings-page.tsx (issue #189,
 * third/fourth pass — extracted from the standalone `LanguageModal` the
 * second pass built; the "Also show" secondary picker that used to live on
 * this page split out into its own page in the fourth pass — see
 * second-language-settings-page.test.tsx). SettingsModal's own pager wiring
 * (which row navigates here, the rise, auto-returning to the menu on select)
 * is covered by settings-modal.test.tsx; this file covers the page's own
 * content: the primary-language list, the single-language-deck shape, and
 * the back arrow reporting via `onBack`. The header inset/icon logic itself
 * is covered once, generically, in settings-sheet-header.test.tsx — not
 * duplicated per page.
 *
 * Issue #176 reduced the secondary/"Also show" language from up to 2 down to
 * at most 1 — that cap logic now lives with the split-out secondary page, not
 * here.
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

describe('LanguageSettingsPage — "Also show" moved out (issue #189, fourth pass)', () => {
  it('never renders an "Also show" section — that setting is its own page now', async () => {
    renderPage()
    await screen.findByText('Choose your language')
    expect(screen.queryByText('Also show')).toBeNull()
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

  it('marks the current primary language selected', async () => {
    renderPage()
    const english = await screen.findByText('English')
    // The primary rows are matched by their Text content (no explicit
    // accessibilityLabel — same as before the split), so walk up from the
    // Text node to the Pressable ancestor carrying accessibilityState.
    let node: typeof english | null = english
    while (node && node.props?.accessibilityState === undefined) node = node.parent
    expect(node?.props.accessibilityState).toEqual({selected: true})
  })
})
