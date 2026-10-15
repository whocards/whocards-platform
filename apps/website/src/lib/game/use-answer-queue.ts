import {useEffect, useState, useSyncExternalStore} from 'react'

import type {AnswerQueue, PendingAnswer} from './answer-queue'
import {browserAnswerStore, createAnswerQueue, createAnswerUpload} from './answer-queue'
import type {TokenStore} from './token-store'

let shared: AnswerQueue | null = null

/** The page's one answer queue, resumed on mount; `items` are this game's pending answers. */
export const useAnswerQueue = (tokens: TokenStore, code: string | null) => {
  const [queue] = useState(() => {
    shared ??= createAnswerQueue({
      store: browserAnswerStore(),
      upload: createAnswerUpload((c) => tokens.get(c)),
    })
    return shared
  })

  useEffect(() => {
    void queue.start()
    const online = () => queue.retry()
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [queue])

  const all = useSyncExternalStore(queue.subscribe, queue.items)
  const items: PendingAnswer[] = all.filter((a) => a.code.toUpperCase() === code?.toUpperCase())
  return {queue, items}
}
