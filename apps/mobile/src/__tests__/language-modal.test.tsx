/**
 * Component test for src/components/language-modal.tsx
 *
 * Guards the Pixel-notch fix (#102): on Android, `statusBarTranslucent` (issue
 * #189, second pass — this sheet was a `pageSheet` originally) draws the sheet
 * behind the status bar, so the header must add the top safe-area inset to
 * clear the display cutout. On iOS the sheet is bottom-anchored and
 * content-hugging (it doesn't reach the status bar in the normal case, same
 * as every sheet in this family — see settings-modal.tsx), so the header
 * keeps its original 16px (`py-4`) top padding there. We assert the resolved
 * header `paddingTop` per platform so a future edit can't silently drop the
 * inset (re-overlapping the clock) or double-pad iOS.
 *
 * Issue #176 moved Tabletop mode out of this sheet entirely (it's now an inline
 * switch row in settings-modal.tsx, the sheet that now opens this one) and
 * reduced the secondary/"Also show" language from up to 2 down to at most 1 —
 * picking a different one now replaces, rather than appending until a cap
 * blocks further picks.
 *
 * Also covers the single-language-deck shape (issue #148 review, finding 1,
 * carried forward by #176): with one language there's no real choice to make,
 * so the primary-language list is hidden rather than rendering one inert,
 * always-checked row.
 */
import React from 'react'
import {Platform, StyleSheet} from 'react-native'
import type {ViewStyle} from 'react-native'
import {fireEvent, render, screen} from '@testing-library/react-native'

const TOP_INSET = 47 // a representative status-bar/cutout height (e.g. a Pixel)

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: TOP_INSET, bottom: 34, left: 0, right: 0}),
}))

import {LanguageModal} from '../components/language-modal'

// Walk up from the title until we find the ancestor whose flattened style sets
// paddingTop — that's the header View carrying the inset fix. Robust whether or not
// NativeWind compiles className→style in the jest environment (the inline style wins
// either way, so the flattened paddingTop is the value under test).
const headerPaddingTop = (): number => {
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText('Choose your language')
  while (node) {
    const flat = StyleSheet.flatten(node.props?.style as ViewStyle | undefined)
    if (flat && typeof flat.paddingTop === 'number') return flat.paddingTop
    node = node.parent
  }
  throw new Error('header paddingTop not found')
}

const renderModal = () =>
  render(
    <LanguageModal
      visible
      languages={['en', 'he']}
      current="en"
      onSelect={() => {}}
      onClose={() => {}}
    />
  )

describe('LanguageModal header inset', () => {
  const originalOS = Platform.OS
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: originalOS})
  })

  it('adds the top safe-area inset on Android so the title clears the status bar', async () => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'})
    renderModal()
    // findBy* flushes the close-icon's async font load inside act(), keeping output clean
    await screen.findByText('Choose your language')
    expect(headerPaddingTop()).toBe(TOP_INSET + 16)
  })

  it('keeps the original 16px top padding on iOS (bottom-anchored, content-hugging — see doc comment)', async () => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'ios'})
    renderModal()
    await screen.findByText('Choose your language')
    expect(headerPaddingTop()).toBe(16)
  })
})

describe('LanguageModal — Tabletop mode moved out (issue #176)', () => {
  it('never renders a Tabletop mode row — that setting lives in settings-modal.tsx now', async () => {
    renderModal()
    await screen.findByText('Choose your language')
    expect(screen.queryByText('Tabletop mode')).toBeNull()
    expect(screen.queryByLabelText('Tabletop mode')).toBeNull()
  })
})

describe('LanguageModal — single-language deck (issue #148 review, carried by #176)', () => {
  it('titles the sheet "Language", not "Choose your language"', async () => {
    render(
      <LanguageModal
        visible
        languages={['en']}
        current="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    )
    await screen.findByText('Language')
    expect(screen.queryByText('Choose your language')).toBeNull()
  })

  it('hides the inert, always-checked language row', async () => {
    render(
      <LanguageModal
        visible
        languages={['en']}
        current="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    )
    await screen.findByText('Language')
    expect(screen.queryByText('English')).toBeNull()
  })

  it('keeps "Choose your language" and the language row for a multi-language deck', async () => {
    renderModal()
    await screen.findByText('Choose your language')
    expect(screen.getByText('English')).toBeTruthy()
  })
})

const renderWithSecondary = (secondary: string[], onSecondaryChange = jest.fn()) =>
  render(
    <LanguageModal
      visible
      languages={['en', 'he', 'es']}
      current="en"
      secondary={secondary}
      onSelect={() => {}}
      onSecondaryChange={onSecondaryChange}
      onClose={() => {}}
    />
  )

describe('LanguageModal — "Also show" secondary language (issue #176: at most 1)', () => {
  it('is absent when the caller does not supply onSecondaryChange', async () => {
    render(
      <LanguageModal
        visible
        languages={['en', 'he']}
        current="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    )
    await screen.findByText('Choose your language')
    expect(screen.queryByText('Also show')).toBeNull()
  })

  it('is absent for a single-language deck (no possible alternate)', async () => {
    render(
      <LanguageModal
        visible
        languages={['en']}
        current="en"
        onSelect={() => {}}
        onSecondaryChange={() => {}}
        onClose={() => {}}
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

describe('LanguageModal — compact sheet (issue #189, second pass)', () => {
  it('dismisses on backdrop press', async () => {
    const onClose = jest.fn()
    render(
      <LanguageModal
        visible
        languages={['en', 'he']}
        current="en"
        onSelect={() => {}}
        onClose={onClose}
      />
    )
    await screen.findByText('Choose your language')
    fireEvent.press(screen.getByLabelText('dismiss'))
    expect(onClose).toHaveBeenCalled()
  })

  it('dismisses on close-button press', async () => {
    const onClose = jest.fn()
    render(
      <LanguageModal
        visible
        languages={['en', 'he']}
        current="en"
        onSelect={() => {}}
        onClose={onClose}
      />
    )
    await screen.findByText('Choose your language')
    fireEvent.press(screen.getByLabelText('close'))
    expect(onClose).toHaveBeenCalled()
  })
})
