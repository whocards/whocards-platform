import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * One queued Answer — a Device answered a Question in some Deck and language.
 * Matches the `answers.record` mutation input (ticket 0003 B2/M3). Defined
 * locally so the queue is decoupled from tRPC; it knows only its `send`.
 */
export type AnswerEvent = {
  deviceId: string
  deckSlug: string
  questionId: string
  language: string
}

/** Sends one event to the Answer record; rejects so the queue can retry. */
export type SendAnswer = (event: AnswerEvent) => Promise<void>

/** AsyncStorage key holding the JSON-serialised pending queue. */
const QUEUE_KEY = 'whocards-answer-queue'

/**
 * Cap on the persisted queue. Recording is best-effort feeding of the shared
 * Global progress, not durable client state, so an unbounded backlog (e.g. a
 * Device that plays offline forever) is trimmed oldest-first rather than grown.
 */
const MAX_QUEUE = 500

// serialise reads/writes so concurrent enqueue + flush don't clobber the store
let lock: Promise<void> = Promise.resolve()

const withLock = <T>(task: () => Promise<T>): Promise<T> => {
  const run = lock.then(task, task)
  // keep the chain alive regardless of this task's outcome
  lock = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

const read = async (): Promise<AnswerEvent[]> => {
  const raw = await AsyncStorage.getItem(QUEUE_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AnswerEvent[]) : []
  } catch {
    // corrupt blob — drop it rather than wedge every future flush
    return []
  }
}

const write = async (events: AnswerEvent[]): Promise<void> => {
  if (events.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY)
    return
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(events))
}

/**
 * Drain as much of the queue as `send` will currently accept. Successful sends
 * drop their event; the first failure stops this pass and leaves the rest
 * persisted for a later flush trigger (foreground / app-start / next serve).
 */
export const flush = async (send: SendAnswer): Promise<void> =>
  withLock(async () => {
    const pending = await read()
    if (pending.length === 0) return

    // single endpoint, low volume — drain the whole backlog in one pass
    const remaining = [...pending]
    while (remaining.length > 0) {
      try {
        await send(remaining[0])
        remaining.shift()
      } catch (error) {
        // network/server still unhappy — log it and keep the backlog for the
        // next trigger (foreground / app-start / next serve)
        // eslint-disable-next-line no-console -- surface send failures (0003, requested)
        console.warn('[answer-queue] flush failed; keeping backlog', error)
        break
      }
    }

    if (remaining.length !== pending.length) await write(remaining)
  })

/**
 * Persist an Answer, then opportunistically try to send it. On success it never
 * touches the store; on failure it is queued and a `flush` retries it later, so
 * offline play still feeds the shared progress once the network returns.
 */
export const enqueue = async (event: AnswerEvent, send: SendAnswer): Promise<void> => {
  await withLock(async () => {
    const pending = await read()
    pending.push(event)
    // trim oldest-first so a long offline backlog can't grow without bound
    await write(pending.slice(-MAX_QUEUE))
  })
  await flush(send)
}
