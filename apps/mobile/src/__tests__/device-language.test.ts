import {deviceLanguage} from '../lib/language-store'

const mockLocales = jest.fn<{languageTag: string; languageCode: string | null}[], []>()
jest.mock('expo-localization', () => ({getLocales: () => mockLocales()}))
jest.mock('@react-native-async-storage/async-storage', () => ({}))

const locales = (...tags: [string, string | null][]) =>
  mockLocales.mockReturnValue(
    tags.map(([languageTag, languageCode]) => ({languageTag, languageCode}))
  )

const DECK = ['en', 'hu', 'pt', 'pt-br', 'jp', 'he']

describe('deviceLanguage — the Language until the player picks one', () => {
  it("uses the phone's language when the Deck has it", () => {
    locales(['hu-HU', 'hu'])
    expect(deviceLanguage(DECK)).toBe('hu')
  })

  it('prefers an exact regional match, then the base language', () => {
    locales(['pt-BR', 'pt'])
    expect(deviceLanguage(DECK)).toBe('pt-br')
    locales(['pt-PT', 'pt'])
    expect(deviceLanguage(DECK)).toBe('pt')
  })

  it('maps the codes iOS spells differently', () => {
    locales(['ja-JP', 'ja'])
    expect(deviceLanguage(DECK)).toBe('jp')
    locales(['iw-IL', 'iw'])
    expect(deviceLanguage(DECK)).toBe('he')
  })

  it("walks the phone's preferred languages in order", () => {
    locales(['ko-KR', 'ko'], ['he-IL', 'he'])
    expect(deviceLanguage(DECK)).toBe('he')
  })

  it('falls back to English, or the first language of a Deck without it', () => {
    locales(['ko-KR', 'ko'])
    expect(deviceLanguage(DECK)).toBe('en')
    expect(deviceLanguage(['hu', 'de'])).toBe('hu')
  })
})
