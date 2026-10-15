import {TRPCError} from '@trpc/server'
import {fetchRequestHandler} from '@trpc/server/adapters/fetch'
import type {GameLanguage, GameSettings, HostedGame, PlayerState, Round} from '@whocards/game'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'

import {createFakeGamePort} from './game/fake-port.test-utils'
import {GameRefusalError} from './game/refusal'
import {appRouter, createCaller} from './index'

const game: HostedGame = {
  id: 'g1',
  code: 'ABCD',
  title: 'Workshop',
  status: 'live',
  settings: {round: {}},
}

const liveRound: Round = {
  id: 'r1',
  gameId: 'g1',
  n: 1,
  deckSlug: 'library',
  questionPlan: null,
  turnSeconds: 60,
  oddRule: 'trio',
  overtime: 'nudge',
  overtimeSeconds: 30,
  status: 'live',
  startedAt: 0,
  endsAt: null,
}

const setup = (rounds: Round[] = [liveRound], settings: GameSettings = game.settings) => {
  const fake = createFakeGamePort({game: {...game, settings}, rounds})
  const as = (playerToken: string | null) =>
    createCaller({recordAnswer: async () => {}, game: fake.port, playerToken})
  const join = async (name: string, language: GameLanguage = 'en', consentTranscript = true) => {
    const {token, state} = await as(null).game.join({
      code: 'abcd',
      name,
      language,
      consentTranscript,
    })
    return {caller: as(token), state, token}
  }
  return {fake, as, join}
}

const refusalOf = async (call: Promise<unknown>): Promise<string> => {
  try {
    await call
  } catch (error) {
    if (error instanceof TRPCError && error.cause instanceof GameRefusalError) {
      return error.cause.reason
    }
    return `unexpected: ${String(error)}`
  }
  return 'resolved'
}

describe('game.join / game.state', () => {
  it('joins by code and returns a token plus fresh state', async () => {
    const {join} = setup()
    const {caller, state, token} = await join('Ann')
    expect(token).toMatch(/^token-/)
    expect(state).toMatchObject({game: {code: 'ABCD'}, me: {name: 'Ann'}, phase: 'unpaired'})
    expect(await caller.game.state()).toEqual(state)
  })

  it('refuses unknown, draft and ended games', async () => {
    expect(
      await refusalOf(setup().as(null).game.join({code: 'ZZZZ', name: 'A', language: 'en'}))
    ).toBe('unknown_game')
    const joinAs = (status: HostedGame['status']) => {
      const fake = createFakeGamePort({game: {...game, status}})
      const caller = createCaller({
        recordAnswer: async () => {},
        game: fake.port,
        playerToken: null,
      })
      return refusalOf(caller.game.join({code: 'ABCD', name: 'A', language: 'en'}))
    }
    expect(await joinAs('lobby')).toBe('not_open')
    expect(await joinAs('ended')).toBe('game_over')
  })

  it('rejects calls without a valid player token', async () => {
    const {as} = setup()
    await expect(as(null).game.state()).rejects.toMatchObject({code: 'UNAUTHORIZED'})
    await expect(as('forged').game.state()).rejects.toMatchObject({code: 'UNAUTHORIZED'})
  })
})

