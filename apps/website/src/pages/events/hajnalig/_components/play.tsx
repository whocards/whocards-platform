import {Play, type QuestionSet} from '~components/Play'
import {hajnalig2025Deck, hajnalig2026Deck, resolveDeck} from '~data/decks'

// The hajnalig event runs yearly; each edition is its own deck (different
// question set + tracking eventId). Resolution is pure data, so it is safe at
// module scope in this client island and keeps the questions out of the HTML.
const editions = {
  2025: resolveDeck(hajnalig2025Deck),
  2026: resolveDeck(hajnalig2026Deck),
} as const

export type EditionYear = keyof typeof editions

export const SimplePlay = ({year = 2026}: {year?: EditionYear}) => {
  const deck = editions[year]
  return (
    <Play
      questions={deck.questions as QuestionSet}
      languages={deck.languages}
      deckSlug={deck.slug}
      languageStorageKey={deck.languageStorageKey}
      tracking={deck.tracking}
      questionClassName={deck.questionClassName}
    />
  )
}

export default SimplePlay
