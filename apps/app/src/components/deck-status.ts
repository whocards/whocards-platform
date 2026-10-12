import type {DeckStatus} from '~/server/trpc/routers/decks-logic'

export const DECK_STATUS = {
  draft: {label: 'Draft', tone: 'neutral'},
  in_review: {label: 'In review', tone: 'accent'},
  approved: {label: 'Approved', tone: 'good'},
  shipped: {label: 'Shipped', tone: 'muted'},
} as const satisfies Record<DeckStatus, {label: string; tone: string}>
