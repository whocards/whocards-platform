import {persistentAtom} from '@nanostores/persistent'
import {computed} from 'nanostores'
import type {QuestionId, QuestionIds} from '~types'
import {generateGame} from '~utils'
import {getCurrentQuestionUrl} from '~utils/urls'

type Game = {
  ids: QuestionIds
  idx: number
}

export type GameStatus = {
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

export const initGame = () => {
  gameStore.set({ids: generateGame(), idx: -1})

  for (const button of document.getElementsByClassName('play')) {
    button.setAttribute('href', getCurrentQuestionUrl(undefined, idsStore.get().current))
  }
}

export const idsStore = computed(gameStore, (store): GameStatus => ({
  next: store.ids[store.idx + 1],
  prev: store.ids[store.idx - 1],
  current: store.idx < 0 ? store.ids[store.idx + 1] : store.ids[store.idx],
}))
