import {getDeck} from '@whocards/decks'
import type {GameSnapshot, HostedGame, Pair, Player, Round, Turn} from '@whocards/game'
import {describe, expect, it, vi} from 'vitest'

import type {TRPCContext} from '../context'
import {createCallerFactory} from '../trpc'
import {createGamesRouter} from './games'
import type {GameSummary, HostStore, SendRecaps} from './games'
import {buildRecaps, closingTimes, readRecapState} from './games-logic'

const T0 = 1_760_000_000_000
const ids = () => {
  let n = 0
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}

type Mem = {
  games: Array<HostedGame & {createdBy: string; createdAt: number}>
  players: Player[]
  rounds: Round[]
  pairs: Pair[]
  turns: Turn[]
  saved: Array<{playerId: string; gameId: string}>
}

/** The rules the Drizzle store enforces with conditional writes and unique indexes, in memory. */
const memoryStore = (clock = {now: T0}) => {
  const id = ids()
  const mem: Mem = {games: [], players: [], rounds: [], pairs: [], turns: [], saved: []}
  const game = (gameId: string) => mem.games.find((g) => g.id === gameId)

  const endLive = (roundId: string, endedAt: number): boolean => {
    const round = mem.rounds.find((r) => r.id === roundId)
    if (round?.status !== 'live') return false
    Object.assign(round, {status: 'done', endsAt: endedAt})
    const open = mem.turns.filter((t) => t.roundId === roundId && t.finishedAt === null)
    for (const c of closingTimes(round, open, endedAt)) {
      const turn = mem.turns.find((t) => t.id === c.turnId)
      if (turn) turn.finishedAt = c.finishedAt
    }
    return true
  }

  const store: HostStore = {
    now: () => clock.now,
    random: () => 0,
    listGames: async (createdBy) =>
      mem.games
        .filter((g) => g.createdBy === createdBy)
        .map((g): GameSummary => ({
          id: g.id,
          code: g.code,
          title: g.title,
          status: g.status,
          createdAt: g.createdAt,
          players: mem.players.filter((p) => p.gameId === g.id).length,
          rounds: mem.rounds.filter((r) => r.gameId === g.id).length,
        })),
    createGame: async ({title, createdBy}) => {
      const row = {
        id: id(),
        code: `G${mem.games.length + 1}XYZ`,
        title,
        status: 'lobby' as const,
        settings: {round: {}},
        createdBy,
        createdAt: clock.now,
      }
      mem.games.push(row)
      return row
    },
    loadSnapshot: async (gameId) => {
      const g = game(gameId)
      if (!g) return null
      const rounds = mem.rounds.filter((r) => r.gameId === gameId)
      const roundIds = new Set(rounds.map((r) => r.id))
      const pairs = mem.pairs.filter((p) => roundIds.has(p.roundId) && p.playerIds.length > 0)
      return {
        game: {id: g.id, code: g.code, title: g.title, status: g.status, settings: g.settings},
        players: mem.players.filter((p) => p.gameId === gameId),
        rounds,
        pairs: pairs.map((p) => ({...p, playerIds: [...p.playerIds]})),
        turns: mem.turns.filter((t) => roundIds.has(t.roundId)),
      }
    },
    savedResponses: async (gameId) => {
      const out: Record<string, number> = {}
      for (const r of mem.saved.filter((s) => s.gameId === gameId)) {
        out[r.playerId] = (out[r.playerId] ?? 0) + 1
      }
      return out
    },
    addRound: async ({gameId, n, ...settings}) => {
      if (mem.rounds.some((r) => r.gameId === gameId && r.n === n)) return 'conflict'
      mem.rounds.push({
        id: id(),
        gameId,
        n,
        ...settings,
        status: 'pending',
        startedAt: null,
        endsAt: null,
      })
      return 'ok'
    },
    updateRound: async ({roundId, whileStatus, settings}) => {
      const round = mem.rounds.find((r) => r.id === roundId)
      if (round?.status !== whileStatus) return 'stale'
      Object.assign(round, settings)
      return 'ok'
    },
    startRound: async ({gameId, roundId, startedAt, endsAt}) => {
      const g = game(gameId)
      if (g?.status === 'lobby') g.status = 'live'
      if (g?.status !== 'live') return 'stale'
      if (mem.rounds.some((r) => r.gameId === gameId && r.status === 'live')) return 'conflict'
      const round = mem.rounds.find((r) => r.id === roundId)
      if (round?.status !== 'pending') return 'stale'
      Object.assign(round, {status: 'live', startedAt, endsAt})
      return 'ok'
    },
    endRound: async ({roundId, endedAt}) => (endLive(roundId, endedAt) ? 'ok' : 'stale'),
    endGame: async ({gameId, endedAt}) => {
      const g = game(gameId)
      if (!g || g.status === 'ended') return false
      const live = mem.rounds.find((r) => r.gameId === gameId && r.status === 'live')
      if (live) endLive(live.id, endedAt)
      g.status = 'ended'
      return true
    },
    saveRecapState: async (gameId, recap) => {
      const g = game(gameId)
      if (g) g.settings = Object.assign({}, g.settings, {recap})
    },
    removePlayer: async ({playerId, release}) => {
      const before = mem.players.length
      mem.players = mem.players.filter((p) => p.id !== playerId)
      for (const pair of mem.pairs) {
        pair.playerIds = pair.playerIds.filter(
          (pid) =>
            pid !== playerId && !(pair.id === release?.pairId && release.playerIds.includes(pid))
        )
      }
      mem.turns = mem.turns.filter((t) => t.playerId !== playerId)
      return mem.players.length < before
    },
  }

  const join = (gameId: string, name: string, extra: Partial<Player> = {}): Player => {
    const player: Player = {
      id: id(),
      gameId,
      name,
      language: 'en',
      pairCode: name.slice(0, 4).toUpperCase(),
      email: null,
      consentTranscript: false,
      consentRecap: false,
      ...extra,
    }
    mem.players.push(player)
    return player
  }
  const pair = (roundId: string, playerIds: string[]): Pair => {
    const p = {id: id(), roundId, playerIds}
    mem.pairs.push(p)
    return p
  }
  const turn = (
    pairId: string,
    playerId: string,
    questionId: string,
    startedAt: number,
    finishedAt: number | null
  ) => {
    const roundId = mem.pairs.find((p) => p.id === pairId)?.roundId ?? ''
    const t: Turn = {id: id(), pairId, roundId, playerId, questionId, startedAt, finishedAt}
    mem.turns.push(t)
    return t
  }

  return {store, mem, clock, join, pair, turn}
}