describe('game.round.pair', () => {
  it('pairs by code, then lets a third join as a trio and refuses a fourth', async () => {
    const {join} = setup()
    const a = await join('Ann')
    const b = await join('Bo')
    const c = await join('Cy')
    const d = await join('Di')

    const paired = await a.caller.game.round.pair({partnerCode: b.state.me.pairCode})
    expect(paired.phase).toBe('ready')
    expect(paired.pair?.partners).toEqual([{id: b.state.me.id, name: 'Bo'}])
    expect(await refusalOf(a.caller.game.round.pair({partnerCode: c.state.me.pairCode}))).toBe(
      'already_paired'
    )

    const trio = await c.caller.game.round.pair({partnerCode: a.state.me.pairCode})
    expect(trio.pair?.partners.map((p) => p.name)).toEqual(['Ann', 'Bo'])
    expect(await refusalOf(d.caller.game.round.pair({partnerCode: a.state.me.pairCode}))).toBe(
      'partner_busy'
    )
    expect(await refusalOf(d.caller.game.round.pair({partnerCode: 'NOPE'}))).toBe('unknown_code')
  })

  it('refuses before the round is live', async () => {
    const {join} = setup([{...liveRound, status: 'pending'}])
    const a = await join('Ann')
    const b = await join('Bo')
    expect(await refusalOf(a.caller.game.round.pair({partnerCode: b.state.me.pairCode}))).toBe(
      'round_not_live'
    )
  })

  it('reports the real reason when it loses a pairing race', async () => {
    const {fake, join} = setup()
    const a = await join('Ann')
    const b = await join('Bo')
    const c = await join('Cy')
    const createPair = fake.port.createPair
    fake.port.createPair = async (input) => {
      await createPair({roundId: 'r1', playerIds: [b.state.me.id, c.state.me.id]})
      fake.snapshot.pairs[0]?.playerIds.push('ghost')
      return createPair(input)
    }
    expect(await refusalOf(a.caller.game.round.pair({partnerCode: b.state.me.pairCode}))).toBe(
      'partner_busy'
    )
  })
})

const pairedUp = async () => {
  const ctx = setup()
  const a = await ctx.join('Ann')
  const b = await ctx.join('Bo')
  await a.caller.game.round.pair({partnerCode: b.state.me.pairCode})
  return {...ctx, a, b}
}

describe('game.round.turn', () => {
  it('first claim wins; the partner sees "Your partner is answering" until finish', async () => {
    const {a, b} = await pairedUp()
    const speaking = await a.caller.game.round.turn({action: 'claim'})
    expect(speaking.phase).toBe('speaking')
    expect(speaking.pair?.activeTurn?.questionText).toEqual(expect.any(String))
    expect(speaking.pair?.activeTurn?.deadline).toBe(1_000_000 + 90_000)

    expect(await refusalOf(b.caller.game.round.turn({action: 'claim'}))).toBe('partner_answering')
    expect((await b.caller.game.state()).phase).toBe('partner_speaking')

    expect((await a.caller.game.round.turn({action: 'finish'})).phase).toBe('answered')
    expect((await b.caller.game.round.turn({action: 'claim'})).phase).toBe('speaking')
    expect(await refusalOf(a.caller.game.round.turn({action: 'claim'}))).toBe('partner_answering')
    await b.caller.game.round.turn({action: 'finish'})
    expect(await refusalOf(a.caller.game.round.turn({action: 'claim'}))).toBe('already_answered')
    expect((await a.caller.game.state()).phase).toBe('pair_done')
  })

  it('unlocks the partner once an unfinished turn passes its deadline', async () => {
    const {a, b, fake} = await pairedUp()
    await a.caller.game.round.turn({action: 'claim'})
    fake.advance(90_000)
    const state = await b.caller.game.round.turn({action: 'claim'})
    expect(state.phase).toBe('speaking')
    expect(state.pair?.turns.find((t) => t.playerId === a.state.me.id)?.finishedAt).toBe(
      1_000_000 + 90_000
    )
  })

  it('refuses claim when unpaired and finish without a turn', async () => {
    const {join} = setup()
    const solo = await join('Solo')
    expect(await refusalOf(solo.caller.game.round.turn({action: 'claim'}))).toBe('not_paired')
    expect(await refusalOf(solo.caller.game.round.turn({action: 'finish'}))).toBe('no_open_turn')
  })

  it('turns a lost claim race into partner_answering', async () => {
    const {a, b, fake} = await pairedUp()
    const startTurn = fake.port.startTurn
    fake.port.startTurn = async (input) => {
      await startTurn({...input, playerId: b.state.me.id})
      return startTurn(input)
    }
    expect(await refusalOf(a.caller.game.round.turn({action: 'claim'}))).toBe('partner_answering')
  })

  it('refuses a claim that lands after the host ended the round', async () => {
    const {a, fake} = await pairedUp()
    const startTurn = fake.port.startTurn
    fake.port.startTurn = async (input) => {
      fake.snapshot.rounds[0] = {...liveRound, status: 'done'}
      return startTurn(input)
    }
    expect(await refusalOf(a.caller.game.round.turn({action: 'claim'}))).toBe('round_not_live')
    expect(fake.snapshot.turns).toEqual([])
  })
})

