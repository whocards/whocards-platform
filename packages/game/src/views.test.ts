import {describe, expect, it} from 'vitest'
import {pair, round, snapshot, turn} from './fixtures.test-utils'
import {playerStateSchema, screenStateSchema} from './schemas'
import {playerView, screenView} from './views'

const s = snapshot({
  pairs: [pair('p1', ['a', 'b']), pair('p2', ['c', 'd'])],
  turns: [
    turn({id: 't1', pairId: 'p1', playerId: 'a', startedAt: 1000}),
    turn({id: 't2', pairId: 'p2', playerId: 'c', startedAt: 0, finishedAt: 10}),
    turn({id: 't3', pairId: 'p2', playerId: 'd', startedAt: 20, finishedAt: 30}),
  ],
})

describe('playerView', () => {
  it('shows my pair, the active turn and its question in my language', () => {
    const view = playerView(s, 'b', 2000, (id, lang) => `${id}:${lang}`)
    expect(playerStateSchema.parse(view)).toEqual(view)
    expect(view?.phase).toBe('partner_speaking')
    expect(view?.pair?.partners).toEqual([{id: 'a', name: 'A'}])
    expect(view?.pair?.activeTurn).toMatchObject({
      id: 't1',
      questionText: 'q1:en',
      deadline: 91_000,
    })
  })

  it('reports a timed-out turn as finished at its deadline', () => {
    const view = playerView(s, 'a', 100_000)
    expect(view?.pair?.activeTurn).toBeNull()
    expect(view?.pair?.turns[0]?.finishedAt).toBe(91_000)
    expect(view?.phase).toBe('answered')
  })

  it('returns null for a stranger', () => {
    expect(playerView(s, 'zz', 0)).toBeNull()
  })
})

describe('screenView', () => {
  it('counts without naming anyone', () => {
    const view = screenView(s, 2000)
    expect(screenStateSchema.parse(view)).toEqual(view)
    expect(view.counts).toEqual({joined: 4, paired: 4, talking: 1, done: 2})
    expect(screenView(snapshot({rounds: [round({status: 'pending'})]}), 0).round).toBeNull()
  })

  it('shows the organizer, or null for games made before organizers existed', () => {
    expect(screenView(s, 0).game.organizer).toBeNull()
    const hosted = {...s, game: {...s.game, settings: {round: {}, organizer: 'SDD Conf'}}}
    expect(screenView(hosted, 0).game.organizer).toBe('SDD Conf')
    expect(playerView(hosted, 'a', 0)?.game.organizer).toBe('SDD Conf')
  })
})
