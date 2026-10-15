import {getDeck} from '@whocards/decks'
import {PHYSICAL_QUESTION_ID, PHYSICAL_SOURCE} from '@whocards/game'
import type {
  GameSnapshot,
  HostedGame,
  Pair,
  Player,
  QuestionPlan,
  Round,
  Turn,
} from '@whocards/game'
import {describe, expect, it, vi} from 'vitest'

import type {TRPCContext} from '../context'
import {createCallerFactory} from '../trpc'
import {createGamesRouter, QUESTIONS_CONFLICT} from './games'
import type {
  GameSummary,
  HostStore,
  RenderRecap,
  RenderRevisit,
  SendRecaps,
  SendRevisits,
} from './games'
import {
  buildRecaps,
  buildRevisits,
  closingTimes,
  previewRecap,
  previewRevisit,
  questionUrl,
  readSendState,
} from './games-logic'

const T0 = 1_760_000_000_000
const ids = () => {
  let n = 0
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}

type Mem = {
  games: Array<HostedGame & {createdBy: string; createdAt: number; facilitators: string[]}>
  players: Player[]
  rounds: Round[]
  pairs: Pair[]
  turns: Turn[]
  saved: Array<{playerId: string; gameId: string}>
}

// Org 'org': three facilitators, an admin, an owner and a plain member.
const MEMBERS = [
  {id: 'u-avi', label: 'Avi', role: 'facilitator'},
  {id: 'u-tamas', label: 'Tamas', role: 'facilitator'},
  {id: 'u-reka', label: 'Reka', role: 'facilitator'},
  {id: 'u-boss', label: 'Boss', role: 'admin'},
  {id: 'u-own', label: 'Own', role: 'owner'},
  {id: 'u-mem', label: 'Mem', role: 'member'},
] as const
const labelOf = (id: string) => MEMBERS.find((m) => m.id === id)?.label ?? null

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
    listGames: async (userId) =>
      mem.games
        .filter((g) => userId === null || g.createdBy === userId || g.facilitators.includes(userId))
        .toReversed()
        .map((g): GameSummary => ({
          id: g.id,
          code: g.code,
          title: g.title,
          organizer: g.settings.organizer ?? null,
          createdBy: labelOf(g.createdBy),
          createdById: g.createdBy,
          facilitators: g.facilitators.flatMap((f) => labelOf(f) ?? []),
          status: g.status,
          createdAt: g.createdAt,
          players: mem.players.filter((p) => p.gameId === g.id).length,
          rounds: mem.rounds.filter((r) => r.gameId === g.id).length,
        })),
    createGame: async ({title, organizer, createdBy}) => {
      const row: Mem['games'][number] = {
        id: id(),
        code: `G${mem.games.length + 1}XYZ`,
        title,
        status: 'lobby',
        settings: {round: {}, organizer},
        createdBy,
        createdAt: clock.now,
        facilitators: [],
      }
      mem.games.push(row)
      return row
    },
    copyGame: async ({title, createdBy, settings, facilitators, rounds}) => {
      const row: Mem['games'][number] = {
        id: id(),
        code: `G${mem.games.length + 1}XYZ`,
        title,
        status: 'lobby',
        settings,
        createdBy,
        createdAt: clock.now,
        facilitators,
      }
      mem.games.push(row)
      for (const r of rounds) {
        mem.rounds.push({
          ...r,
          id: id(),
          gameId: row.id,
          status: 'pending',
          startedAt: null,
          endsAt: null,
        })
      }
      return row
    },
    deleteGame: async (gameId) => {
      const g = game(gameId)
      if (!g || g.status === 'live') return false
      const roundIds = new Set(mem.rounds.filter((r) => r.gameId === gameId).map((r) => r.id))
      mem.games = mem.games.filter((x) => x.id !== gameId)
      mem.players = mem.players.filter((p) => p.gameId !== gameId)
      mem.rounds = mem.rounds.filter((r) => r.gameId !== gameId)
      mem.pairs = mem.pairs.filter((p) => !roundIds.has(p.roundId))
      mem.turns = mem.turns.filter((t) => !roundIds.has(t.roundId))
      mem.saved = mem.saved.filter((x) => x.gameId !== gameId)
      return true
    },
    hostsOf: async (gameId) => {
      const g = game(gameId)
      return g ? {createdBy: g.createdBy, facilitators: [...g.facilitators]} : null
    },
    usersByIds: async (userIds) =>
      userIds.flatMap((u) => {
        const label = labelOf(u)
        return label ? [{id: u, label}] : []
      }),
    facilitatorsIn: async (organizationId) =>
      organizationId === 'org'
        ? MEMBERS.filter((m) => m.role !== 'member')
            .map(({id: u, label}) => ({id: u, label}))
            .toSorted((a, b) => a.label.localeCompare(b.label))
        : [],
    setFacilitator: async ({gameId, userId, on}) => {
      const g = game(gameId)
      if (!g) return
      g.facilitators = [...g.facilitators.filter((f) => f !== userId), ...(on ? [userId] : [])]
    },
    updateGame: async ({gameId, title, organizer}) => {
      const g = game(gameId)
      if (!g || g.status === 'ended') return 'stale'
      Object.assign(g, {title, settings: {...g.settings, organizer}})
      return 'ok'
    },
    setAnswerMode: async ({gameId, mode}) => {
      const at = clock.now
      const g = game(gameId)
      if (!g || g.status === 'ended') return 'stale'
      g.settings = {...g.settings, answerModes: [...(g.settings.answerModes ?? []), {mode, at}]}
      return 'ok'
    },
    goLive: async (gameId) => {
      const g = game(gameId)
      if (g?.status !== 'lobby') return false
      g.status = 'live'
      return true
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
      if (game(gameId)?.status !== 'live') return 'stale'
      if (mem.rounds.some((r) => r.gameId === gameId && r.status === 'live')) return 'conflict'
      const round = mem.rounds.find((r) => r.id === roundId)
      if (round?.status !== 'pending') return 'stale'
      Object.assign(round, {status: 'live', startedAt, endsAt})
      return 'ok'
    },
    endRound: async ({roundId, endedAt}) => (endLive(roundId, endedAt) ? 'ok' : 'stale'),
    endGame: async ({gameId, endedAt}) => {
      const g = game(gameId)
      if (!g || g.status === 'ended') return
      const live = mem.rounds.find((r) => r.gameId === gameId && r.status === 'live')
      if (live) endLive(live.id, endedAt)
      g.status = 'ended'
    },
    claimSend: async (gameId, mailing, claim) => {
      const g = game(gameId)
      const state = g && readSendState(g.settings, mailing)
      if (g?.status !== 'ended' || (state && (state.pending || state.sent > 0))) return false
      g.settings = Object.assign({}, g.settings, {[mailing]: claim})
      return true
    },
    ensureStandbyKey: async (gameId, key) => {
      const g = game(gameId)
      if (g) g.settings = {...g.settings, standbyKey: g.settings.standbyKey ?? key}
    },
    saveQuestions: async (gameId, questions) => {
      const g = game(gameId)
      if (g) g.settings = {...g.settings, questions}
    },
    saveSendState: async (gameId, mailing, state) => {
      const g = game(gameId)
      if (g) g.settings = Object.assign({}, g.settings, {[mailing]: state})
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
      joinedAt: 0,
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
    const t: Turn = {
      id: id(),
      pairId,
      roundId,
      playerId,
      questionId,
      startedAt,
      finishedAt,
      questionVote: null,
    }
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

const renderRecap: RenderRecap = async (props) => `<p>${props.name} · ${props.organizer}</p>`
const renderRevisit: RenderRevisit = async (props) =>
  `<p>${props.name}: ${props.questions.map((q) => q.text).join(' | ')}</p>`

const setup = (
  sendRecaps: SendRecaps = vi.fn<SendRecaps>(async (r) => ({
    sent: r.length,
    failed: 0,
    error: null,
  })),
  sendRevisits: SendRevisits = vi.fn<SendRevisits>(async (r) => ({
    sent: r.length,
    failed: 0,
    error: null,
  }))
) => {
  const fake = memoryStore()
  const router = createGamesRouter({
    store: fake.store,
    sendRecaps,
    renderRecap,
    sendRevisits,
    renderRevisit,
  })
  const caller = (role: Role | null = 'facilitator', userId?: string) =>
    createCallerFactory(router)(ctx(role, userId))
  return {...fake, caller, sendRecaps, sendRevisits}
}

const random = (source: string): QuestionPlan => ({mode: 'random', source})
const ROUND = {questionPlan: random('library'), turnSeconds: 60}
const HAJNALIG = {...ROUND, questionPlan: random('hajnalig')}
const GAME = {title: 'SDD', organizer: 'SDD Conf'}

/** A game created, opened for joining, with `rounds` rounds added. */
const opened = async (c: ReturnType<ReturnType<typeof setup>['caller']>, rounds = 1) => {
  const {id: gameId} = await c.create(GAME)
  await c.goLive({gameId})
  let detail = await c.detail({gameId})
  for (let i = 0; i < rounds; i++) detail = await c.addRound({gameId, settings: ROUND})
  return {gameId, roundIds: detail.rounds.map((r) => r.id)}
}

describe('games router permissions', () => {
  it.each(['member', 'reviewer'] as const)('refuses %s on every procedure', async (role) => {
    const {caller} = setup()
    const c = caller(role)
    const gameId = '00000000-0000-4000-8000-000000000999'
    await expect(c.list()).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.create(GAME)).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.detail({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.updateGame({gameId, ...GAME})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.goLive({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.endGame({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.recapPreview({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.sendRecaps({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.revisitPreview({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.sendRevisits({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.facilitatorOptions({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.copyGame({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.deleteGame({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    await expect(c.setFacilitator({gameId, userId: 'u-x', on: true})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('refuses a caller with no session', async () => {
    const {caller} = setup()
    await expect(caller(null).list()).rejects.toMatchObject({code: 'UNAUTHORIZED'})
  })

  it.each(['facilitator', 'admin', 'owner'] as const)('lets %s host', async (role) => {
    const {caller} = setup()
    await expect(caller(role).create(GAME)).resolves.toMatchObject({status: 'lobby'})
  })
})

const twoGames = async () => {
  const t = setup()
  const {id: mine} = await t.caller('facilitator', 'u-avi').create({title: 'Mine', organizer: 'A'})
  const {id: theirs} = await t.caller('facilitator', 'u-tamas').create({
    title: 'Theirs',
    organizer: 'B',
  })
  return {...t, mine, theirs}
}

describe('game access', () => {
  it('stamps created_by and lists only the games a facilitator hosts', async () => {
    const {caller, mem} = await twoGames()
    expect(mem.games.map((g) => g.createdBy)).toEqual(['u-avi', 'u-tamas'])
    const titles = async (role: Role, user: string) =>
      (await caller(role, user).list()).map((g) => g.title)
    expect(await titles('facilitator', 'u-avi')).toEqual(['Mine'])
    expect(await titles('facilitator', 'u-reka')).toEqual([])
    expect(await titles('admin', 'u-boss')).toEqual(['Theirs', 'Mine'])
    expect(await titles('owner', 'u-own')).toEqual(['Theirs', 'Mine'])
  })

  it("hides someone else's game from a facilitator as NOT_FOUND, on reads and writes", async () => {
    const {caller, theirs: gameId} = await twoGames()
    const c = caller('facilitator', 'u-avi')
    const roundId = '00000000-0000-4000-8000-000000000998'
    const calls = [
      c.detail({gameId}),
      c.updateGame({gameId, ...GAME}),
      c.goLive({gameId}),
      c.addRound({gameId, settings: ROUND}),
      c.updateRound({gameId, roundId, settings: ROUND}),
      c.startRound({gameId, roundId}),
      c.endRound({gameId, roundId}),
      c.endGame({gameId}),
      c.recapPreview({gameId}),
      c.sendRecaps({gameId}),
      c.revisitPreview({gameId}),
      c.sendRevisits({gameId}),
      c.removePlayer({gameId, playerId: roundId}),
      c.saveQuestions({gameId, questions: [], baseIds: []}),
      c.facilitatorOptions({gameId}),
      c.setFacilitator({gameId, userId: 'u-avi', on: true}),
      c.setAnswerMode({gameId, mode: 'type'}),
      c.copyGame({gameId}),
      c.deleteGame({gameId}),
    ]
    for (const call of calls) await expect(call).rejects.toMatchObject({code: 'NOT_FOUND'})
    const missing = c.detail({gameId: '00000000-0000-4000-8000-000000000999'})
    await expect(missing).rejects.toMatchObject({code: 'NOT_FOUND', message: 'No such game.'})
  })

  it('lets a co-facilitator see and run the game, but not change who hosts it', async () => {
    const {caller, mine: gameId} = await twoGames()
    const avi = caller('facilitator', 'u-avi')
    expect((await avi.facilitatorOptions({gameId})).map((u) => u.id)).toEqual([
      'u-boss',
      'u-own',
      'u-reka',
      'u-tamas',
    ])
    const added = await avi.setFacilitator({gameId, userId: 'u-tamas', on: true})
    expect(added.game.facilitators).toEqual([{id: 'u-tamas', label: 'Tamas'}])

    const tamas = caller('facilitator', 'u-tamas')
    const list = await tamas.list()
    expect(list.map((g) => [g.title, g.createdBy, g.facilitators])).toEqual([
      ['Theirs', 'Tamas', []],
      ['Mine', 'Avi', ['Tamas']],
    ])
    const detail = await tamas.detail({gameId})
    expect(detail.game).toMatchObject({createdBy: 'Avi', canManageHosts: false})
    expect((await tamas.goLive({gameId})).game.status).toBe('live')
    await tamas.addRound({gameId, settings: ROUND})

    const forbidden = {code: 'FORBIDDEN'}
    await expect(tamas.facilitatorOptions({gameId})).rejects.toMatchObject(forbidden)
    await expect(tamas.setFacilitator({gameId, userId: 'u-reka', on: true})).rejects.toMatchObject(
      forbidden
    )
    await expect(
      tamas.setFacilitator({gameId, userId: 'u-tamas', on: false})
    ).rejects.toMatchObject(forbidden)

    await avi.setFacilitator({gameId, userId: 'u-tamas', on: false})
    await expect(tamas.detail({gameId})).rejects.toMatchObject({code: 'NOT_FOUND'})
  })

  it('lets admins and owners run and manage any game', async () => {
    const {caller, mine: gameId} = await twoGames()
    for (const [role, user] of [
      ['admin', 'u-boss'],
      ['owner', 'u-own'],
    ] as const) {
      const c = caller(role, user)
      expect((await c.detail({gameId})).game.canManageHosts).toBe(true)
      await c.setFacilitator({gameId, userId: 'u-reka', on: true})
      await c.addRound({gameId, settings: ROUND})
    }
    const done = await caller('owner', 'u-own').endGame({gameId})
    expect(done.game).toMatchObject({
      status: 'ended',
      facilitators: [{id: 'u-reka', label: 'Reka'}],
    })
  })

  it('only adds org facilitators, and treats the creator as already hosting', async () => {
    const {caller, mine: gameId} = await twoGames()
    const avi = caller('facilitator', 'u-avi')
    for (const userId of ['u-mem', 'u-nobody']) {
      await expect(avi.setFacilitator({gameId, userId, on: true})).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    }
    expect(
      (await avi.setFacilitator({gameId, userId: 'u-avi', on: true})).game.facilitators
    ).toEqual([])
  })
})

describe('games router', () => {
  it('requires an organizer and lets a host edit the details until the game ends', async () => {
    const {caller} = setup()
    await expect(caller().create({title: 'SDD', organizer: '  '})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(caller().create({title: 'SDD', organizer: 'x'.repeat(81)})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })

    const {id: gameId} = await caller('facilitator', 'u-avi').create(GAME)
    const edited = await caller('admin', 'u-boss').updateGame({
      gameId,
      title: ' SDD main room ',
      organizer: ' Acme ',
    })
    expect(edited.game).toMatchObject({
      title: 'SDD main room',
      organizer: 'Acme',
      createdBy: 'Avi',
      status: 'lobby',
    })

    await caller().endGame({gameId})
    await expect(caller().updateGame({gameId, ...GAME})).rejects.toMatchObject({
      message: 'The game is over.',
    })
  })

  it('reads games made before organizers existed', async () => {
    const {caller, mem} = setup()
    const {id: gameId} = await caller().create(GAME)
    mem.games[0]!.settings = {round: {}}
    expect((await caller().detail({gameId})).game.organizer).toBeNull()
    expect((await caller().list())[0]?.organizer).toBeNull()
  })

  it('keeps a draft closed: no rounds start until Go live, which is idempotent', async () => {
    const {caller} = setup()
    const c = caller()
    const {id: gameId} = await c.create(GAME)
    const {rounds} = await c.addRound({gameId, settings: ROUND})
    const roundId = rounds[0]!.id
    await expect(c.startRound({gameId, roundId})).rejects.toMatchObject({
      message: 'Go live first, so players can join.',
    })

    const [a, b] = await Promise.all([
      caller('facilitator', 'u-avi').goLive({gameId}),
      caller('admin', 'u-boss').goLive({gameId}),
    ])
    expect([a.game.status, b.game.status]).toEqual(['live', 'live'])
    expect((await c.startRound({gameId, roundId})).liveRoundId).toBe(roundId)

    await c.endGame({gameId})
    await expect(c.goLive({gameId})).rejects.toMatchObject({message: 'The game is over.'})
  })

  it('offers every registered deck for rounds', async () => {
    const {caller} = setup()
    const decks = await caller().decks()
    expect(decks.map((d) => d.slug)).toEqual(expect.arrayContaining(['library', 'hajnalig']))
  })

  it('numbers rounds, applies defaults and rejects unknown decks', async () => {
    const {caller} = setup()
    const c = caller()
    const {id: gameId} = await c.create(GAME)
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
      c.addRound({gameId, settings: {...ROUND, questionPlan: random('nope')}})
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('starts rounds in a live game, one live round at a time', async () => {
    const {caller, clock} = setup()
    const c = caller()
    const {gameId, roundIds} = await opened(c, 2)
    const [r1, r2] = roundIds

    const live = await c.startRound({gameId, roundId: r1!})
    expect(live.liveRoundId).toBe(r1)
    // Two back-to-back 60 s turns plus 30 s nudge each.
    expect(live.rounds[0]).toMatchObject({startedAt: clock.now, endsAt: clock.now + 180_000})

    await expect(c.startRound({gameId, roundId: r2!})).rejects.toMatchObject({
      message: 'End the live round first.',
    })
    await expect(c.startRound({gameId, roundId: r1!})).rejects.toMatchObject({code: 'BAD_REQUEST'})
  })

  it('lets settings change mid-round but never the questions', async () => {
    const {caller} = setup()
    const c = caller()
    const {gameId, roundIds} = await opened(c)
    const roundId = roundIds[0]!
    await c.updateRound({gameId, roundId, settings: HAJNALIG})
    await c.startRound({gameId, roundId})

    const after = await c.updateRound({
      gameId,
      roundId,
      settings: {...HAJNALIG, turnSeconds: 90},
    })
    expect(after.rounds[0]).toMatchObject({turnSeconds: 90, deckSlug: 'hajnalig'})
    await expect(c.updateRound({gameId, roundId, settings: ROUND})).rejects.toMatchObject({
      message: 'The questions are fixed once a round starts.',
    })

    await c.endRound({gameId, roundId})
    await expect(c.updateRound({gameId, roundId, settings: HAJNALIG})).rejects.toMatchObject({
      message: 'That round is over.',
    })
  })

  it('ends a round by closing open turns at now or their deadline', async () => {
    const {caller, clock, mem, join, pair, turn} = setup()
    const c = caller()
    const {gameId, roundIds} = await opened(c)
    const roundId = roundIds[0]!
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
    const {gameId, roundIds} = await opened(c)
    const roundId = roundIds[0]!
    await c.startRound({gameId, roundId})
    const [a, b] = ['Anna', 'Bela'].map((n) => join(gameId, n))
    join(gameId, 'Cili', {email: 'cili@example.com', consentRecap: true})
    turn(pair(roundId, [a!.id, b!.id]).id, a!.id, '1', clock.now, null)
    mem.saved.push({playerId: b!.id, gameId})

    const detail = await c.detail({gameId})
    expect(detail.counts).toEqual({players: 3, pairs: 1, turnsInProgress: 1, responses: 1})
    expect(detail.room).toEqual({joined: 3, paired: 2, talking: 1, done: 0})
    expect(JSON.stringify(detail)).not.toContain('@')
  })

  it('removes a player, frees the stranded partner and keeps their turn in the round', async () => {
    const {caller, clock, mem, join, pair, turn} = setup()
    const c = caller()
    const {gameId, roundIds} = await opened(c)
    const roundId = roundIds[0]!
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
  const {gameId, roundIds} = await opened(c)
  const roundId = roundIds[0]!
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

const withGame = async () => {
  const t = setup()
  const c = t.caller()
  const {gameId} = await opened(c, 0)
  /** Saves as a host who just loaded the current list. */
  const save = async (questions: Array<{id?: string; en: string; hu?: string}>) => {
    const baseIds = (await c.detail({gameId})).questions.map((q) => q.id)
    return c.saveQuestions({gameId, questions, baseIds})
  }
  return {...t, c, gameId, save}
}

describe('custom questions and round plans', () => {
  it('hides the question list of a game the facilitator does not host', async () => {
    const {caller, theirs: gameId} = await twoGames()
    const call = caller('facilitator', 'u-avi').saveQuestions({
      gameId,
      questions: [{en: 'Mine now?'}],
      baseIds: [],
    })
    await expect(call).rejects.toMatchObject({code: 'NOT_FOUND'})
    expect((await caller('facilitator', 'u-tamas').detail({gameId})).questions).toEqual([])
  })

  it('adds, edits, reorders and removes questions under stable c: ids', async () => {
    const {save} = await withGame()
    const added = await save([{en: 'First?'}, {en: 'Second?', hu: 'Második?'}])
    const [first, second] = added.questions
    expect(first).toMatchObject({id: expect.stringMatching(/^c:[a-z0-9]+$/), en: 'First?'})
    expect(first).not.toHaveProperty('hu')
    expect(second).toMatchObject({en: 'Second?', hu: 'Második?', used: false})

    const edited = await save([
      {id: second!.id, en: 'Second, edited?'},
      {id: first!.id, en: 'First?'},
    ])
    expect(edited.questions.map((q) => [q.id, q.en])).toEqual([
      [second!.id, 'Second, edited?'],
      [first!.id, 'First?'],
    ])
    expect((await save([])).questions).toEqual([])
    await expect(save([{id: 'c:made0up', en: 'Sneaky?'}])).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('refuses a save made from a stale list, so two hosts never drop each other', async () => {
    const {c, gameId, save} = await withGame()
    const {questions} = await save([{en: 'Shared?'}])
    const loaded = questions.map((q) => q.id)
    await c.saveQuestions({gameId, questions: [...questions, {en: 'Host A?'}], baseIds: loaded})
    await expect(
      c.saveQuestions({gameId, questions: [...questions, {en: 'Host B?'}], baseIds: loaded})
    ).rejects.toMatchObject({code: 'CONFLICT', message: QUESTIONS_CONFLICT})
    expect((await c.detail({gameId})).questions.map((q) => q.en)).toEqual(['Shared?', 'Host A?'])
  })

  it('refuses to delete a question a round or a turn points at, but lets it be edited', async () => {
    const {c, gameId, join, pair, turn, save} = await withGame()
    const {questions} = await save([{en: 'A?'}, {en: 'B?'}])
    const [a, b] = questions.map((q) => q.id)
    const {rounds} = await c.addRound({
      gameId,
      settings: {...ROUND, questionPlan: {mode: 'same', question: a!}},
    })
    await expect(save([{id: b!, en: 'B?'}])).rejects.toMatchObject({
      message: 'A question already used in a round cannot be deleted.',
    })

    await c.updateRound({gameId, roundId: rounds[0]!.id, settings: ROUND})
    await c.startRound({gameId, roundId: rounds[0]!.id})
    const [x, y] = [join(gameId, 'Xena'), join(gameId, 'Yuri')]
    turn(pair(rounds[0]!.id, [x.id, y.id]).id, x.id, b!, T0, null)
    const detail = await c.detail({gameId})
    expect(detail.questions.map((q) => q.used)).toEqual([false, true])
    await expect(save([{id: a!, en: 'A?'}])).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    const edited = await save([{id: b!, en: 'B, better?'}])
    expect(edited.questions).toEqual([{id: b, en: 'B, better?', used: true}])
  })

  it('stores same and per-turn picks from any deck or the custom list', async () => {
    const {c, gameId, save} = await withGame()
    const {questions} = await save([{en: 'Mine?'}])
    const mine = questions[0]!.id
    const hajnalig = getDeck('hajnalig')!
    const ref = `hajnalig:${hajnalig.questionIds[0]}`
    await c.addRound({gameId, settings: {...ROUND, questionPlan: {mode: 'same', question: mine}}})
    const {rounds} = await c.addRound({
      gameId,
      settings: {...ROUND, questionPlan: {mode: 'per-turn', questions: [ref, mine]}},
    })
    expect(rounds.map((r) => [r.deckSlug, r.questionPlan.mode, r.picks])).toEqual([
      ['custom', 'same', ['Mine?']],
      ['hajnalig', 'per-turn', [hajnalig.questions[hajnalig.questionIds[0]!]?.en, 'Mine?']],
    ])
  })

  it('stores a physical-cards round with no deck and no picks, and starts it', async () => {
    const {c, gameId} = await withGame()
    const {rounds} = await c.addRound({
      gameId,
      settings: {...ROUND, questionPlan: {mode: 'physical'}},
    })
    expect(rounds.map((r) => [r.deckSlug, r.questionPlan.mode, r.picks])).toEqual([
      [PHYSICAL_SOURCE, 'physical', []],
    ])
    expect((await c.startRound({gameId, roundId: rounds[0]!.id})).liveRoundId).toBe(rounds[0]!.id)
  })

  it('rejects plans pointing at unknown decks or questions', async () => {
    const {c, gameId} = await withGame()
    const bad: QuestionPlan[] = [
      {mode: 'same', question: 'c:gone0000'},
      {mode: 'same', question: 'library:99999'},
      {mode: 'per-turn', questions: ['library:1', 'nope:1']},
      {mode: 'random', source: 'nope'},
    ]
    for (const questionPlan of bad) {
      await expect(c.addRound({gameId, settings: {...ROUND, questionPlan}})).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    }
  })

  it('lets a random-from-custom round wait for questions, but not start without one', async () => {
    const {c, gameId, save} = await withGame()
    const {rounds} = await c.addRound({
      gameId,
      settings: {...ROUND, questionPlan: random('custom')},
    })
    const roundId = rounds[0]!.id
    expect(rounds[0]?.deckSlug).toBe('custom')
    await expect(c.startRound({gameId, roundId})).rejects.toMatchObject({
      message: 'Add a custom question before starting this round.',
    })
    await save([{en: 'Ready?'}])
    expect((await c.startRound({gameId, roundId})).liveRoundId).toBe(roundId)
    await expect(save([])).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})

describe('standby facilitators', () => {
  it('mints the standby key once and keeps standby players out of the joined count', async () => {
    const {caller, mem, join} = setup()
    const c = caller()
    const {gameId} = await opened(c)
    expect((await c.detail({gameId})).game.standbyKey).toBeNull()
    const key = (await c.enableStandby({gameId})).game.standbyKey
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect((await c.enableStandby({gameId})).game.standbyKey).toBe(key)

    join(gameId, 'Anna')
    const fac = join(gameId, 'Fac')
    const g = mem.games.find((x) => x.id === gameId)!
    g.settings = {...g.settings, standby: [fac.id]}
    const detail = await c.detail({gameId})
    expect(detail.counts.players).toBe(1)
    expect(detail.players.map((p) => [p.name, p.standby])).toEqual([
      ['Anna', false],
      ['Fac', true],
    ])
  })
})

describe('answer mode', () => {
  it('defaults to Voice, is set on a draft, switches live, and freezes once ended', async () => {
    const {caller} = setup()
    const c = caller()
    const {id: gameId} = await c.create(GAME)
    expect((await c.detail({gameId})).game.answerMode).toBe('voice')
    expect((await c.setAnswerMode({gameId, mode: 'none'})).game.answerMode).toBe('none')
    await c.goLive({gameId})
    expect((await c.setAnswerMode({gameId, mode: 'type'})).game.answerMode).toBe('type')
    await c.endGame({gameId})
    await expect(c.setAnswerMode({gameId, mode: 'voice'})).rejects.toMatchObject({
      message: 'The game is over.',
    })
  })

  it('logs each switch with its time, so open turns keep the mode they were claimed in', async () => {
    const {c, gameId, mem, clock} = await played()
    await c.setAnswerMode({gameId, mode: 'type'})
    await c.setAnswerMode({gameId, mode: 'type'})
    const settings = mem.games.find((g) => g.id === gameId)?.settings
    expect(settings?.answerModes).toEqual([{mode: 'type', at: clock.now}])
  })
})

describe('endGame', () => {
  it('ends the live round and the game without mailing anyone', async () => {
    const {c, gameId, sendRecaps, mem} = await played()
    const detail = await c.endGame({gameId})

    expect(detail.game.status).toBe('ended')
    expect(detail.rounds[0]?.status).toBe('done')
    expect(mem.turns.every((t) => t.finishedAt !== null)).toBe(true)
    expect(sendRecaps).not.toHaveBeenCalled()
    expect(detail.game.recap).toBeNull()
    expect((await c.endGame({gameId})).game.status).toBe('ended')
  })

  it('ends a draft that never went live', async () => {
    const {caller} = setup()
    const {id: gameId} = await caller().create(GAME)
    expect((await caller().endGame({gameId})).game.status).toBe('ended')
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

describe('recap preview and send', () => {
  it('previews a real recipient once the game has ended', async () => {
    const {c, gameId} = await played()
    await expect(c.recapPreview({gameId})).rejects.toMatchObject({message: 'End the game first.'})
    await c.endGame({gameId})
    expect(await c.recapPreview({gameId})).toEqual({
      recipients: 1,
      sample: false,
      html: '<p>Anna · SDD Conf</p>',
    })
  })

  it('previews a sample when nobody asked for a recap, and has nothing to send', async () => {
    const {caller, sendRecaps} = setup()
    const c = caller()
    const {id: gameId} = await c.create(GAME)
    await c.endGame({gameId})
    expect(await c.recapPreview({gameId})).toMatchObject({recipients: 0, sample: true})
    await expect(c.sendRecaps({gameId})).rejects.toMatchObject({
      message: 'Nobody asked for a recap.',
    })
    expect(sendRecaps).not.toHaveBeenCalled()
  })

  it('mails only consenting players with an email, once, even when two hosts press Send', async () => {
    const {c, caller, gameId, sendRecaps} = await played()
    await expect(c.sendRecaps({gameId})).rejects.toMatchObject({message: 'End the game first.'})
    await c.endGame({gameId})

    const [first, second] = await Promise.all([
      caller('facilitator', 'u-avi').sendRecaps({gameId}),
      caller('admin', 'u-boss').sendRecaps({gameId}),
    ])
    expect(sendRecaps).toHaveBeenCalledTimes(1)
    const [recaps] = vi.mocked(sendRecaps).mock.calls[0]!
    expect(recaps.map((r) => r.to)).toEqual(['anna@example.com'])
    expect(recaps[0]?.props).toMatchObject({
      eventTitle: 'SDD',
      organizer: 'SDD Conf',
      you: {peopleMet: 1, turns: 1, minutes: 1, savedAnswers: 0},
    })
    const done = {sentAt: expect.any(Number), sent: 1, failed: 0, error: null, pending: false}
    expect(first.game.recap).toEqual(done)
    // The loser of the claim sees the send in flight, or done.
    expect(second.game.recap).toMatchObject({sentAt: expect.any(Number)})
    expect((await c.detail({gameId})).game.recap).toEqual(done)
    await c.sendRecaps({gameId})
    expect(sendRecaps).toHaveBeenCalledTimes(1)
  })

  it('records a failed send instead of losing it', async () => {
    const {c, gameId} = await played(async () => {
      throw new Error('resend down')
    })
    await c.endGame({gameId})
    const detail = await c.sendRecaps({gameId})
    expect(detail.game.recap).toMatchObject({
      sent: 0,
      failed: 1,
      error: 'resend down',
      pending: false,
    })
  })

  it('retries a send that delivered nothing, then never sends again', async () => {
    let down = true
    const send = vi.fn<SendRecaps>(async (r) => {
      if (down) throw new Error('resend down')
      return {sent: r.length, failed: 0, error: null}
    })
    const {c, gameId} = await played(send)
    await c.endGame({gameId})
    await c.sendRecaps({gameId})
    down = false
    const retried = await c.sendRecaps({gameId})
    expect(retried.game.recap).toMatchObject({sent: 1, failed: 0, error: null, pending: false})
    await c.sendRecaps({gameId})
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('revisit email preview and send', () => {
  it('previews a real recipient with their questions once the game has ended', async () => {
    const {c, gameId} = await played()
    await expect(c.revisitPreview({gameId})).rejects.toMatchObject({
      message: 'End the game first.',
    })
    await c.endGame({gameId})
    expect(await c.revisitPreview({gameId})).toEqual({
      recipients: 1,
      sample: false,
      html: `<p>Anna: ${getDeck('library')!.questions['1']?.en}</p>`,
    })
  })

  it('has nobody to send to when nobody asked for email', async () => {
    const {caller, sendRevisits} = setup()
    const c = caller()
    const {id: gameId} = await c.create(GAME)
    await c.endGame({gameId})
    expect(await c.revisitPreview({gameId})).toMatchObject({recipients: 0, sample: true})
    await expect(c.sendRevisits({gameId})).rejects.toMatchObject({
      message: 'Nobody to send it to.',
    })
    expect(sendRevisits).not.toHaveBeenCalled()
  })

  it('sends once, apart from the recap, even when two hosts press Send', async () => {
    const {c, caller, gameId, sendRecaps, sendRevisits} = await played()
    await expect(c.sendRevisits({gameId})).rejects.toMatchObject({message: 'End the game first.'})
    await c.endGame({gameId})
    await c.sendRecaps({gameId})

    await Promise.all([
      caller('facilitator', 'u-avi').sendRevisits({gameId}),
      caller('admin', 'u-boss').sendRevisits({gameId}),
    ])
    await c.sendRevisits({gameId})
    expect(sendRevisits).toHaveBeenCalledTimes(1)
    expect(sendRecaps).toHaveBeenCalledTimes(1)
    const [revisits] = vi.mocked(sendRevisits).mock.calls[0]!
    expect(revisits.map((r) => r.to)).toEqual(['anna@example.com'])
    const {game} = await c.detail({gameId})
    const done = {sentAt: expect.any(Number), sent: 1, failed: 0, error: null, pending: false}
    expect(game.revisit).toEqual(done)
    expect(game.recap).toEqual(done)
  })

  it('records a failed send and retries it once, then never sends again', async () => {
    let down = true
    const send = vi.fn<SendRevisits>(async (r) => {
      if (down) throw new Error('resend down')
      return {sent: r.length, failed: 0, error: null}
    })
    const t = setup(undefined, send)
    const c = t.caller()
    const {gameId, roundIds} = await opened(c)
    await c.startRound({gameId, roundId: roundIds[0]!})
    const anna = t.join(gameId, 'Anna', {email: 'anna@example.com', consentRecap: true})
    const bela = t.join(gameId, 'Bela')
    t.turn(t.pair(roundIds[0]!, [anna.id, bela.id]).id, anna.id, '1', T0, T0 + 60_000)
    await c.endGame({gameId})

    const failed = await c.sendRevisits({gameId})
    expect(failed.game.revisit).toMatchObject({sent: 0, failed: 1, error: 'resend down'})
    expect(failed.game.recap).toBeNull()
    down = false
    expect((await c.sendRevisits({gameId})).game.revisit).toMatchObject({sent: 1, error: null})
    await c.sendRevisits({gameId})
    expect(send).toHaveBeenCalledTimes(2)
  })
})

const round = (id: string, n: number, deckSlug: string): Round => ({
  id,
  gameId: 'g',
  n,
  deckSlug,
  questionPlan: null,
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
  joinedAt: 0,
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
        questionVote: null,
      },
      {
        id: 't2',
        pairId: 'p1',
        roundId: 'r1',
        playerId: 'b',
        questionId: '2',
        startedAt: T0,
        finishedAt: T0 + 30_000,
        questionVote: null,
      },
      {
        id: 't3',
        pairId: 'p2',
        roundId: 'r2',
        playerId: 'a',
        questionId: '3',
        startedAt: T0,
        finishedAt: null,
        questionVote: null,
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
    expect(anna?.props).toMatchObject({eventTitle: 'SDD', organizer: null})
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

  it('still recaps a player who saved nothing, listing the questions they answered', () => {
    const recaps = buildRecaps({snapshot: snapshot(), savedByPlayer: {}, now: T0, random: () => 0})
    const deck = getDeck('hajnalig')!
    expect(recaps.map((r) => r.to)).toEqual(['a@example.com', 'b@example.com', 'c@example.com'])
    expect(recaps[0]?.props.asked).toEqual([deck.questions['1']?.hu, deck.questions['3']?.hu])
    expect(recaps[1]?.props).toMatchObject({
      asked: [deck.questions['2']?.en],
      you: {savedAnswers: 0},
      myAnswersUrl: 'https://whocards.cc/events/sdd-2026/me?code=K7QM2',
    })
    expect(recaps[2]?.props.asked).toEqual([])
  })

  it('skips standby facilitators as recipients and leaves them out of the room counts', () => {
    const base = snapshot()
    const recaps = buildRecaps({
      snapshot: {...base, game: {...base.game, settings: {round: {}, standby: ['a']}}},
      savedByPlayer: {},
      now: T0,
      random: () => 0,
    })
    expect(recaps.map((r) => r.to)).toEqual(['b@example.com', 'c@example.com'])
    expect(recaps[0]?.props.event).toMatchObject({players: 2, languages: 1})
  })

  it('previews the room for a sample player when nobody asked for a recap', () => {
    const quiet = {...snapshot(), players: snapshot().players.map((p) => ({...p, email: null}))}
    const preview = previewRecap({snapshot: quiet, savedByPlayer: {}, now: T0, random: () => 0})
    expect(preview).toMatchObject({recipients: 0, sample: true, props: {name: 'Sample player'}})
    expect(preview.props.event.players).toBe(3)
    expect(preview.props.you).toEqual({peopleMet: 0, turns: 0, minutes: 0, savedAnswers: 0})
  })

  it('takes home an undrawn custom question from a custom round', () => {
    const base = snapshot()
    const [anna] = buildRecaps({
      snapshot: {
        ...base,
        game: {
          ...base.game,
          settings: {
            round: {},
            questions: [
              {id: 'c:aaaa', en: 'A?', hu: 'Á?'},
              {id: 'c:bbbb', en: 'B?', hu: 'B, magyarul?'},
            ],
          },
        },
        rounds: [{...round('r1', 1, 'custom'), questionPlan: random('custom')}],
        pairs: [{id: 'p1', roundId: 'r1', playerIds: ['a', 'b']}],
        turns: base.turns.slice(0, 1).map((t) => ({...t, questionId: 'c:aaaa'})),
      },
      savedByPlayer: {},
      now: T0,
      random: () => 0,
    })
    expect(anna?.props.question).toBe('B, magyarul?')
  })

  it('leaves physical-card turns out of the asked list and the question to take home', () => {
    const base = snapshot()
    const physicalRound = {
      ...round('r2', 2, PHYSICAL_SOURCE),
      questionPlan: {mode: 'physical'} as const,
    }
    const [anna] = buildRecaps({
      snapshot: {
        ...base,
        rounds: [base.rounds[0]!, physicalRound],
        turns: base.turns.map((t) =>
          t.id === 't3' ? {...t, questionId: PHYSICAL_QUESTION_ID} : t
        ),
      },
      savedByPlayer: {},
      now: T0,
      random: () => 0,
    })
    const deck = getDeck('hajnalig')!
    expect(anna?.props.you.turns).toBe(2)
    expect(anna?.props.asked).toEqual([deck.questions['1']?.hu])
    const firstUndrawn = deck.questionIds.find((id) => id !== '1')!
    expect(anna?.props.question).toBe(deck.questions[firstUndrawn]?.hu)
  })

  it('previews with a question from the custom list too', () => {
    const base = snapshot()
    const preview = previewRecap({
      snapshot: {
        ...base,
        game: {...base.game, settings: {round: {}, questions: [{id: 'c:aaaa', en: 'A?'}]}},
        players: [],
        rounds: [{...round('r1', 1, 'custom'), questionPlan: random('custom')}],
        pairs: [],
        turns: [],
      },
      savedByPlayer: {},
      now: T0,
      random: () => 0,
    })
    expect(preview).toMatchObject({sample: true, props: {question: 'A?'}})
  })

  it('reads back a stored recap state, older ones as done, and ignores anything else', () => {
    expect(readSendState({round: {}}, 'recap')).toBeNull()
    expect(
      readSendState({round: {}, recap: {sentAt: 1, sent: 2, failed: 0, error: null}}, 'recap')
    ).toEqual({sentAt: 1, sent: 2, failed: 0, error: null, pending: false})
  })
})

describe('buildRevisits', () => {
  const deck = getDeck('hajnalig')!

  it('sends each consenting player their own answered questions, in their language, with card links', () => {
    const revisits = buildRevisits(snapshot())
    expect(revisits.map((r) => r.to)).toEqual(['a@example.com', 'b@example.com'])
    expect(revisits[0]?.props).toEqual({
      name: 'a',
      eventTitle: 'SDD',
      organizer: null,
      questions: [
        {text: deck.questions['1']?.hu, url: 'https://whocards.cc/play/hajnalig?lang=hu&q=1'},
        {text: deck.questions['3']?.hu, url: 'https://whocards.cc/play/hajnalig?lang=hu&q=3'},
      ],
      playUrl: 'https://whocards.cc/play',
      appUrl: 'https://whocards.cc/app',
    })
  })

  it('skips standby facilitators, players without consent or email, and anyone who answered nothing', () => {
    const base = snapshot()
    const revisits = buildRevisits({
      ...base,
      game: {...base.game, settings: {round: {}, standby: ['a']}},
      players: base.players.map((p) => (p.id === 'b' ? {...p, consentRecap: false} : p)),
    })
    expect(revisits).toEqual([])
    const noEmail = buildRevisits({
      ...base,
      players: base.players.map((p) => (p.id === 'a' ? {...p, email: null} : p)),
    })
    expect(noEmail.map((r) => r.to)).toEqual(['b@example.com'])
  })

  it('lists a custom question without a link, since it has no card on the website', () => {
    const base = snapshot()
    const [anna] = buildRevisits({
      ...base,
      game: {...base.game, settings: {round: {}, questions: [{id: 'c:aaaa', en: 'A?', hu: 'Á?'}]}},
      turns: base.turns.map((t) => (t.id === 't1' ? {...t, questionId: 'c:aaaa'} : t)),
    })
    expect(anna?.props.questions[0]).toEqual({text: 'Á?', url: null})
  })

  it('links the library deck at /play, falling back to English where the deck has no translation', () => {
    const sources = {custom: [], decks: getDeck}
    expect(questionUrl('library:1', 'en', sources)).toBe('https://whocards.cc/play?lang=en&q=1')
    expect(questionUrl('nope:1', 'en', sources)).toBeNull()
    const only = {custom: [], decks: () => ({questionIds: ['x'], questions: {x: {en: 'X?'}}})}
    expect(questionUrl('d:x', 'hu', only)).toBe('https://whocards.cc/play/d?lang=en&q=x')
  })

  it("previews a sample with the room's first questions when nobody gets the email", () => {
    const quiet = {...snapshot(), players: snapshot().players.map((p) => ({...p, email: null}))}
    expect(previewRevisit(quiet)).toMatchObject({
      recipients: 0,
      sample: true,
      props: {
        name: 'Sample player',
        questions: ['1', '2', '3'].map((id) => ({text: deck.questions[id]?.en})),
      },
    })
  })
})

describe('copy and delete a game', () => {
  it('copies the workshop design into a fresh draft, never the play', async () => {
    const t = await played()
    const {c, gameId, mem} = t
    await c.saveQuestions({gameId, questions: [{en: 'Ours?', hu: 'Mienk?'}], baseIds: []})
    await c.addRound({
      gameId,
      settings: {
        questionPlan: {mode: 'same', question: 'library:1'},
        turnSeconds: 90,
        oddRule: 'sitout',
        overtime: 'hard',
        overtimeSeconds: 15,
      },
    })
    await c.setAnswerMode({gameId, mode: 'type'})
    await c.setAnswerMode({gameId, mode: 'none'})
    await c.enableStandby({gameId})
    await c.setFacilitator({gameId, userId: 'u-tamas', on: true})
    await c.endGame({gameId})
    await c.sendRecaps({gameId})

    const copy = await c.copyGame({gameId})
    expect(copy).toMatchObject({title: 'SDD (copy)', status: 'lobby'})
    expect(copy.code).not.toBe(mem.games[0]?.code)
    expect(copy.settings).toEqual({
      round: {},
      organizer: 'SDD Conf',
      questions: [expect.objectContaining({en: 'Ours?', hu: 'Mienk?'})],
      answerModes: [{mode: 'none', at: 0}],
    })

    const detail = await c.detail({gameId: copy.id})
    expect(detail.players).toEqual([])
    expect(detail.counts).toEqual({players: 0, pairs: 0, turnsInProgress: 0, responses: 0})
    expect(detail.game).toMatchObject({
      createdBy: 'Avi',
      facilitators: [{id: 'u-tamas', label: 'Tamas'}],
      answerMode: 'none',
      recap: null,
      standbyKey: null,
    })
    expect(detail.rounds.map((r) => [r.n, r.status, r.startedAt, r.pairs, r.turns])).toEqual([
      [1, 'pending', null, 0, 0],
      [2, 'pending', null, 0, 0],
    ])
    expect(detail.rounds[1]).toMatchObject({
      questionPlan: {mode: 'same', question: 'library:1'},
      turnSeconds: 90,
      oddRule: 'sitout',
      overtime: 'hard',
      overtimeSeconds: 15,
    })
    // The original is untouched.
    expect((await c.detail({gameId})).players).toHaveLength(3)
  })

  it('lets a co-facilitator copy, keeping the creator on as co-host, but not delete', async () => {
    const {caller, mine: gameId} = await twoGames()
    await caller('facilitator', 'u-avi').setFacilitator({gameId, userId: 'u-tamas', on: true})
    const tamas = caller('facilitator', 'u-tamas')
    const copy = await tamas.copyGame({gameId})
    const detail = await tamas.detail({gameId: copy.id})
    expect(detail.game).toMatchObject({
      title: 'Mine (copy)',
      canManageHosts: true,
      facilitators: [{id: 'u-avi', label: 'Avi'}],
    })
    await expect(tamas.deleteGame({gameId})).rejects.toMatchObject({code: 'FORBIDDEN'})
    const list = await tamas.list()
    expect(list.map((g) => [g.title, g.canManage])).toEqual([
      ['Mine (copy)', true],
      ['Theirs', true],
      ['Mine', false],
    ])
  })

  it('caps the copied title at the editable length', async () => {
    const {caller} = setup()
    const c = caller()
    const {id: gameId} = await c.create({title: 'x'.repeat(80), organizer: 'A'})
    const copy = await c.copyGame({gameId})
    expect(copy.title).toHaveLength(80)
    expect(copy.title.endsWith(' (copy)')).toBe(true)
  })

  it('refuses to delete a live game, then deletes it and everything under it once ended', async () => {
    const {c, gameId, mem} = await played()
    await expect(c.deleteGame({gameId})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'End the game first.',
    })
    await c.endGame({gameId})
    expect(await c.deleteGame({gameId})).toEqual({deleted: true})
    expect(mem).toMatchObject({games: [], players: [], rounds: [], pairs: [], turns: []})
    await expect(c.detail({gameId})).rejects.toMatchObject({code: 'NOT_FOUND'})
  })

  it('says a game deleted meanwhile is gone, not live', async () => {
    const {c, gameId} = await played()
    await c.endGame({gameId})
    const [first, second] = await Promise.allSettled([
      c.deleteGame({gameId}),
      c.deleteGame({gameId}),
    ])
    expect(first).toMatchObject({status: 'fulfilled', value: {deleted: true}})
    expect(second).toMatchObject({status: 'rejected', reason: {code: 'NOT_FOUND'}})
  })

  it('deletes a draft, and lets admins delete anyone’s game', async () => {
    const {caller, mine, theirs} = await twoGames()
    expect(await caller('facilitator', 'u-avi').deleteGame({gameId: mine})).toEqual({
      deleted: true,
    })
    expect(await caller('admin', 'u-boss').deleteGame({gameId: theirs})).toEqual({deleted: true})
    expect(await caller('owner', 'u-own').list()).toEqual([])
  })
})
