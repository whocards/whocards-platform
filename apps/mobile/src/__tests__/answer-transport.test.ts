/**
 * Tests the recording gate in src/lib/answer-transport.ts: a release build always
 * sends; a dev build only sends when EXPO_PUBLIC_RECORD_ANSWERS=true (the shared
 * @whocards/api recording policy). trpc is mocked so no network is touched.
 */

const mockMutate = jest.fn(async (_event: unknown): Promise<void> => {})

jest.mock('@/lib/trpc', () => ({
  trpc: {answers: {record: {mutate: (event: unknown) => mockMutate(event)}}},
}))

import {send} from '../lib/answer-transport'
import type {AnswerEvent} from '../lib/answer-queue'

const EVENT: AnswerEvent = {deviceId: 'd1', deckSlug: 'library', questionId: 'q1', language: 'en'}

/** Toggle the React Native `__DEV__` global. Wrapped to avoid no-underscore-dangle. */
// oxlint-disable-next-line no-underscore-dangle
const setDev = (value: boolean) => void ((globalThis as Record<string, unknown>)['__DEV__'] = value)

const ORIGINAL_OPT_IN = process.env.EXPO_PUBLIC_RECORD_ANSWERS

afterEach(() => {
  mockMutate.mockClear()
  setDev(true)
  if (ORIGINAL_OPT_IN === undefined) {
    delete process.env.EXPO_PUBLIC_RECORD_ANSWERS
  } else {
    process.env.EXPO_PUBLIC_RECORD_ANSWERS = ORIGINAL_OPT_IN
  }
})

describe('send (recording gate)', () => {
  it('records in a release build', async () => {
    setDev(false)
    delete process.env.EXPO_PUBLIC_RECORD_ANSWERS
    await send(EVENT)
    expect(mockMutate).toHaveBeenCalledWith(EVENT)
  })

  it('skips in dev without the opt-in env var', async () => {
    setDev(true)
    delete process.env.EXPO_PUBLIC_RECORD_ANSWERS
    await send(EVENT)
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('records in dev when EXPO_PUBLIC_RECORD_ANSWERS=true', async () => {
    setDev(true)
    process.env.EXPO_PUBLIC_RECORD_ANSWERS = 'true'
    await send(EVENT)
    expect(mockMutate).toHaveBeenCalledWith(EVENT)
  })
})
