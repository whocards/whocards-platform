import {answerUploadResultSchema} from '@whocards/game'

export const ANSWER_URL = '/api/game/answer'
// About three minutes of backoff before an item waits for a manual retry or the next page load.
export const MAX_ATTEMPTS = 8
const BASE_DELAY_MS = 2000
const MAX_DELAY_MS = 60_000

/** A recorded answer kept on this device until the server has transcribed and saved it. */
export type PendingAnswer = {
  turnId: string
  code: string
  audio: Blob
  durationMs: number
  recordedAt: number
  attempts: number
  failed: boolean
}

export type AnswerStore = {
  load: () => Promise<PendingAnswer[]>
  put: (answer: PendingAnswer) => Promise<void>
  remove: (turnId: string) => Promise<void>
}

/** `retry`: worth trying again later; `failed`: the server refused it for good. */
export type UploadOutcome = 'saved' | 'retry' | 'failed'
export type Upload = (answer: PendingAnswer) => Promise<UploadOutcome>

export type AnswerQueue = {
  add: (answer: Pick<PendingAnswer, 'turnId' | 'code' | 'audio' | 'durationMs'>) => void
  /** Loads what an earlier page left behind and starts working; safe to call again. */
  start: () => Promise<void>
  /** Retries now: one item, or every waiting one when the network comes back. */
  retry: (turnId?: string) => void
  discard: (turnId: string) => Promise<void>
  items: () => PendingAnswer[]
  subscribe: (listener: () => void) => () => void
}

export const retryDelay = (attempts: number) =>
  Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS)

// Storage failures must never take the game down; the in-memory queue still works for this tab.
const quietly = (work: Promise<void>) => work.catch(() => undefined)

