/** The inline segmented control the Settings sheet uses for Theme and Card animation (issue #460). */
import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react-native'
import {colors} from '@whocards/tokens'

import {setColorScheme} from '@/lib/color-scheme'
import {resolvedStyle} from '@/test-utils/resolved-style'

import {SegmentedControl} from '../components/segmented-control'

const OPTIONS = [
  {value: 'system', label: 'System'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
] as const

const renderControl = async (current: 'system' | 'light' | 'dark', onSelect = jest.fn()) =>
  await render(
    <SegmentedControl label="Theme" options={OPTIONS} current={current} onSelect={onSelect} />
  )

const background = (label: string) => resolvedStyle(screen.getByLabelText(label)).backgroundColor

describe('SegmentedControl', () => {
  it('marks the current option selected', async () => {
    await renderControl('dark')
    expect(screen.getByLabelText('Theme: Dark').props.accessibilityState).toEqual({selected: true})
    expect(screen.getByLabelText('Theme: System').props.accessibilityState).toEqual({
      selected: false,
    })
  })

  it('reports the pressed option', async () => {
    const onSelect = jest.fn()
    await renderControl('system', onSelect)
    await fireEvent.press(screen.getByLabelText('Theme: Light'))
    expect(onSelect).toHaveBeenCalledWith('light')
  })

  it('fills the selected segment with white on light, leaving the others bare', async () => {
    await act(() => setColorScheme('light'))
    await renderControl('dark')
    expect(background('Theme: Dark')).toBe(colors.white)
    expect(background('Theme: System')).toBeUndefined()
  })

  it('fills the selected segment with the dark token on dark', async () => {
    await act(() => setColorScheme('dark'))
    await renderControl('light')
    expect(background('Theme: Light')).toBe(colors.dark)
    expect(background('Theme: System')).toBeUndefined()
  })
})
