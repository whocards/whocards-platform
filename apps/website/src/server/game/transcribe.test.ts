import type {
  GameSnapshot,
  GameStatus,
  Player,
  ResponseRecord,
  RoundStatus,
  Turn,
} from '@whocards/game'
import {describe, expect, it, vi} from 'vitest'
import {createOpenAiTranscriber, fakeTranscriber, handleAnswerUpload} from './transcribe'
import type {AnswerUploadDeps, ServerTranscriber} from './transcribe'

const player: Player = {
  id: 'p1',
  gameId: 'g1',
  name: 'Ann',
  language: 'en',
  pairCode: 'ABCD',
  email: null,
  consentTranscript: true,
  consentRecap: false,
}

const NOW = 1_000_000

const myTurn: Turn = {
  id: 't1',
  pairId: 'pair1',
  roundId: 'r1',
  playerId: 'p1',
  questionId: '1',
  startedAt: NOW - 10_000,
  finishedAt: null,
  questionVote: null,
}

const snapshot = (
  game: GameStatus,
  round: RoundStatus,
  turns: Turn[] = [myTurn]
): GameSnapshot => ({
  game: {id: 'g1', code: 'WORK', title: 'Workshop', status: game, settings: {round: {}}},
  players: [player],
  rounds: [
    {
      id: 'r1',
      gameId: 'g1',
      n: 1,
      deckSlug: 'library',
      questionPlan: null,
      turnSeconds: 60,
      oddRule: 'trio',
      overtime: 'nudge',
      overtimeSeconds: 30,
      status: round,
      startedAt: 0,
      endsAt: null,
    },
  ],
  pairs: [],
  turns,
})

type Game = AnswerUploadDeps['game']

const deps = (
  overrides: Pick<Partial<AnswerUploadDeps>, 'transcriber'> = {},
  state = snapshot('live', 'live')
) => {
  const claimed = new Set<string>()
  const responses: ResponseRecord[] = []
  const game = {
    now: () => NOW,
    findPlayerByToken: async (token: string) => (token === 'good' ? player : null),
    loadSnapshot: async () => state,
    claimTranscription: vi.fn<Game['claimTranscription']>(
      async (turnId) => !claimed.has(turnId) && !!claimed.add(turnId)
    ),
    releaseTranscription: async (turnId: string) => void claimed.delete(turnId),
    listResponses: async () => responses,
    finishTurn: vi.fn<Game['finishTurn']>(async () => undefined),
    saveResponse: vi.fn<Game['saveResponse']>(async (input) => {
      responses.push({...input, id: `res-${input.turnId}`, questionId: '1', createdAt: NOW})
    }),
  } satisfies Game
  return {game, transcriber: vi.fn<ServerTranscriber>(fakeTranscriber), responses, ...overrides}
}

const post = (fields: {audio?: Blob; token?: string; turnId?: string; durationMs?: string}) => {
  const form = new FormData()
  if (fields.audio) form.set('audio', fields.audio, 'answer.webm')
  for (const key of ['token', 'turnId', 'durationMs'] as const) {
    const value = fields[key]
    if (value !== undefined) form.set(key, value)
  }
  return new Request('http://localhost/api/game/answer', {method: 'POST', body: form})
}

const audio = new Blob([new Uint8Array(512)], {type: 'audio/webm'})
const valid = {audio, token: 'good', turnId: 't1', durationMs: '12345'}

