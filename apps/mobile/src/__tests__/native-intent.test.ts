/**
 * Tests for src/app/+native-intent.ts
 *
 * Incoming Universal/App Links to the default deck arrive as `/play` (no slug),
 * but the app routes decks under `play/[deck]`. redirectSystemPath rewrites the
 * slug-less path to the default deck while preserving the `?q=`/`?lang=` query,
 * and leaves every other path untouched.
 */

import {DEFAULT_DECK_SLUG} from '@whocards/decks'
import {redirectSystemPath} from '../app/+native-intent'

const redirect = (path: string) => redirectSystemPath({path, initial: true})

describe('redirectSystemPath', () => {
  it('rewrites the slug-less /play to the default deck, preserving the query', () => {
    expect(redirect('https://whocards.cc/play?lang=en&q=q-42')).toBe(
      `/play/${DEFAULT_DECK_SLUG}?lang=en&q=q-42`
    )
  })

  it('rewrites a bare /play path (no origin)', () => {
    expect(redirect('/play?q=q-1')).toBe(`/play/${DEFAULT_DECK_SLUG}?q=q-1`)
  })

  it('leaves an explicit deck path untouched', () => {
    const path = 'https://whocards.cc/play/ai-at-work?lang=es&q=q-7'
    expect(redirect(path)).toBe(path)
  })

  it('leaves unrelated paths untouched', () => {
    expect(redirect('https://whocards.cc/about')).toBe('https://whocards.cc/about')
  })
})
