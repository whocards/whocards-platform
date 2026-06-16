import {persistentAtom} from '@nanostores/persistent'
import {action, computed} from 'nanostores'
import type {QuestionId, QuestionIds} from '~types'
import {generateGame, getCurrentQuestionUrl} from '~utils'

interface Game {
  ids: QuestionIds
  idx: number
}

export interface GameStatus {
  prev: QuestionId | undefined
  next: QuestionId | undefined
  current: QuestionId
}

export const gameStore = persistentAtom<Game>(
  'who-game',
  {
    ids: [],
    idx: -1,
  },
  {
    encode: JSON.stringify,
    decode: JSON.parse,
  }
)

export const initGame = action(gameStore, 'initGame', () => {
  gameStore.set({ids: generateGame(), idx: -1})

  for (const button of document.getElementsByClassName('play')) {
    button.setAttribute('href', getCurrentQuestionUrl())
  }
})

export const idsStore = computed(
  gameStore,
  (store): GameStatus => ({
    next: store.ids[store.idx + 1],
    prev: store.ids[store.idx - 1],
    current: store.idx < 0 ? store.ids[store.idx + 1] : store.ids[store.idx],
  })
)

export const initPage = action(gameStore, 'initPage', (store, currentId: QuestionId) => {
  if (store.get().ids.length) {
    store.set({
      ...store.get(),
      idx: store.get().ids.findIndex((i) => i === currentId),
    })
  } else {
    const ids = generateGame()
    const currentIdx = ids.findIndex((i) => i === currentId)
    ids[currentIdx] = ids[0]
    ids[0] = currentId
    store.set({
      ids,
      idx: 0,
    })
  }
})
