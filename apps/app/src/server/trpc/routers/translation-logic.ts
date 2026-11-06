import {createTwoFilesPatch} from 'diff'
import {getAllDecks, pool} from '@whocards/decks'
import type {QuestionSet, ResolvedDeck} from '@whocards/decks'

const SOURCE_LANGUAGE = 'en'

/** Lowercase BCP 47-ish tag, e.g. `id`, `pt-br`. */
export const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/

/** The packages/decks file a deck's Questions live in, which the diff patches. */
export const deckFile = (deck: ResolvedDeck): {path: string; questions: QuestionSet} =>
  deck.source.kind === 'library'
    ? {path: 'packages/decks/src/pool/questions.json', questions: pool}
    : {
        path: `packages/decks/src/decks/${deck.slug}.questions.json`,
        questions: deck.source.questions,
      }

export type UntranslatedDeck = {
  slug: string
  title: string
  questions: {id: string; source: string}[]
}

/** Every deck that doesn't ship `language`, with the Questions it lacks in it. */
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

const json = (set: QuestionSet) => `${JSON.stringify(set, null, 2)}\n`

export type ApprovedDraft = {deckSlug: string; questionId: string; text: string}

/** A `git apply`-clean patch adding `language` to every Question with an approved draft. */
export const translationPatch = (language: string, approved: readonly ApprovedDraft[]): string =>
  getAllDecks()
    .flatMap((deck) => {
      const drafts = approved.filter((d) => d.deckSlug === deck.slug)
      if (drafts.length === 0) return []
      const {path, questions} = deckFile(deck)
      const next = structuredClone(questions)
      for (const draft of drafts) {
        const question = next[draft.questionId]
        if (question) question[language] = draft.text
      }
      // a/ b/ prefixes so the patch applies with plain `git apply` from the repo root.
      return [createTwoFilesPatch(`a/${path}`, `b/${path}`, json(questions), json(next))]
    })
    .join('')
