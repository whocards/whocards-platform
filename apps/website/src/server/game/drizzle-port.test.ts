import {PGlite} from '@electric-sql/pglite'
import {createCaller} from '@whocards/api'
import * as gameSchema from '@whocards/game/db'
import {gamePairPlayer, gamePlayer, gameRound, hostedGame} from '@whocards/game/db'
import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api'
import {and, asc, eq} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {createDrizzleGamePort, hashToken} from './drizzle-port'

const client = new PGlite()
const db = drizzle(client)
let clock = Date.now()
const port = createDrizzleGamePort(db, {now: () => clock, random: () => 0.5})
const as = (playerToken: string | null) =>
  createCaller({recordAnswer: async () => {}, game: port, playerToken})

let gameId = ''
let roundId = ''

beforeAll(async () => {
  // Same DDL drizzle-kit writes into apps/app's migration, derived from the schema itself.
  const statements = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({...gameSchema})
  )
  for (const statement of statements) await client.exec(statement)
})

beforeEach(async () => {
  await client.exec('TRUNCATE hosted_game CASCADE')
  clock = Date.now()
  const [game] = await db
    .insert(hostedGame)
    .values({code: 'WORK', title: 'Workshop', status: 'live'})
    .returning()
  const [round] = await db
    .insert(gameRound)
    .values({
      gameId: game?.id ?? '',
      n: 1,
      deckSlug: 'library',
      turnSeconds: 60,
      status: 'live',
      startedAt: new Date(clock),
    })
    .returning()
  gameId = game?.id ?? ''
  roundId = round?.id ?? ''
})

const join = async (name: string) => {
  const {token, state} = await as(null).game.join({
    code: 'work',
    name,
    language: 'en',
    consentTranscript: true,
  })
  return {token, state, caller: as(token)}
}

