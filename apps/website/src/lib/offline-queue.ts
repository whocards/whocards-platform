import {logError, logWarn} from '@whocards/observability'
import type {AnswerEvent} from './answer-event'

/**
 * A localStorage-backed offline queue for Answer events (CONTEXT.md › Offline
 * play). Recording is never off: every served Answer is enqueued and flushed to
 * the Answer record when the network allows, so offline play still feeds shared
 * progress once it syncs.
 *
 * The queue is deliberately decoupled from tRPC — it only knows an injected
 * `send`. The transport (and thus the missing `answers.record` type seam) lives
 * elsewhere, so this module compiles and is testable in isolation.
 */

/** Durable localStorage key holding the pending-event JSON array. */
export const QUEUE_KEY = 'whocards-answer-queue'

/** Cap on persisted events so a long offline streak can't grow unbounded. */
const MAX_QUEUE_LENGTH = 500

/** A pending event plus its bounded-retry bookkeeping. */
type QueuedEvent = AnswerEvent & {
  /** local, monotonic-ish id so the same event isn't double-dropped */
  _id: string
  /** how many send attempts this event has survived */
  _attempts: number
}

/** Drop an event after this many failed sends rather than retrying forever. */
const MAX_RETRIES = 8

/** The injected transport. Resolves on success; rejects to keep the event. */
export type Send = (event: AnswerEvent) => Promise<void>

const hasStorage = (): boolean => typeof window !== 'undefined' && !!window.localStorage

const read = (): QueuedEvent[] => {
  if (!hasStorage()) return []
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedEvent[]) : []
  } catch {
    // corrupt payload — reset rather than wedging play forever
    return []
  }
}

const write = (events: QueuedEvent[]): void => {
  if (!hasStorage()) return
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(events))
  } catch {
    // storage full / unavailable — nothing safe to do, keep playing
  }
}

const strip = ({_id: _, _attempts: __, ...event}: QueuedEvent): AnswerEvent => event

/** True while the browser believes it is offline (best-effort; missing => online). */
const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false

/** Guard so overlapping triggers (online + serve + load) don't double-send. */
let flushing = false

/**
 * Creates an offline queue bound to one transport. The transport is injected so
 * the queue never imports tRPC; the same factory powers both production and
 * isolated unit tests.
 */
export const createOfflineQueue = (send: Send) => {
  /**
   * Drain the persisted queue, dropping each event that sends (or exhausts its
   * retries). Re-entrant-safe and a no-op while offline.
   */
  const flush = async (): Promise<void> => {
    if (flushing || isOffline()) return
    flushing = true
    try {
      let pending = read()
      // single endpoint, low volume — drain the whole backlog in one pass
      while (pending.length > 0) {
        const [head, ...rest] = pending
        if (!head) break
        try {
          await send(strip(head))
          // success — drop it and persist immediately so a crash can't replay
          pending = rest
          write(pending)
        } catch (error) {
          if (head._attempts + 1 >= MAX_RETRIES) {
            // give up on this poison event, log it, and keep the rest moving
            logError('[answer-queue] dropping Answer after repeated failures', error, {
              attempts: head._attempts + 1,
            })
            pending = rest
            write(pending)
          } else {
            // keep it, bump its count, log, and stop this flush (network is down)
            logWarn('[answer-queue] flush failed; keeping backlog', error)
            pending = [{...head, _attempts: head._attempts + 1}, ...rest]
            write(pending)
            break
          }
        }
      }
    } finally {
      flushing = false
    }
  }

  /**
   * Persist an event, then attempt to flush. Persist-first means a serve is
   * recorded even if the very next send fails or the tab closes mid-flight.
   */
  const enqueue = async (event: AnswerEvent): Promise<void> => {
    const queued: QueuedEvent = {
      ...event,
      _id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      _attempts: 0,
    }
    // keep newest, drop oldest overflow
    const next = [...read(), queued].slice(-MAX_QUEUE_LENGTH)
    write(next)
    await flush()
  }

  /**
   * Wire the standard flush triggers: page load (now) and the `online` event.
   * Per-serve flushing happens via `enqueue`. Returns an unsubscribe.
   */
  const start = (): (() => void) => {
    if (typeof window === 'undefined') return () => {}
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    // page load
    void flush()
    return () => window.removeEventListener('online', onOnline)
  }

  return {enqueue, flush, start}
}

export type OfflineQueue = ReturnType<typeof createOfflineQueue>
