import React from 'react'
import {StyleSheet} from 'react-native'
import {fireEvent, render, screen} from '@testing-library/react-native'
import {GestureHandlerRootView} from 'react-native-gesture-handler'

jest.setTimeout(20_000)

let mockReduceMotion = false
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))
jest.mock('react-native-reanimated', () => ({
  ...require('@/test-utils/reanimated-mock').reanimatedMock(),
  useReducedMotion: () => mockReduceMotion,
}))
jest.mock('expo-router', () => ({useRouter: () => ({back: jest.fn(), push: jest.fn()})}))
jest.mock('@/hooks/use-review-prompt', () => ({useReviewPrompt: () => jest.fn()}))
jest.mock('@/lib/app-review', () => ({
  incrementCardCount: jest.fn().mockResolvedValue(undefined),
  incrementSessionCount: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/device-id', () => ({getDeviceId: jest.fn().mockResolvedValue('device')}))
jest.mock('@/lib/answer-queue', () => ({enqueue: jest.fn(), flush: jest.fn()}))
jest.mock('@/components/settings-modal', () => ({SettingsModal: () => null}))
jest.mock('@/hooks/use-theme-setting', () => ({
  useThemeSetting: () => ({theme: 'system', select: jest.fn()}),
}))
jest.mock('@/lib/tabletop-store', () => ({
  getStoredTabletopMode: jest.fn().mockResolvedValue(false),
}))
jest.mock('@/lib/language-store', () => ({
  getStoredLanguage: jest.fn().mockResolvedValue(undefined),
  getStoredSecondaryLanguages: jest.fn().mockResolvedValue([]),
}))
jest.mock('@whocards/observability', () => ({trackEvent: jest.fn(), logWarn: jest.fn()}))
jest.mock('@whocards/observability/events', () => {
  const actual = jest.requireActual('@whocards/observability/events')
  return {...actual, track: jest.fn()}
})

import {PickPlayer} from '../components/pick-player'

const QUESTION = 'What made you smile today?'

const revealCard = async () => {
  await render(
    <GestureHandlerRootView>
      <PickPlayer
        deckSlug="test"
        questionIds={['q1', 'q2']}
        questions={{q1: {en: QUESTION}, q2: {en: QUESTION}}}
        languages={['en']}
        poolBacked={false}
      />
    </GestureHandlerRootView>
  )
  await fireEvent.press(await screen.findByLabelText('Pick a card'))
}

/** The animated style of the face the question sits on. */
const faceStyle = () => {
  for (let node = screen.getByText(QUESTION).parent; node; node = node.parent) {
    const style = StyleSheet.flatten(node.props.style)
    if (style && ('opacity' in style || 'backfaceVisibility' in style)) return style
  }
  throw new Error('no animated face above the question')
}

describe('PickPlayer — moving on (issue #456)', () => {
  afterEach(() => {
    mockReduceMotion = false
  })

  it('flips the read Card face-down and hands back to the draw', async () => {
    await revealCard()
    expect(faceStyle()).toMatchObject({backfaceVisibility: 'hidden'})
    await fireEvent.press(screen.getByLabelText('Tap for next card'))
    expect(screen.queryByText(QUESTION)).toBeNull()
    expect(screen.getByLabelText('Pick a card')).toBeTruthy()
  })

  it('crossfades instead of flipping under Reduce Motion', async () => {
    mockReduceMotion = true
    await revealCard()
    expect(faceStyle()).toMatchObject({opacity: 1})
    expect(faceStyle()).not.toHaveProperty('transform')
    await fireEvent.press(screen.getByLabelText('Tap for next card'))
    expect(screen.queryByText(QUESTION)).toBeNull()
    expect(screen.getByLabelText('Pick a card')).toBeTruthy()
  })
})
