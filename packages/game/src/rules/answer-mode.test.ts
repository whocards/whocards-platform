import {describe, expect, it} from 'vitest'

import {answerModeAt, currentAnswerMode} from './answer-mode'

describe('answer mode', () => {
  it('defaults to voice', () => {
    expect(answerModeAt({round: {}}, 5)).toBe('voice')
    expect(currentAnswerMode({round: {}})).toBe('voice')
  })

  it('gives a turn the mode in force when it was claimed', () => {
    const settings = {
      round: {},
      answerModes: [
        {mode: 'type' as const, at: 10},
        {mode: 'none' as const, at: 20},
      ],
    }
    expect(answerModeAt(settings, 5)).toBe('voice')
    expect(answerModeAt(settings, 10)).toBe('voice')
    expect(answerModeAt(settings, 11)).toBe('type')
    expect(answerModeAt(settings, 20)).toBe('type')
    expect(answerModeAt(settings, 25)).toBe('none')
    expect(currentAnswerMode(settings)).toBe('none')
  })
})
