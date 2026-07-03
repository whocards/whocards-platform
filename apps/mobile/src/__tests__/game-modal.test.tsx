/**
 * Component test for src/components/game-modal.tsx (issue #189, second pass):
 * SettingsModal's own wiring (which row opens this sheet, applying/persisting
 * a selection) is already covered by settings-modal.test.tsx's "Game (nested
 * sheet)" describe block. This file covers what's new to GameModal itself
 * now that it's a compact bottom sheet rather than a `pageSheet`: the
 * backdrop is a real, separately-labeled element that dismisses on press,
 * same contract every other sheet in this family (share-modal.tsx,
 * settings-modal.tsx) already has tests for.
 */
import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

import {GameModal} from '../components/game-modal'

const renderModal = (onClose = jest.fn()) =>
  render(<GameModal visible current="wh" onSelect={() => {}} onClose={onClose} />)

describe('GameModal — compact sheet (issue #189, second pass)', () => {
  it('renders the game catalog', async () => {
    renderModal()
    await screen.findByText('Choose your game')
    expect(screen.getByText('Classic')).toBeTruthy()
    expect(screen.getByText('Pick a Card')).toBeTruthy()
  })

  it('dismisses on backdrop press', async () => {
    const onClose = jest.fn()
    renderModal(onClose)
    await screen.findByText('Choose your game')
    fireEvent.press(screen.getByLabelText('dismiss'))
    expect(onClose).toHaveBeenCalled()
  })

  it('dismisses on close-button press', async () => {
    const onClose = jest.fn()
    renderModal(onClose)
    await screen.findByText('Choose your game')
    fireEvent.press(screen.getByLabelText('close'))
    expect(onClose).toHaveBeenCalled()
  })
})