describe('question plans', () => {
  const settings: GameSettings = {
    round: {},
    questions: [
      {id: 'c:aaaa', en: 'Custom A?', hu: 'Saját A?'},
      {id: 'c:bbbb', en: 'Custom B?'},
    ],
  }

  const trio = async (
    plan: Round['questionPlan'],
    languages: GameLanguage[] = ['en', 'en', 'en']
  ) => {
    const {join} = setup([{...liveRound, questionPlan: plan}], settings)
    const [a, b, c] = await Promise.all(languages.map((l, i) => join(`P${i}`, l)))
    if (!a || !b || !c) throw new Error('join failed')
    await a.caller.game.round.pair({partnerCode: b.state.me.pairCode})
    await c.caller.game.round.pair({partnerCode: a.state.me.pairCode})
    const asked: Array<{id: string; text: string | null}> = []
    for (const p of [b, c, a]) {
      const turn = (await p.caller.game.round.turn({action: 'claim'})).pair?.activeTurn
      asked.push({id: turn?.questionId ?? '', text: turn?.questionText ?? null})
      await p.caller.game.round.turn({action: 'finish'})
    }
    return asked
  }

  it('stores deck refs for a round made before plans', async () => {
    const asked = await trio(null)
    expect(asked.map((q) => q.id)).toEqual(['library:1', 'library:1', 'library:1'])
    expect(asked[0]?.text).toEqual(expect.any(String))
  })

  it('draws each player their own question from the custom list', async () => {
    const asked = await trio({mode: 'random', source: 'custom'})
    expect(asked.map((q) => q.text)).toEqual(['Custom A?', 'Custom A?', 'Custom A?'])
  })

  it('asks everyone the same question, in their own language', async () => {
    const asked = await trio({mode: 'same', question: 'c:aaaa'}, ['en', 'hu', 'en'])
    expect(asked.map((q) => q.text)).toEqual(['Saját A?', 'Custom A?', 'Custom A?'])
  })

  it('asks turn 1 question A and turn 2 question B; a trio third turn gets A again', async () => {
    const asked = await trio({mode: 'per-turn', questions: ['c:bbbb', 'library:2']})
    expect(asked.map((q) => q.id)).toEqual(['c:bbbb', 'library:2', 'c:bbbb'])
    expect(asked[1]?.text).toEqual(expect.any(String))
  })
})

