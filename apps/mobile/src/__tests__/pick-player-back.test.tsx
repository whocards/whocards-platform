import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react-native'
import {GestureHandlerRootView, State} from 'react-native-gesture-handler'
import {fireGestureHandler, getByGestureTestId} from 'react-native-gesture-handler/jest-utils'

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
jest.mock('@/lib/notification-store', () => ({notePromptShown: jest.fn()}))
jest.mock('@/components/settings-modal', () => ({SettingsModal: () => null}))
jest.mock('@/hooks/use-theme-setting', () => ({
  useThemeSetting: () => ({theme: 'system', select: jest.fn()}),
}))
const mockCardAnimation = jest.fn()
jest.mock('@/lib/card-animation-store', () => ({
  getStoredCardAnimation: () => mockCardAnimation(),
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

const TEXTS = [
  'Who taught you to ride a bike?',
  'What song is stuck in your head?',
  'Where did you grow up?',
]

const renderPlayer = () =>
  render(
    <GestureHandlerRootView>
      <PickPlayer
        deckSlug="test"
        questionIds={['q1', 'q2', 'q3']}
        questions={{q1: {en: TEXTS[0]}, q2: {en: TEXTS[1]}, q3: {en: TEXTS[2]}}}
        languages={['en']}
        poolBacked={false}
        carryRef={{current: undefined}}
        onChangeGame={() => {}}
      />
    </GestureHandlerRootView>
  )

/** The Question on the face-up Card, or undefined on the Deck. */
const shown = () => TEXTS.find((text) => screen.queryByText(text))

// Each step moves the Card a frame after its Question commits.
const settle = () => act(() => new Promise((resolve) => requestAnimationFrame(resolve)))

const deal = async () => {
  await fireEvent.press(await screen.findByLabelText('Pick a card'))
  await settle()
}

const swipe = async (translationX: number) => {
  await act(() =>
    fireGestureHandler(getByGestureTestId('card-pan'), [
      {state: State.BEGAN},
      {state: State.ACTIVE, translationX},
      {state: State.END, translationX},
    ])
  )
  await settle()
}

describe.each(['slide', 'flip'])('PickPlayer Back with Card animation %s', (animation) => {
  beforeEach(() => {
    mockCardAnimation.mockResolvedValue(animation)
  })

  it('swipes back to the previous Card and forward through it again', async () => {
    await renderPlayer()
    await deal()
    const first = shown()
    await swipe(-120)
    await deal()
    const second = shown()
    expect(second).not.toBe(first)
    await swipe(120)
    expect(shown()).toBe(first)
    await swipe(-120)
    expect(shown()).toBe(second)
    await swipe(-120)
    expect(shown()).toBeUndefined()
    expect(screen.getByLabelText('Pick a card')).toBeTruthy()
  })

  it('goes back with the bar button too', async () => {
    await renderPlayer()
    await deal()
    const first = shown()
    await fireEvent.press(screen.getByLabelText('next question'))
    await deal()
    await fireEvent.press(screen.getByLabelText('previous question'))
    await settle()
    expect(shown()).toBe(first)
  })

  it('brings the put-down Card back with a swipe right on the Deck', async () => {
    await renderPlayer()
    await deal()
    const first = shown()
    await swipe(-120)
    expect(shown()).toBeUndefined()
    await swipe(120)
    expect(shown()).toBe(first)
  })

  it('leaves the Deck alone after a short drag right', async () => {
    await renderPlayer()
    await deal()
    await swipe(-120)
    await swipe(20)
    expect(shown()).toBeUndefined()
    await deal()
    expect(shown()).toBeDefined()
  })
})
