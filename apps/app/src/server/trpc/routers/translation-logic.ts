import {createTwoFilesPatch} from 'diff'
import {getAllDecks, LANGUAGE_CODES, languages, pool} from '@whocards/decks'
import type {QuestionSet, ResolvedDeck} from '@whocards/decks'

const SOURCE_LANGUAGE = 'en'
const LANGUAGES_PATH = 'packages/decks/src/pool/languages.json'
const DECK_LANGUAGES = /languages: \[([^\]]*)\]/g

// Raw deck sources, bundled, because a deck's `languages` list lives in its .ts file.
const deckSources = import.meta.glob<string>(
  ['../../../../../../packages/decks/src/decks/*.ts', '!**/*.test.ts'],
  {query: '?raw', import: 'default', eager: true}
)

/** Lowercase BCP 47-ish tag, e.g. `id`, `pt-br`. */
export const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/

const deckFile = (deck: ResolvedDeck): {path: string; questions: QuestionSet} =>
  deck.source.kind === 'library'
    ? {path: 'packages/decks/src/pool/questions.json', questions: pool}
    : {
        path: `packages/decks/src/decks/${deck.slug}.questions.json`,
        questions: deck.source.questions,
      }

type UntranslatedDeck = {
  slug: string
  title: string
  questions: {id: string; source: string}[]
}

export const untranslatedDecks = (language: string): UntranslatedDeck[] =>
  getAllDecks()
    .filter((deck) => !deck.languages.includes(language))
    .map((deck) => ({
      slug: deck.slug,
      title: deck.title,
      questions: deck.questionIds.flatMap((id) => {
        const text = deck.questions[id]
        const source = text?.[SOURCE_LANGUAGE]
        return source && !text[language] ? [{id, source}] : []
      }),
    }))
    .filter((deck) => deck.questions.length > 0)

export const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({length: Math.ceil(items.length / size)}, (_, i) =>
    items.slice(i * size, (i + 1) * size)
  )

const json = (value: object) => `${JSON.stringify(value, null, 2)}\n`

// a/ b/ prefixes so the patch applies with plain `git apply` from the repo root.
const filePatch = (path: string, before: string, after: string) =>
  createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after)

type ApprovedDraft = {deckSlug: string; questionId: string; text: string}

// A deck lists the language only when complete, and an inline deck only once the Pool ships it too.
export const translationPatch = (language: string, approved: readonly ApprovedDraft[]): string => {
  const decks = getAllDecks().map((deck) => {
    const texts = new Map(
      approved
        .filter((d) => d.deckSlug === deck.slug && !deck.questions[d.questionId]?.[language])
        .flatMap((d) => (deck.questions[d.questionId] ? [[d.questionId, d.text] as const] : []))
    )
    const complete = deck.questionIds.every((id) => deck.questions[id]?.[language] || texts.has(id))
    return {deck, texts, complete}
  })
  const poolGainsLanguage =
    !LANGUAGE_CODES.includes(language) &&
    decks.some(({deck, complete}) => deck.source.kind === 'library' && complete)
  const poolShips = LANGUAGE_CODES.includes(language) || poolGainsLanguage

  const patches = decks.flatMap(({deck, texts, complete}) => {
    const out: string[] = []
    if (texts.size > 0) {
      const {path, questions} = deckFile(deck)
      const next = structuredClone(questions)
      for (const [id, text] of texts) next[id] = {...next[id], [language]: text}
      out.push(filePatch(path, json(questions), json(next)))
    }
    const source = Object.entries(deckSources).find(([key]) =>
      key.endsWith(`/decks/${deck.slug}.ts`)
    )
    if (
      deck.source.kind === 'inline' &&
      complete &&
      poolShips &&
      !deck.languages.includes(language) &&
      source &&
      source[1].match(DECK_LANGUAGES)?.length === 1
    ) {
      const path = `packages/decks/src/decks/${deck.slug}.ts`
      const after = source[1].replace(
        DECK_LANGUAGES,
        (_, list: string) => `languages: [${list}, '${language}']`
      )
      out.push(filePatch(path, source[1], after))
    }
    return out
  })

  if (poolGainsLanguage) {
    const name = new Intl.DisplayNames(['en'], {type: 'language'}).of(language) ?? language
    patches.push(filePatch(LANGUAGES_PATH, json(languages), json({...languages, [language]: name})))
  }
  return patches.join('')
}
