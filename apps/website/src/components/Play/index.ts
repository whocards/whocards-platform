export {Play} from './Play'
export type {PlayProps, QuestionSet, TrackingConfig} from './Play'
// Gates the Share sheet's Story/Post rows on a deck's source (ADR-0007) — pages
// pass `isPoolBacked={supportsShareImages(deck.source)}` when rendering <Play>.
export {supportsShareImages} from './share-ui'
