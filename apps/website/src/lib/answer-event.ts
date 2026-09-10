/**
 * The serve contract shared by the recorder and the offline queue. One entry is
 * appended to the Answer record (CONTEXT.md › Answer record) each time a Device
 * answers a Question: which Deck, which Question, which language.
 *
 * This mirrors the planned `@whocards/decks` AnswerEvent (ticket 0003 › S1).
 * Defined locally for now so the web slice stays unblocked until S1 lands; it
 * can re-export from the shared package once that type exists.
 */
export type AnswerEvent = {
  deviceId: string
  deckSlug: string
  questionId: string
  language: string
}