describe('game.round.response / game.me', () => {
  it('saves my transcript, lists it, and deletes it on request', async () => {
    const {a, b} = await pairedUp()
    const turn = (await a.caller.game.round.turn({action: 'claim'})).pair?.activeTurn
    if (!turn) throw new Error('no turn')

    const saved = await a.caller.game.round.response({
      turnId: turn.id,
      language: 'en',
      transcript: 'I would ask my grandmother.',
      durationMs: 42_000,
      consent: true,
    })
    expect(saved.phase).toBe('answered')

    const mine = await a.caller.game.me.get()
    expect(mine.responses).toMatchObject([
      {turnId: turn.id, transcript: 'I would ask my grandmother.'},
    ])
    expect((await b.caller.game.me.get()).responses).toEqual([])
    expect(
      await refusalOf(
        b.caller.game.round.response({
          turnId: turn.id,
          language: 'en',
          transcript: 'not mine',
          durationMs: 1,
          consent: true,
        })
      )
    ).toBe('not_found')

    const responseId = mine.responses[0]?.id ?? ''
    expect(await refusalOf(b.caller.game.me.deleteResponse({responseId}))).toBe('not_found')
    expect((await a.caller.game.me.deleteResponse({responseId})).responses).toEqual([])
    expect(await refusalOf(a.caller.game.me.deleteResponse({responseId}))).toBe('not_found')
  })

  it('still saves my turn after the host removed my partner and released me', async () => {
    const {a, fake} = await pairedUp()
    const turn = (await a.caller.game.round.turn({action: 'claim'})).pair?.activeTurn
    for (const p of fake.snapshot.pairs) p.playerIds = []
    const saved = await a.caller.game.round.response({
      turnId: turn?.id ?? '',
      language: 'en',
      transcript: 'Kept',
      durationMs: 1000,
      consent: true,
    })
    expect(saved.phase).toBe('unpaired')
    expect((await a.caller.game.me.get()).responses).toMatchObject([{transcript: 'Kept'}])
  })

  it('keeps a turn in the mode it was claimed in and refuses answers on a None turn', async () => {
    const {a, b, fake} = await pairedUp()
    fake.snapshot.game.settings.answerModes = [{mode: 'none', at: 0}]
    const turn = (await a.caller.game.round.turn({action: 'claim'})).pair?.activeTurn
    expect(turn?.answerMode).toBe('none')

    fake.advance(1000)
    fake.snapshot.game.settings.answerModes.push({mode: 'type', at: fake.port.now()})
    expect((await a.caller.game.state()).pair?.activeTurn?.answerMode).toBe('none')
    const answer = {turnId: turn?.id ?? '', language: 'en', durationMs: 0, consent: true} as const
    expect(await refusalOf(a.caller.game.round.response({...answer, transcript: 'Nope'}))).toBe(
      'wrong_answer_mode'
    )

    await a.caller.game.round.turn({action: 'finish'})
    fake.advance(1000)
    const next = (await b.caller.game.round.turn({action: 'claim'})).pair?.activeTurn
    expect(next?.answerMode).toBe('type')
    const saved = await b.caller.game.round.response({
      ...answer,
      turnId: next?.id ?? '',
      transcript: 'Typed',
    })
    expect(saved.phase).toBe('pair_done')
    expect((await a.caller.game.me.get()).responses).toEqual([])
  })

  it('keeps a claim in the old mode when the switch is stamped at the same instant', async () => {
    const {a, fake} = await pairedUp()
    fake.snapshot.game.settings.answerModes = [{mode: 'none', at: fake.port.now()}]
    const turn = (await a.caller.game.round.turn({action: 'claim'})).pair?.activeTurn
    expect(turn?.startedAt).toBe(fake.port.now())
    expect(turn?.answerMode).toBe('voice')
  })

  it('refuses any saved answer from a player who chose to play without saving', async () => {
    const ctx = setup([liveRound], {round: {}, answerModes: [{mode: 'type', at: 0}]})
    const a = await ctx.join('Ann', 'en', false)
    const b = await ctx.join('Bo')
    await a.caller.game.round.pair({partnerCode: b.state.me.pairCode})
    const turn = (await a.caller.game.round.turn({action: 'claim'})).pair?.activeTurn
    expect(turn?.answerMode).toBe('type')
    const save = a.caller.game.round.response({
      turnId: turn?.id ?? '',
      language: 'en',
      transcript: 'Typed anyway',
      durationMs: 0,
      consent: true,
    })
    expect(await refusalOf(save)).toBe('no_consent')
    expect((await a.caller.game.me.get()).responses).toEqual([])
  })

  it('takes feedback and returns fresh state', async () => {
    const {a, fake} = await pairedUp()
    const state = await a.caller.game.feedback({rating: 5, text: 'Loved it'})
    expect(state.me.id).toBe(a.state.me.id)
    expect(fake.feedback.get(a.state.me.id)).toEqual({rating: 5, text: 'Loved it'})
  })
})

const myTurn = (state: PlayerState, playerId: string) =>
  state.pair?.turns.find((t) => t.playerId === playerId)

