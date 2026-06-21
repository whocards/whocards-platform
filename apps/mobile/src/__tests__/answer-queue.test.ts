/**
 * Tests for src/lib/answer-queue.ts
 *
 * Covers: enqueue persistence, flush drain-on-success, flush stop-on-failure,
 * the MAX_QUEUE trim, and corrupt-storage recovery.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

jest.mock('@whocards/logger', () => ({
  logWarn: jest.fn(),
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import {enqueue, flush} from '../lib/answer-queue'
import type {AnswerEvent} from '../lib/answer-queue'

const QUEUE_KEY = 'whocards-answer-queue'

const makeEvent = (n: number): AnswerEvent => ({
  deviceId: `device-${n}`,
  deckSlug: 'friends',
  questionId: `q-${n}`,
  language: 'en',
})

const okSend = jest.fn(async (_e: AnswerEvent) => {})

const failSend = jest.fn(async (_e: AnswerEvent): Promise<void> => {
  throw new Error('network error')
})

beforeEach(async () => {
  await AsyncStorage.clear()
  okSend.mockClear()
  failSend.mockClear()
})

describe('enqueue', () => {
  it('drains the event immediately when send succeeds (queue ends up empty)', async () => {
    await enqueue(makeEvent(1), okSend)

    // okSend succeeded — the queue is drained (no pending items left).
    const stored = await AsyncStorage.getItem(QUEUE_KEY)
    // After a successful send the queue is empty → removeItem was called.
    expect(stored).toBeNull()
    expect(okSend).toHaveBeenCalledTimes(1)
  })

  it('leaves the event in storage when send fails', async () => {
    await enqueue(makeEvent(1), failSend)

    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    expect(raw).not.toBeNull()
    const parsed: AnswerEvent[] = JSON.parse(raw ?? 'null')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].questionId).toBe('q-1')
  })

  it('accumulates multiple failed events in order', async () => {
    await enqueue(makeEvent(1), failSend)
    await enqueue(makeEvent(2), failSend)
    await enqueue(makeEvent(3), failSend)

    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    const parsed: AnswerEvent[] = JSON.parse(raw ?? 'null')
    expect(parsed).toHaveLength(3)
    expect(parsed.map((e) => e.questionId)).toEqual(['q-1', 'q-2', 'q-3'])
  })

  it('trims the queue to MAX_QUEUE (500) oldest-first', async () => {
    // Fill the queue to 500 via direct AsyncStorage to avoid 500 slow enqueue calls.
    const initial: AnswerEvent[] = Array.from({length: 500}, (_, i) => makeEvent(i))
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(initial))

    // Enqueue one more — this should trim the oldest entry.
    await enqueue(makeEvent(500), failSend)

    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    const parsed: AnswerEvent[] = JSON.parse(raw ?? 'null')
    expect(parsed).toHaveLength(500)
    // Oldest (q-0) is gone; newest (q-500) is at the end.
    expect(parsed[0].questionId).toBe('q-1')
    expect(parsed[499].questionId).toBe('q-500')
  })
})

describe('flush', () => {
  it('is a no-op when the queue is empty', async () => {
    await flush(okSend)
    expect(okSend).not.toHaveBeenCalled()
  })

  it('drains all events when send succeeds', async () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)]
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(events))

    await flush(okSend)

    expect(okSend).toHaveBeenCalledTimes(3)
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    expect(raw).toBeNull()
  })

  it('stops draining at the first failure and keeps remaining events', async () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)]
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(events))

    const partialSend = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('timeout'))

    await flush(partialSend)

    // First event sent successfully; two remain.
    expect(partialSend).toHaveBeenCalledTimes(2)
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    const parsed: AnswerEvent[] = JSON.parse(raw ?? 'null')
    expect(parsed).toHaveLength(2)
    expect(parsed[0].questionId).toBe('q-2')
  })

  it('recovers from corrupt JSON by treating the queue as empty', async () => {
    await AsyncStorage.setItem(QUEUE_KEY, 'this is not json')

    // Should not throw; send is never called (empty queue after parse failure).
    await expect(flush(okSend)).resolves.toBeUndefined()
    expect(okSend).not.toHaveBeenCalled()
  })
})