export const createAnswerQueue = ({
  store,
  upload,
  now = Date.now,
}: {
  store: AnswerStore
  upload: Upload
  now?: () => number
}): AnswerQueue => {
  let items: PendingAnswer[] = []
  const retryAt = new Map<string, number>()
  const listeners = new Set<() => void>()
  let running = false
  let started: Promise<void> | null = null
  let wake: (() => void) | null = null

  const publish = (next: PendingAnswer[]) => {
    items = next
    for (const listener of listeners) listener()
  }
  const nudge = () => wake?.()

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        wake = null
        resolve()
      }
      const timer = setTimeout(done, ms)
      wake = done
    })

  const settle = async (answer: PendingAnswer, outcome: UploadOutcome) => {
    const current = items.find((a) => a.turnId === answer.turnId)
    if (!current) return
    retryAt.delete(answer.turnId)
    if (outcome === 'saved') {
      publish(items.filter((a) => a !== current))
      await quietly(store.remove(answer.turnId))
      return
    }
    const attempts = current.attempts + 1
    const updated = {...current, attempts, failed: outcome === 'failed' || attempts >= MAX_ATTEMPTS}
    if (!updated.failed) retryAt.set(updated.turnId, now() + retryDelay(attempts))
    publish(items.map((a) => (a === current ? updated : a)))
    await quietly(store.put(updated))
  }

  // One upload at a time, oldest first; an item waiting out its backoff doesn't block the rest.
  const run = async () => {
    if (running) return
    running = true
    try {
      for (;;) {
        const waiting = items.filter((a) => !a.failed)
        if (waiting.length === 0) return
        const due = waiting.find((a) => (retryAt.get(a.turnId) ?? 0) <= now())
        if (!due) {
          const soonest = Math.min(...waiting.map((a) => retryAt.get(a.turnId) ?? 0))
          await sleep(soonest - now())
          continue
        }
        const outcome = await upload(due).catch((): UploadOutcome => 'retry')
        await settle(due, outcome)
      }
    } finally {
      running = false
    }
  }

  return {
    add: (answer) => {
      if (items.some((a) => a.turnId === answer.turnId)) return
      const pending: PendingAnswer = {...answer, recordedAt: now(), attempts: 0, failed: false}
      publish([...items, pending])
      void quietly(store.put(pending))
      nudge()
      void run()
    },

    start: () => {
      started ??= store
        .load()
        .catch(() => [])
        .then((saved) => {
          const known = new Set(items.map((a) => a.turnId))
          // A new page is a fresh chance for anything that gave up last time.
          const resumed = saved
            .filter((a) => !known.has(a.turnId))
            .map((a) => ({...a, attempts: 0, failed: false}))
          publish([...items, ...resumed].toSorted((a, b) => a.recordedAt - b.recordedAt))
          void run()
        })
      return started
    },

    retry: (turnId) => {
      publish(
        items.map((a) =>
          turnId === undefined || a.turnId === turnId ? {...a, attempts: 0, failed: false} : a
        )
      )
      if (turnId === undefined) retryAt.clear()
      else retryAt.delete(turnId)
      nudge()
      void run()
    },

    discard: async (turnId) => {
      retryAt.delete(turnId)
      publish(items.filter((a) => a.turnId !== turnId))
      await quietly(store.remove(turnId))
    },

    items: () => items,

    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const RETRYABLE = new Set([408, 409, 425, 429])

/** Posts one answer to the server, which transcribes and saves it. */
export const createAnswerUpload =
  (token: (code: string) => string | null, fetcher: typeof fetch = fetch): Upload =>
  async (answer) => {
    const playerToken = token(answer.code)
    if (!playerToken) return 'failed'
    const form = new FormData()
    form.set('audio', answer.audio)
    form.set('token', playerToken)
    form.set('turnId', answer.turnId)
    form.set('durationMs', String(Math.round(answer.durationMs)))
    const res = await fetcher(ANSWER_URL, {method: 'POST', body: form})
    if (res.ok) {
      const body = answerUploadResultSchema.safeParse(await res.json().catch(() => null))
      return body.success ? 'saved' : 'retry'
    }
    return res.status >= 500 || RETRYABLE.has(res.status) ? 'retry' : 'failed'
  }

export const memoryAnswerStore = (): AnswerStore => {
  const saved = new Map<string, PendingAnswer>()
  return {
    load: async () => [...saved.values()],
    put: async (answer) => void saved.set(answer.turnId, answer),
    remove: async (turnId) => void saved.delete(turnId),
  }
}

const DB_NAME = 'whocards-game'
const STORE = 'pending-answers'

type StoredAnswer = Omit<PendingAnswer, 'audio'> & {audio: ArrayBuffer; mimeType: string}

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.addEventListener('success', () => resolve(req.result))
    req.addEventListener('error', () => reject(req.error))
  })

/** Survives a reload or a closed tab; audio goes in as bytes since older Safari can't store Blobs. */
export const indexedDbAnswerStore = (factory: IDBFactory = indexedDB): AnswerStore => {
  let opened: Promise<IDBDatabase> | null = null
  const open = () => {
    if (opened) return opened
    const req = factory.open(DB_NAME, 1)
    req.addEventListener('upgradeneeded', () =>
      req.result.createObjectStore(STORE, {keyPath: 'turnId'})
    )
    opened = request(req)
    return opened
  }
  const objects = async (mode: IDBTransactionMode) =>
    (await open()).transaction(STORE, mode).objectStore(STORE)

  return {
    load: async () => {
      const rows: StoredAnswer[] = await request((await objects('readonly')).getAll())
      return rows.map(({mimeType, ...row}) => ({
        ...row,
        audio: new Blob([row.audio], {type: mimeType}),
      }))
    },
    put: async (answer) => {
      const audio = await answer.audio.arrayBuffer()
      const row: StoredAnswer = {...answer, audio, mimeType: answer.audio.type}
      await request((await objects('readwrite')).put(row))
    },
    remove: async (turnId) => {
      await request((await objects('readwrite')).delete(turnId))
    },
  }
}

export const browserAnswerStore = (): AnswerStore =>
  typeof indexedDB === 'undefined' ? memoryAnswerStore() : indexedDbAnswerStore()
