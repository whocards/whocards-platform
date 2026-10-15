import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {PendingAnswer, Upload, UploadOutcome} from './answer-queue'
import {
  createAnswerQueue,
  createAnswerUpload,
  MAX_ATTEMPTS,
  memoryAnswerStore,
  retryDelay,
} from './answer-queue'

const take = (turnId: string) => ({
  turnId,
  code: 'WORK',
  audio: new Blob(['x'], {type: 'audio/webm'}),
  durationMs: 1234.5,
})

const deferred = <T>() => Promise.withResolvers<T>()

const setup = (outcomes: UploadOutcome[] = []) => {
  const store = memoryAnswerStore()
  const upload = vi.fn<Upload>(async () => outcomes.shift() ?? 'saved')
  const queue = createAnswerQueue({store, upload})
  return {store, upload, queue}
}

const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => vi.useRealTimers())

describe('createAnswerQueue', () => {
  it('keeps the take until the server saved it, then forgets it', async () => {
    const {store, upload, queue} = setup()
    const gate = deferred<UploadOutcome>()
    upload.mockReturnValueOnce(gate.promise)
    queue.add(take('t1'))
    await settle()
    expect(queue.items()).toMatchObject([{turnId: 't1', failed: false}])
    expect(await store.load()).toHaveLength(1)

    gate.resolve('saved')
    await settle()
    expect(queue.items()).toEqual([])
    expect(await store.load()).toEqual([])
  })

  it('uploads one at a time, oldest first', async () => {
    const {upload, queue} = setup()
    const first = deferred<UploadOutcome>()
    upload.mockReturnValueOnce(first.promise)
    queue.add(take('t1'))
    queue.add(take('t2'))
    await settle()
    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0]?.[0].turnId).toBe('t1')

    first.resolve('saved')
    await settle()
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls[1]?.[0].turnId).toBe('t2')
    expect(queue.items()).toEqual([])
  })

  it('retries a network failure with growing backoff', async () => {
    const {upload, queue} = setup(['retry', 'retry'])
    upload.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    queue.add(take('t1'))
    await settle()
    expect(upload).toHaveBeenCalledOnce()
    expect(queue.items()[0]?.attempts).toBe(1)

    await vi.advanceTimersByTimeAsync(retryDelay(1) - 1)
    expect(upload).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(upload).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(retryDelay(2))
    expect(upload).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(retryDelay(3))
    expect(upload).toHaveBeenCalledTimes(4)
    expect(queue.items()).toEqual([])
    expect(retryDelay(3)).toBeGreaterThan(retryDelay(2))
  })

  it('lets a newer answer go while an older one waits out its backoff', async () => {
    const {upload, queue} = setup(['retry'])
    queue.add(take('t1'))
    await settle()
    queue.add(take('t2'))
    await settle()
    expect(upload.mock.calls.map(([a]) => a.turnId)).toEqual(['t1', 't2'])
    expect(queue.items().map((a) => a.turnId)).toEqual(['t1'])
  })

  it('gives up after the last attempt, or at once on a refusal, until retried', async () => {
    const {upload, queue} = setup([...Array<UploadOutcome>(MAX_ATTEMPTS).fill('retry'), 'failed'])
    queue.add(take('t1'))
    await vi.runAllTimersAsync()
    expect(upload).toHaveBeenCalledTimes(MAX_ATTEMPTS)
    expect(queue.items()).toMatchObject([{turnId: 't1', failed: true}])

    queue.retry('t1')
    await settle()
    expect(upload).toHaveBeenCalledTimes(MAX_ATTEMPTS + 1)
    expect(queue.items()).toMatchObject([{turnId: 't1', failed: true, attempts: 1}])

    queue.retry('t1')
    await settle()
    expect(queue.items()).toEqual([])
  })

  it('resumes what an earlier page left behind, failed ones included', async () => {
    const store = memoryAnswerStore()
    const left: PendingAnswer = {...take('t1'), recordedAt: 5, attempts: 3, failed: true}
    await store.put(left)
    await store.put({...take('t0'), recordedAt: 1, attempts: 0, failed: false})
    const upload = vi.fn<Upload>(async () => 'saved')
    const queue = createAnswerQueue({store, upload})

    await queue.start()
    await settle()
    expect(upload.mock.calls.map(([a]) => a.turnId)).toEqual(['t0', 't1'])
    expect(await store.load()).toEqual([])
  })

  it('starts once, however many screens ask', async () => {
    const store = memoryAnswerStore()
    const load = vi.spyOn(store, 'load')
    const queue = createAnswerQueue({store, upload: async () => 'saved'})
    await Promise.all([queue.start(), queue.start()])
    expect(load).toHaveBeenCalledOnce()
  })

  it('wakes a waiting retry when the network comes back', async () => {
    const {upload, queue} = setup(['retry'])
    queue.add(take('t1'))
    await settle()
    queue.retry()
    await settle()
    expect(upload).toHaveBeenCalledTimes(2)
    expect(queue.items()).toEqual([])
  })

  it('drops a discarded answer, even mid-upload', async () => {
    const {store, upload, queue} = setup()
    const gate = deferred<UploadOutcome>()
    upload.mockReturnValueOnce(gate.promise)
    queue.add(take('t1'))
    await settle()
    await queue.discard('t1')
    gate.resolve('retry')
    await vi.runAllTimersAsync()
    expect(upload).toHaveBeenCalledOnce()
    expect(queue.items()).toEqual([])
    expect(await store.load()).toEqual([])
  })

  it('tells subscribers about every change', async () => {
    const {queue} = setup()
    const listener = vi.fn<() => void>()
    queue.subscribe(listener)
    queue.add(take('t1'))
    await settle()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps working when storage refuses', async () => {
    const upload = vi.fn<Upload>(async () => 'saved')
    const broken = {
      load: () => Promise.reject(new Error('blocked')),
      put: () => Promise.reject(new Error('blocked')),
      remove: () => Promise.reject(new Error('blocked')),
    }
    const queue = createAnswerQueue({store: broken, upload})
    await queue.start()
    queue.add(take('t1'))
    await settle()
    expect(upload).toHaveBeenCalledOnce()
    expect(queue.items()).toEqual([])
  })
})

describe('createAnswerUpload', () => {
  const answer: PendingAnswer = {...take('t1'), recordedAt: 0, attempts: 0, failed: false}

  it('posts the audio, token, turn and rounded duration', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({saved: true}))
    expect(await createAnswerUpload(() => 'tok', fetcher)(answer)).toBe('saved')
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('/api/game/answer')
    const body = init?.body
    expect(body).toBeInstanceOf(FormData)
    if (!(body instanceof FormData)) return
    expect(body.get('token')).toBe('tok')
    expect(body.get('turnId')).toBe('t1')
    expect(body.get('durationMs')).toBe('1235')
    expect(body.get('audio')).toBeInstanceOf(Blob)
  })

  const outcome = (status: number) =>
    createAnswerUpload(
      () => 'tok',
      async () => Response.json({error: 'x'}, {status})
    )(answer)

  it('retries server trouble and in-flight conflicts, gives up on refusals', async () => {
    for (const status of [409, 429, 500, 502, 503]) expect(await outcome(status)).toBe('retry')
    for (const status of [400, 401, 403, 404, 413, 422])
      expect(await outcome(status)).toBe('failed')
  })

  it('fails without a token for the game', async () => {
    const fetcher = vi.fn<typeof fetch>()
    expect(await createAnswerUpload(() => null, fetcher)(answer)).toBe('failed')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