describe('game.round.vote', () => {
  it('lets me vote on my own finished question, change it, and clear it', async () => {
    const {a, b} = await pairedUp()
    const turnId = (await a.caller.game.round.turn({action: 'claim'})).pair?.activeTurn?.id ?? ''
    expect(await refusalOf(a.caller.game.round.vote({turnId, vote: 1}))).toBe('still_answering')

    await a.caller.game.round.turn({action: 'finish'})
    const up = await a.caller.game.round.vote({turnId, vote: 1})
    expect(myTurn(up, a.state.me.id)?.questionVote).toBe(1)
    const down = await a.caller.game.round.vote({turnId, vote: -1})
    expect(myTurn(down, a.state.me.id)?.questionVote).toBe(-1)
    expect(myTurn(await b.caller.game.state(), a.state.me.id)?.questionVote).toBeNull()

    const cleared = await a.caller.game.round.vote({turnId, vote: null})
    expect(myTurn(cleared, a.state.me.id)?.questionVote).toBeNull()
  })

  it("refuses someone else's turn and an unknown turn", async () => {
    const {a, b} = await pairedUp()
    const turnId = (await a.caller.game.round.turn({action: 'claim'})).pair?.activeTurn?.id ?? ''
    await a.caller.game.round.turn({action: 'finish'})
    expect(await refusalOf(b.caller.game.round.vote({turnId, vote: 1}))).toBe('not_your_turn')
    expect(await refusalOf(a.caller.game.round.vote({turnId: 'nope', vote: 1}))).toBe('not_found')
  })

  it('takes a vote on a timed-out turn in None mode', async () => {
    const {a, fake} = await pairedUp()
    fake.snapshot.game.settings.answerModes = [{mode: 'none', at: 0}]
    const turnId = (await a.caller.game.round.turn({action: 'claim'})).pair?.activeTurn?.id ?? ''
    fake.advance(90_000)
    const state = await a.caller.game.round.vote({turnId, vote: 1})
    expect(myTurn(state, a.state.me.id)).toMatchObject({answerMode: 'none', questionVote: 1})
  })
})

describe('game.screen', () => {
  it('shows counts to anyone with the code', async () => {
    const {a, as} = await pairedUp()
    await a.caller.game.round.turn({action: 'claim'})
    const screen = await as(null).game.screen({code: 'ABCD'})
    expect(screen.counts).toEqual({joined: 2, paired: 2, talking: 1, done: 0})
  })

  it('shows a draft game and its organizer before anyone can join', async () => {
    const fake = createFakeGamePort({
      game: {...game, status: 'lobby', settings: {round: {}, organizer: 'SDD Conf'}},
    })
    const caller = createCaller({recordAnswer: async () => {}, game: fake.port, playerToken: null})
    expect((await caller.game.screen({code: 'ABCD'})).game).toEqual({
      code: 'ABCD',
      title: 'Workshop',
      organizer: 'SDD Conf',
      status: 'lobby',
    })
  })
})

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- no DOM lib in this package; Node's global Request is what the fetch adapter gets in production.
const {Request} = globalThis as unknown as {
  Request: new (url: string, init: object) => Parameters<typeof fetchRequestHandler>[0]['req']
}

describe('refusals over HTTP', () => {
  it('expose data.refusal so the UI can show its own copy', async () => {
    const {a, b, fake} = await pairedUp()
    await a.caller.game.round.turn({action: 'claim'})
    const res = await fetchRequestHandler({
      endpoint: '/api/trpc',
      req: new Request('http://test/api/trpc/game.round.turn', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({action: 'claim'}),
      }),
      router: appRouter,
      createContext: () => ({recordAnswer: async () => {}, game: fake.port, playerToken: b.token}),
    })
    const body = z
      .object({error: z.object({message: z.string(), data: z.object({refusal: z.string()})})})
      .parse(await res.json())
    expect(res.status).toBe(409)
    expect(body.error.data.refusal).toBe('partner_answering')
    expect(body.error.message).toBe('Your partner is answering')
  })
})
