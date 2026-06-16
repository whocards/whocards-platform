import {action, computed, atom} from 'nanostores'
import type {Language} from '~types'
import {DEFAULT_LANGUAGE} from '~utils'

export interface LanguageStore {
  lang: Language
}

export const $langStore = atom<LanguageStore>({
  lang: DEFAULT_LANGUAGE,
})

export const setLang = action($langStore, 'setLang', (store, lang: Language) => {
  store.set({lang})
})
