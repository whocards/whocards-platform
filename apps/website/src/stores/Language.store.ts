import {atom} from 'nanostores'
import type {Language} from '~types'
import {DEFAULT_LANGUAGE} from '~utils'

export type LanguageStore = {
  lang: Language
}

export const $langStore = atom<LanguageStore>({
  lang: DEFAULT_LANGUAGE,
})

export const setLang = (lang: Language) => {
  $langStore.set({lang})
}
