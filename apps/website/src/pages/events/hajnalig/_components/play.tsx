import {Play, type QuestionSet} from '~components/Play'
import {getDeck} from '~data/decks'

// the hajnalig event is now expressed as a deck; resolve it through the registry
// instead of importing the questions json directly. Resolution is pure data, so
// it is safe at module scope in this client island.
const deck = getDeck('hajnalig')!

export const SimplePlay = () => (
  <Play
    questions={deck.questions as QuestionSet}
    languages={deck.languages}
    deckSlug={deck.slug}
    languageStorageKey={deck.languageStorageKey}
    tracking={deck.tracking}
    questionClassName={deck.questionClassName}
  />
)

export default SimplePlay
