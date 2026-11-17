import {describe, expect, it} from 'vitest'
import {HUB_COPY} from '~constants/conversation-starters'
import questions from '~data/questions.json'

describe('conversation starters hub copy', () => {
  it('states the pool size every language renders', () => {
    const count = String(Object.keys(questions).length)
    for (const copy of Object.values(HUB_COPY)) {
      expect(copy.title).toContain(count)
      expect(copy.description).toContain(count)
    }
  })
})