describe('handleAnswerUpload', () => {
  it("transcribes in the player's language and saves it as the turn's answer, finishing the turn", async () => {
    const d = deps()
    const res = await handleAnswerUpload(post(valid), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({saved: true})
    expect(d.transcriber).toHaveBeenCalledWith(expect.any(Blob), 'en')
    expect(d.game.finishTurn).toHaveBeenCalledWith({turnId: 't1', finishedAt: NOW})
    expect(d.game.saveResponse).toHaveBeenCalledWith({
      turnId: 't1',
      playerId: 'p1',
      language: 'en',
      transcript: '[fake en transcript of 512 bytes]',
      durationMs: 12_345,
    })
  })

  it('rejects missing fields and empty audio', async () => {
    for (const bad of [
      {...valid, audio: undefined},
      {...valid, turnId: undefined},
      {...valid, durationMs: '-1'},
      {...valid, audio: new Blob([])},
    ]) {
      expect((await handleAnswerUpload(post(bad), deps())).status).toBe(400)
    }
  })

  it('rejects an unknown token', async () => {
    expect((await handleAnswerUpload(post({...valid, token: 'bad'}), deps())).status).toBe(401)
  })

  it('saves a late upload after the host ended the round or game, without reopening the turn', async () => {
    const finished = [{...myTurn, finishedAt: NOW - 3_600_000}]
    for (const state of [snapshot('live', 'done', finished), snapshot('ended', 'done', finished)]) {
      const d = deps({}, state)
      expect((await handleAnswerUpload(post(valid), d)).status).toBe(200)
      expect(d.game.finishTurn).not.toHaveBeenCalled()
      expect(d.responses).toHaveLength(1)
    }
  })

  it("rejects a turn that isn't mine or doesn't exist", async () => {
    for (const turns of [[], [{...myTurn, playerId: 'p2'}]]) {
      const d = deps({}, snapshot('live', 'live', turns))
      expect((await handleAnswerUpload(post(valid), d)).status).toBe(404)
      expect(d.transcriber).not.toHaveBeenCalled()
    }
  })

  it('rejects a player who chose to play without saving answers', async () => {
    const d = deps()
    d.game.findPlayerByToken = async () => ({...player, consentTranscript: false})
    expect((await handleAnswerUpload(post(valid), d)).status).toBe(403)
    expect(d.transcriber).not.toHaveBeenCalled()
  })

  it('rejects a turn claimed in Type or None mode, even after a switch back to Voice', async () => {
    const state = snapshot('live', 'live')
    state.game.settings.answerModes = [
      {mode: 'type', at: 0},
      {mode: 'voice', at: myTurn.startedAt + 1},
    ]
    const d = deps({}, state)
    expect((await handleAnswerUpload(post(valid), d)).status).toBe(422)
    expect(d.transcriber).not.toHaveBeenCalled()
  })

  it('rejects oversized uploads before reading them', async () => {
    const request = new Request('http://localhost/api/game/answer', {
      method: 'POST',
      headers: {'content-length': String(30 * 1024 * 1024)},
      body: 'x',
    })
    expect((await handleAnswerUpload(request, deps())).status).toBe(413)
  })

  it('answers 503 when transcription is not configured', async () => {
    expect((await handleAnswerUpload(post(valid), deps({transcriber: null}))).status).toBe(503)
  })

  it('answers a repeat upload of a saved turn with success, transcribing only once', async () => {
    const d = deps()
    expect((await handleAnswerUpload(post(valid), d)).status).toBe(200)
    const again = await handleAnswerUpload(post(valid), d)
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({saved: true})
    expect(d.transcriber).toHaveBeenCalledOnce()
    expect(d.responses).toHaveLength(1)
  })

  it('answers 409 while another upload of the turn is in flight', async () => {
    const d = deps()
    d.game.claimTranscription.mockResolvedValueOnce(false)
    expect((await handleAnswerUpload(post(valid), d)).status).toBe(409)
    expect(d.transcriber).not.toHaveBeenCalled()
  })

  it('answers 502 when the transcriber fails, and lets the retry through', async () => {
    const transcriber = vi
      .fn<ServerTranscriber>(fakeTranscriber)
      .mockRejectedValueOnce(new Error('upstream down'))
    const d = deps({transcriber})
    expect((await handleAnswerUpload(post(valid), d)).status).toBe(502)
    expect((await handleAnswerUpload(post(valid), d)).status).toBe(200)
  })

  it('releases the claim when saving fails, so the retry can transcribe again', async () => {
    const d = deps()
    d.game.saveResponse.mockRejectedValueOnce(new Error('db down'))
    expect((await handleAnswerUpload(post(valid), d)).status).toBe(500)
    expect((await handleAnswerUpload(post(valid), d)).status).toBe(200)
    expect(d.responses).toHaveLength(1)
  })

  it('saves nothing for a silent take', async () => {
    const d = deps({transcriber: async () => ({text: '  ', language: 'en', model: 'fake'})})
    const res = await handleAnswerUpload(post(valid), d)
    expect(await res.json()).toEqual({saved: false})
    expect(d.responses).toEqual([])
  })
})

describe('createOpenAiTranscriber', () => {
  it('posts the audio to gpt-4o-mini-transcribe in the chosen language', async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      Response.json({text: 'Szia'})
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      const transcript = await createOpenAiTranscriber('sk-test')(audio, 'hu')
      expect(transcript).toEqual({text: 'Szia', language: 'hu', model: 'gpt-4o-mini-transcribe'})
      const [url, init] = fetchMock.mock.calls[0] ?? []
      expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
      expect(init?.headers).toEqual({Authorization: 'Bearer sk-test'})
      const body = init?.body
      expect(body).toBeInstanceOf(FormData)
      if (!(body instanceof FormData)) return
      expect(body.get('model')).toBe('gpt-4o-mini-transcribe')
      expect(body.get('language')).toBe('hu')
      const file = body.get('file')
      expect(file instanceof File && file.name).toBe('answer.webm')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
