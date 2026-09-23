import {describe, expect, it} from 'vitest'
import {
  ACTS,
  CANONICAL_PROMPT,
  EXPECTED_QUESTION_IDS,
  parseModelResponse,
  questionIdsForAct,
  stripCodeFences,
  substituteDirection,
  validateDeckJson,
} from './prompt'

const buildDeck = () =>
  Object.fromEntries(EXPECTED_QUESTION_IDS.map((id) => [id, {en: `question ${id}`}]))

describe('substituteDirection', () => {
  it('replaces the {{DIRECTION}} placeholder with free text', () => {
    const result = substituteDirection('before {{DIRECTION}} after', 'open')
    expect(result).toBe('before open after')
  })

  it('replaces every occurrence of the placeholder', () => {
    const result = substituteDirection('{{DIRECTION}} and {{DIRECTION}}', 'stories')
    expect(result).toBe('stories and stories')
  })

  it('the canonical prompt contains exactly one placeholder', () => {
    const occurrences = CANONICAL_PROMPT.split('{{DIRECTION}}').length - 1
    expect(occurrences).toBe(1)
  })
})

describe('stripCodeFences', () => {
  it('returns plain JSON text unchanged (aside from trimming)', () => {
    expect(stripCodeFences('  {"a": 1}  ')).toBe('{"a": 1}')
  })

  it('strips a ```json fenced block', () => {
    expect(stripCodeFences('```json\n{"a": 1}\n```')).toBe('{"a": 1}')
  })

  it('strips a bare ``` fenced block', () => {
    expect(stripCodeFences('```\n{"a": 1}\n```')).toBe('{"a": 1}')
  })
})

describe('parseModelResponse', () => {
  it('parses plain JSON', () => {
    expect(parseModelResponse('{"ai-1": {"en": "hi"}}')).toEqual({'ai-1': {en: 'hi'}})
  })

  it('parses fenced JSON', () => {
    const result = parseModelResponse('```json\n{"ai-1": {"en": "hi"}}\n```')
    expect(result['ai-1'].en).toBe('hi')
  })

  it('throws on non-object JSON (e.g. an array)', () => {
    expect(() => parseModelResponse('[1, 2, 3]')).toThrow()
  })

  it('throws on invalid JSON', () => {
    expect(() => parseModelResponse('not json at all')).toThrow()
  })
})

describe('validateDeckJson', () => {
  it('accepts a deck with exactly ai-1..ai-37 and non-empty en strings', () => {
    expect(validateDeckJson(buildDeck())).toBe(true)
  })

  it('throws when a question id is missing', () => {
    const deck = buildDeck()
    delete (deck as Record<string, unknown>)['ai-37']
    expect(() => validateDeckJson(deck)).toThrow(/Missing question ids/)
  })

  it('throws when an unexpected extra id is present', () => {
    const deck = buildDeck() as Record<string, {en: string}>
    deck['ai-38'] = {en: 'extra'}
    expect(() => validateDeckJson(deck)).toThrow(/Unexpected question ids/)
  })

  it('throws when a question is missing its en string', () => {
    const deck = buildDeck() as Record<string, {en: string}>
    // @ts-expect-error deliberately malformed for the test
    deck['ai-1'] = {}
    expect(() => validateDeckJson(deck)).toThrow(/missing a non-empty "en" string/)
  })

  it('throws when a question has an empty en string', () => {
    const deck = buildDeck() as Record<string, {en: string}>
    deck['ai-1'] = {en: '   '}
    expect(() => validateDeckJson(deck)).toThrow(/missing a non-empty "en" string/)
  })

  it('throws when the deck is not an object', () => {
    expect(() => validateDeckJson('nope')).toThrow(/not a JSON object/)
    expect(() => validateDeckJson(null)).toThrow(/not a JSON object/)
    expect(() => validateDeckJson([])).toThrow(/not a JSON object/)
  })
})

describe('ACTS / questionIdsForAct', () => {
  it('covers exactly the 37 ids across the four acts with no overlap', () => {
    const all = ACTS.flatMap((act) => questionIdsForAct(act))
    expect(all).toEqual(EXPECTED_QUESTION_IDS)
    expect(new Set(all).size).toBe(37)
  })

  it('each act has 9 or 10 questions matching its documented range', () => {
    expect(questionIdsForAct(ACTS[0])).toEqual([
      'ai-1',
      'ai-2',
      'ai-3',
      'ai-4',
      'ai-5',
      'ai-6',
      'ai-7',
      'ai-8',
      'ai-9',
    ])
    expect(questionIdsForAct(ACTS[3])).toHaveLength(10)
  })
})