type Role = NonNullable<TRPCContext['membership']>['role']
const ctx = (role: Role | null, userId = 'u-avi'): TRPCContext => ({
  user: role ? {id: userId, email: `${userId}@example.com`, name: userId} : null,
  membership: role ? {organizationId: 'org', role} : null,
})

const setup = (
  sendRecaps: SendRecaps = vi.fn<SendRecaps>(async (r) => ({
    sent: r.length,
    failed: 0,
    error: null,
  }))
) => {
  const fake = memoryStore()
  const router = createGamesRouter({store: fake.store, sendRecaps})
  const caller = (role: Role | null = 'facilitator', userId?: string) =>
    createCallerFactory(router)(ctx(role, userId))
  return {...fake, caller, sendRecaps}
}

const ROUND = {deckSlug: 'library', turnSeconds: 60}

describe('games router permissions', () => {
  it.each(['member', 'reviewer'] as const)('refuses %s on every procedure', async (role) => {
    const {caller} = setup()
    const c = caller(role)
    const gameId = '00000000-0000-4000-8000-000000000999'
    await expect(c.list()).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.create({title: 'x'})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.detail({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.endGame({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
  })

  it('refuses a caller with no session', async () => {
    const {caller} = setup()
    await expect(caller(null).list()).rejects.toMatchObject({code: 'UNAUTHORIZED'})
  })

  it.each(['facilitator', 'admin', 'owner'] as const)('lets %s host', async (role) => {
    const {caller} = setup()
    await expect(caller(role).create({title: 'SDD'})).resolves.toMatchObject({status: 'lobby'})
  })
})

describe('games router', () => {
  it('stamps created_by from the session and lists only my games', async () => {
    const {caller, mem} = setup()
    await caller('facilitator', 'u-avi').create({title: 'Mine'})
    await caller('facilitator', 'u-tamas').create({title: 'Theirs'})
    expect(mem.games.map((g) => g.createdBy)).toEqual(['u-avi', 'u-tamas'])
    expect((await caller('facilitator', 'u-avi').list()).map((g) => g.title)).toEqual(['Mine'])
  })

  it('offers every registered deck for rounds', async () => {
    const {caller} = setup()
    const decks = await caller().decks()
    expect(decks.map((d) => d.slug)).toEqual(expect.arrayContaining(['library', 'hajnalig']))
  })

  it('numbers rounds, applies defaults and rejects unknown decks', async () => {
    const {caller} = setup()
    const c = caller()
    const {id: gameId} = await c.create({title: 'SDD'})
    await c.addRound({gameId, settings: ROUND})
    const detail = await c.addRound({
      gameId,
      settings: {...ROUND, oddRule: 'sitout', overtime: 'hard'},
    })
    expect(detail.rounds.map((r) => [r.n, r.oddRule, r.overtime, r.overtimeSeconds])).toEqual([
      [1, 'trio', 'nudge', 30],
      [2, 'sitout', 'hard', 30],
    ])
    await expect(
      c.addRound({gameId, settings: {...ROUND, deckSlug: 'nope'}})
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('starts the first round by taking the game live, one live round at a time', async () => {
    const {caller, clock} = setup()
    const c = caller()
    const {id: gameId} = await c.create({title: 'SDD'})
    await c.addRound({gameId, settings: ROUND})
    const {rounds} = await c.addRound({gameId, settings: ROUND})
    const [r1, r2] = rounds.map((r) => r.id)

    const live = await c.startRound({gameId, roundId: r1!})
    expect(live.game.status).toBe('live')
    expect(live.liveRoundId).toBe(r1)
    // Two back-to-back 60 s turns plus 30 s nudge each.
    expect(live.rounds[0]).toMatchObject({startedAt: clock.now, endsAt: clock.now + 180_000})

    await expect(c.startRound({gameId, roundId: r2!})).rejects.toMatchObject({
      message: 'End the live round first.',
    })
    await expect(c.startRound({gameId, roundId: r1!})).rejects.toMatchObject({code: 'BAD_REQUEST'})
  })

  it('lets settings change mid-round but never the deck', async () => {
    const {caller} = setup()
    const c = caller()
    const {id: gameId} = await c.create({title: 'SDD'})
    const {rounds} = await c.addRound({gameId, settings: ROUND})
    const roundId = rounds[0]!.id
    await c.updateRound({gameId, roundId, settings: {...ROUND, deckSlug: 'hajnalig'}})
    await c.startRound({gameId, roundId})

    const after = await c.updateRound({
      gameId,
      roundId,
      settings: {...ROUND, deckSlug: 'hajnalig', turnSeconds: 90},
    })
    expect(after.rounds[0]).toMatchObject({turnSeconds: 90, deckSlug: 'hajnalig'})
    await expect(c.updateRound({gameId, roundId, settings: ROUND})).rejects.toMatchObject({
      message: 'The deck is fixed once a round starts.',
    })

    await c.endRound({gameId, roundId})
    await expect(
      c.updateRound({gameId, roundId, settings: {...ROUND, deckSlug: 'hajnalig'}})
    ).rejects.toMatchObject({message: 'That round is over.'})
  })

  it('ends a round by closing open turns at now or their deadline', async () => {
    const {caller, clock, mem, join, pair, turn} = setup()
    const c = caller()
    const {id: gameId} = await c.create({title: 'SDD'})
    const {rounds} = await c.addRound({gameId, settings: ROUND})
    const roundId = rounds[0]!.id
    await c.startRound({gameId, roundId})
    const [a, b, x, y] = ['Anna', 'Bela', 'Xena', 'Yuri'].map((n) => join(gameId, n))
    const fresh = turn(pair(roundId, [a!.id, b!.id]).id, a!.id, '1', clock.now, null)
    const stale = turn(pair(roundId, [x!.id, y!.id]).id, x!.id, '2', clock.now - 600_000, null)

    clock.now += 20_000
    const detail = await c.endRound({gameId, roundId})
    expect(detail.rounds[0]).toMatchObject({status: 'done', endsAt: clock.now})
    expect(detail.liveRoundId).toBeNull()
    expect(mem.turns.find((t) => t.id === fresh.id)?.finishedAt).toBe(clock.now)
    expect(mem.turns.find((t) => t.id === stale.id)?.finishedAt).toBe(stale.startedAt + 90_000)
    await expect(c.endRound({gameId, roundId})).rejects.toMatchObject({code: 'BAD_REQUEST'})
  })

  it('reports live counts without content', async () => {
    const {caller, clock, mem, join, pair, turn} = setup()
    const c = caller()
    const {id: gameId} = await c.create({title: 'SDD'})
    const {rounds} = await c.addRound({gameId, settings: ROUND})
    const roundId = rounds[0]!.id
    await c.startRound({gameId, roundId})
    const [a, b] = ['Anna', 'Bela'].map((n) => join(gameId, n))
    join(gameId, 'Cili', {email: 'cili@example.com', consentRecap: true})
    turn(pair(roundId, [a!.id, b!.id]).id, a!.id, '1', clock.now, null)
    mem.saved.push({playerId: b!.id, gameId})

    const detail = await c.detail({gameId})
    expect(detail.counts).toEqual({players: 3, pairs: 1, turnsInProgress: 1, responses: 1})
    expect(JSON.stringify(detail)).not.toContain('@')
  })

  it('removes a player, frees the stranded partner and keeps their turn in the round', async () => {
    const {caller, clock, mem, join, pair, turn} = setup()
    const c = caller()
    const {id: gameId} = await c.create({title: 'SDD'})
    const {rounds} = await c.addRound({gameId, settings: ROUND})
    const roundId = rounds[0]!.id
    await c.startRound({gameId, roundId})
    const [a, b] = ['Anna', 'Bela'].map((n) => join(gameId, n))
    const p = pair(roundId, [a!.id, b!.id])

    const kept = turn(p.id, b!.id, '1', clock.now, null)

    const detail = await c.removePlayer({gameId, playerId: a!.id})
    expect(detail.players.map((pl) => pl.name)).toEqual(['Bela'])
    expect(mem.pairs.find((x) => x.id === p.id)?.playerIds).toEqual([])
    expect(detail.rounds[0]?.turns).toBe(1)
    await expect(c.removePlayer({gameId, playerId: a!.id})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

    clock.now += 10_000
    await c.endRound({gameId, roundId})
    expect(mem.turns.find((t) => t.id === kept.id)?.finishedAt).toBe(clock.now)
  })
})

const played = async (send?: SendRecaps) => {
  const t = setup(send)
  const c = t.caller()
  const {id: gameId} = await c.create({title: 'SDD'})
  const {rounds} = await c.addRound({gameId, settings: ROUND})
  const roundId = rounds[0]!.id
  await c.startRound({gameId, roundId})
  const anna = t.join(gameId, 'Anna', {email: 'anna@example.com', consentRecap: true})
  const bela = t.join(gameId, 'Bela', {email: 'bela@example.com', consentRecap: false})
  const cili = t.join(gameId, 'Cili', {email: null, consentRecap: true})
  const p = t.pair(roundId, [anna.id, bela.id])
  t.turn(p.id, anna.id, '1', t.clock.now, t.clock.now + 60_000)
  t.turn(p.id, bela.id, '2', t.clock.now + 60_000, null)
  t.clock.now += 100_000
  return {...t, c, gameId, roundId, anna, bela, cili}
}

describe('endGame', () => {
  it('ends the live round, ends the game and mails only consenting players with an email', async () => {
    const {c, gameId, sendRecaps, mem} = await played()
    const detail = await c.endGame({gameId})

    expect(detail.game.status).toBe('ended')
    expect(detail.rounds[0]?.status).toBe('done')
    expect(mem.turns.every((t) => t.finishedAt !== null)).toBe(true)
    expect(sendRecaps).toHaveBeenCalledTimes(1)
    const [recaps] = vi.mocked(sendRecaps).mock.calls[0]!
    expect(recaps.map((r) => r.to)).toEqual(['anna@example.com'])
    expect(recaps[0]?.props.you).toEqual({peopleMet: 1, turns: 1, minutes: 1, savedAnswers: 0})
    expect(detail.game.recap).toEqual({sentAt: expect.any(Number), sent: 1, failed: 0, error: null})
  })

  it('is idempotent: pressing End twice sends once', async () => {
    const {c, gameId, sendRecaps} = await played()
    await c.endGame({gameId})
    const again = await c.endGame({gameId})
    expect(again.game.status).toBe('ended')
    expect(sendRecaps).toHaveBeenCalledTimes(1)
  })

  it('records a failed send instead of losing the end', async () => {
    const {c, gameId} = await played(async () => {
      throw new Error('resend down')
    })
    const detail = await c.endGame({gameId})
    expect(detail.game.status).toBe('ended')
    expect(detail.game.recap).toMatchObject({sent: 0, failed: 1, error: 'resend down'})
  })

  it('refuses to start rounds once the game is over', async () => {
    const {c, gameId} = await played()
    const {rounds} = await c.addRound({gameId, settings: ROUND})
    await c.endGame({gameId})
    await expect(c.startRound({gameId, roundId: rounds[1]!.id})).rejects.toMatchObject({
      message: 'The game is over.',
    })
    await expect(c.addRound({gameId, settings: ROUND})).rejects.toMatchObject({code: 'BAD_REQUEST'})
  })
})

const round = (id: string, n: number, deckSlug: string): Round => ({
  id,
  gameId: 'g',
  n,
  deckSlug,
  turnSeconds: 60,
  oddRule: 'trio',
  overtime: 'nudge',
  overtimeSeconds: 30,
  status: 'done',
  startedAt: T0,
  endsAt: T0 + 600_000,
})
const player = (id: string, language: 'en' | 'hu'): Player => ({
  id,
  gameId: 'g',
  name: id,
  language,
  pairCode: id.toUpperCase(),
  email: `${id}@example.com`,
  consentTranscript: false,
  consentRecap: true,
})

const snapshot = (): GameSnapshot => {
  return {
    game: {id: 'g', code: 'K7QM2', title: 'SDD', status: 'ended', settings: {round: {}}},
    players: [player('a', 'hu'), player('b', 'en'), player('c', 'en')],
    rounds: [
      round('r1', 1, 'hajnalig'),
      round('r2', 2, 'hajnalig'),
      {...round('r3', 3, 'library'), startedAt: null},
    ],
    pairs: [
      {id: 'p1', roundId: 'r1', playerIds: ['a', 'b']},
      {id: 'p2', roundId: 'r2', playerIds: ['a', 'c']},
    ],
    turns: [
      {
        id: 't1',
        pairId: 'p1',
        roundId: 'r1',
        playerId: 'a',
        questionId: '1',
        startedAt: T0,
        finishedAt: T0 + 90_000,
      },
      {
        id: 't2',
        pairId: 'p1',
        roundId: 'r1',
        playerId: 'b',
        questionId: '2',
        startedAt: T0,
        finishedAt: T0 + 30_000,
      },
      {
        id: 't3',
        pairId: 'p2',
        roundId: 'r2',
        playerId: 'a',
        questionId: '3',
        startedAt: T0,
        finishedAt: null,
      },
    ],
  }
}

describe('buildRecaps', () => {
  it('counts the room and the player, counts only, with links for the game code', () => {
    const [anna] = buildRecaps({
      snapshot: snapshot(),
      savedByPlayer: {a: 2},
      now: T0 + 3_600_000,
      random: () => 0,
    })
    expect(anna?.props.event).toEqual({players: 3, rounds: 2, turns: 3, minutes: 4, languages: 2})
    // Open turn counts to its deadline: 90 s + 90 s.
    expect(anna?.props.you).toEqual({peopleMet: 2, turns: 2, minutes: 3, savedAnswers: 2})
    expect(anna?.props.myAnswersUrl).toBe('https://whocards.cc/events/sdd-2026/me?code=K7QM2')
  })

  it('takes home a question from a played deck that the player never drew, in their language', () => {
    const [anna] = buildRecaps({snapshot: snapshot(), savedByPlayer: {}, now: T0, random: () => 0})
    const deck = getDeck('hajnalig')!
    const firstUndrawn = deck.questionIds.find((id) => id !== '1' && id !== '3')!
    expect(anna?.props.question).toBe(deck.questions[firstUndrawn]?.hu)
  })

  it('reads back a stored recap state and ignores anything else', () => {
    expect(readRecapState({round: {}})).toBeNull()
    expect(
      readRecapState({round: {}, recap: {sentAt: 1, sent: 2, failed: 0, error: null}})
    ).toEqual({
      sentAt: 1,
      sent: 2,
      failed: 0,
      error: null,
    })
  })
})