describe('drizzle game port', () => {
  it('stores only a hash of the player token', async () => {
    const {token, state} = await join('Ann')
    const [row] = await db.select().from(gamePlayer)
    expect(row?.tokenHash).toBe(hashToken(token))
    expect(row?.tokenHash).not.toContain(token)
    expect(state.me.pairCode).toMatch(/^[A-Z2-9]{4}$/)
  })

  it('runs a pair through a round end to end', async () => {
    const a = await join('Ann')
    const b = await join('Bo')
    expect(b.state.me.pairCode).not.toBe(a.state.me.pairCode)

    await a.caller.game.round.pair({partnerCode: b.state.me.pairCode})
    const speaking = await a.caller.game.round.turn({action: 'claim'})
    const turn = speaking.pair?.activeTurn
    expect(turn?.questionText).toEqual(expect.any(String))
    await expect(b.caller.game.round.turn({action: 'claim'})).rejects.toThrow(
      'Your partner is answering'
    )

    clock += 20_000
    const saved = await a.caller.game.round.response({
      turnId: turn?.id ?? '',
      language: 'en',
      transcript: 'First answer',
      durationMs: 20_000,
      consent: true,
    })
    expect(saved.pair?.turns[0]?.finishedAt).toBe(clock)
    expect((await b.caller.game.round.turn({action: 'claim'})).phase).toBe('speaking')

    const mine = await a.caller.game.me.get()
    expect(mine.responses).toMatchObject([{transcript: 'First answer', durationMs: 20_000}])
    const responseId = mine.responses[0]?.id ?? ''
    expect((await a.caller.game.me.deleteResponse({responseId})).responses).toEqual([])
    await expect(a.caller.game.me.deleteResponse({responseId: 'not-a-uuid'})).rejects.toThrow(
      'Not found'
    )

    await a.caller.game.feedback({rating: 4})
    await a.caller.game.feedback({rating: 5, text: 'Again!'})
    const screen = await as(null).game.screen({code: 'WORK'})
    expect(screen.counts).toEqual({joined: 2, paired: 2, talking: 1, done: 0})
  })

  it('reads the round question plan and custom questions from the database', async () => {
    await db
      .update(hostedGame)
      .set({settings: {round: {}, questions: [{id: 'c:aaaa', en: 'Custom?', hu: 'Saját?'}]}})
      .where(eq(hostedGame.id, gameId))
    await db
      .update(gameRound)
      .set({deckSlug: 'custom', questionPlan: {mode: 'same', question: 'c:aaaa'}})
      .where(eq(gameRound.id, roundId))
    const a = await join('Ann')
    const {token} = await as(null).game.join({code: 'work', name: 'Bo', language: 'hu'})
    await a.caller.game.round.pair({partnerCode: (await as(token).game.state()).me.pairCode})
    const turn = (await as(token).game.round.turn({action: 'claim'})).pair?.activeTurn
    expect(turn).toMatchObject({questionId: 'c:aaaa', questionText: 'Saját?'})
  })

  it('lets the database settle races the rules could not see', async () => {
    const [a, b, c] = await Promise.all([join('Ann'), join('Bo'), join('Cy')])
    const ids = [a.state.me.id, b.state.me.id, c.state.me.id] as const

    expect(await port.createPair({roundId, playerIds: [ids[0], ids[1]]})).toBe('ok')
    expect(await port.createPair({roundId, playerIds: [ids[2], ids[1]]})).toBe('conflict')

    const snapshot = await port.loadSnapshot(gameId)
    const pairId = snapshot?.pairs[0]?.id ?? ''
    expect(snapshot?.pairs[0]?.playerIds).toEqual([ids[0], ids[1]])

    const turn = {pairId, questionId: '1', expire: []}
    expect(await port.startTurn({...turn, playerId: ids[0]})).toBe('ok')
    expect(await port.startTurn({...turn, playerId: ids[1]})).toBe('conflict')

    const openTurnId = (await port.loadSnapshot(gameId))?.turns[0]?.id ?? ''
    expect(
      await port.startTurn({
        ...turn,
        playerId: ids[1],
        expire: [{turnId: openTurnId, finishedAt: clock + 90_000}],
      })
    ).toBe('ok')
  })

  it('fills the slot a removed trio member left, then refuses a fourth', async () => {
    const players = await Promise.all(['Ann', 'Bo', 'Cy', 'Di', 'Ed'].map(join))
    const [a, b, c, d, e] = players.map((p) => p.state.me.id)
    await port.createPair({roundId, playerIds: [a ?? '', b ?? '']})
    const pairId = (await port.loadSnapshot(gameId))?.pairs[0]?.id ?? ''
    expect(await port.addToPair({pairId, roundId, playerId: c ?? ''})).toBe('ok')

    await db
      .delete(gamePairPlayer)
      .where(and(eq(gamePairPlayer.pairId, pairId), eq(gamePairPlayer.playerId, a ?? '')))
    expect(await port.addToPair({pairId, roundId, playerId: d ?? ''})).toBe('ok')
    expect(await port.addToPair({pairId, roundId, playerId: e ?? ''})).toBe('conflict')
    const slots = await db
      .select({slot: gamePairPlayer.slot})
      .from(gamePairPlayer)
      .orderBy(asc(gamePairPlayer.slot))
    expect(slots.map((s) => s.slot)).toEqual([0, 1, 2])
  })

  it('opens no turn once the round is over, and keeps a turn whose pair emptied', async () => {
    const [a, b] = await Promise.all([join('Ann'), join('Bo')])
    const playerIds = [a.state.me.id, b.state.me.id] as [string, string]
    await port.createPair({roundId, playerIds})
    const pairId = (await port.loadSnapshot(gameId))?.pairs[0]?.id ?? ''
    const turn = {pairId, questionId: '1', expire: []}
    expect(await port.startTurn({...turn, playerId: playerIds[0]})).toBe('ok')

    await db.delete(gamePairPlayer)
    expect((await port.loadSnapshot(gameId))?.turns).toMatchObject([{pairId, roundId}])

    await db.update(gameRound).set({status: 'done'}).where(eq(gameRound.id, roundId))
    expect(await port.startTurn({...turn, playerId: playerIds[1]})).toBe('conflict')
  })
  it('lets one transcription claim a turn until it is released', async () => {
    const [a, b] = await Promise.all([join('Ann'), join('Bo')])
    await port.createPair({roundId, playerIds: [a.state.me.id, b.state.me.id]})
    const pairId = (await port.loadSnapshot(gameId))?.pairs[0]?.id ?? ''
    await port.startTurn({
      pairId,
      playerId: a.state.me.id,
      questionId: '1',
      expire: [],
    })
    const turnId = (await port.loadSnapshot(gameId))?.turns[0]?.id ?? ''

    const claims = await Promise.all([
      port.claimTranscription(turnId),
      port.claimTranscription(turnId),
    ])
    expect(claims.filter(Boolean)).toHaveLength(1)
    await port.releaseTranscription(turnId)
    expect(await port.claimTranscription(turnId)).toBe(true)
  })

  it('stores and clears a question vote, and the database rejects anything but ±1', async () => {
    const [a, b] = await Promise.all([join('Ann'), join('Bo')])
    await a.caller.game.round.pair({partnerCode: b.state.me.pairCode})
    const turnId = (await a.caller.game.round.turn({action: 'claim'})).pair?.activeTurn?.id ?? ''
    await a.caller.game.round.turn({action: 'finish'})

    const down = await a.caller.game.round.vote({turnId, vote: -1})
    expect(down.pair?.turns[0]?.questionVote).toBe(-1)
    const cleared = await a.caller.game.round.vote({turnId, vote: null})
    expect(cleared.pair?.turns[0]?.questionVote).toBeNull()
    await expect(
      client.exec(`UPDATE game_turn SET question_vote = 2 WHERE id = '${turnId}'`)
    ).rejects.toThrow('game_turn_question_vote_check')
  })
})
