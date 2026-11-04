/**
 * Tabletop mode in Pick a Card (issue #170): the revealed Card's question face
 * mirrors like Classic's, with the rotated copy hidden from screen readers.
 */
import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react-native'
import {GestureHandlerRootView} from 'react-native-gesture-handler'

jest.setTimeout(20_000)

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))
jest.mock('react-native-reanimated', () => require('@/test-utils/reanimated-mock').reanimatedMock())
jest.mock('expo-router', () => ({useRouter: () => ({back: jest.fn(), push: jest.fn()})}))
jest.mock('@/hooks/use-review-prompt', () => ({useReviewPrompt: () => jest.fn()}))
jest.mock('@/lib/app-review', () => ({
  incrementCardCount: jest.fn().mockResolvedValue(undefined),
  incrementSessionCount: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/device-id', () => ({getDeviceId: jest.fn().mockResolvedValue('device')}))
jest.mock('@/lib/answer-queue', () => ({enqueue: jest.fn(), flush: jest.fn()}))
jest.mock('@/lib/tabletop-store', () => ({getStoredTabletopMode: jest.fn()}))
jest.mock('@/lib/language-store', () => ({
  getStoredLanguage: jest.fn().mockResolvedValue(undefined),
  getStoredSecondaryLanguages: jest.fn().mockResolvedValue([]),
}))
jest.mock('@whocards/observability', () => ({trackEvent: jest.fn(), logWarn: jest.fn()}))
jest.mock('@whocards/observability/events', () => {
  const actual = jest.requireActual('@whocards/observability/events')
  return {...actual, track: jest.fn()}
})

import {getStoredTabletopMode} from '@/lib/tabletop-store'
import {PickPlayer} from '../components/pick-player'

const QUESTION = 'What made you smile today?'

const revealCard = async (tabletop: boolean) => {
  jest.mocked(getStoredTabletopMode).mockResolvedValue(tabletop)
  await render(
    <GestureHandlerRootView>
      <PickPlayer
        deckSlug="test"
        questionIds={['q1']}
        questions={{q1: {en: QUESTION}}}
        languages={['en']}
        poolBacked={false}
      />
    </GestureHandlerRootView>
  )
  await fireEvent.press(await screen.findByLabelText('Pick a card'))
}

/** True when an ancestor hides `node` from the accessibility tree. */
type Node = ReturnType<typeof screen.getAllByText>[number]

const hiddenFromA11y = (node: Node) => {
  for (let n: Node | null = node; n; n = n.parent) {
    if (n.props.accessibilityElementsHidden) return true
  }
  return false
}

describe('PickPlayer — Tabletop mode (issue #170)', () => {
  it('renders the revealed question once when Tabletop is off', async () => {
    await revealCard(false)
    expect(screen.getAllByText(QUESTION, {includeHiddenElements: true})).toHaveLength(1)
  })

  it('mirrors the revealed question with the rotated copy hidden from screen readers', async () => {
    await revealCard(true)
    const copies = screen.getAllByText(QUESTION, {includeHiddenElements: true})
    expect(copies).toHaveLength(2)
    expect(copies.filter((node) => hiddenFromA11y(node))).toHaveLength(1)
    expect(screen.getAllByText(QUESTION)).toHaveLength(1)
  })
})
