import {UPLOAD_GRACE_MS} from '@whocards/game'
import type {GameSnapshot, GameStatus, Player, RoundStatus, Turn} from '@whocards/game'
import {describe, expect, it, vi} from 'vitest'
import {createOpenAiTranscriber, fakeTranscriber, handleTranscribe} from './transcribe'
import type {ServerTranscriber, TranscribeDeps} from './transcribe'

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

const deps = (overrides: Partial<TranscribeDeps> = {}, state = snapshot('live', 'live')) => {
  const claimed = new Set<string>()
  return {
    game: {
      now: () => NOW,
      findPlayerByToken: async (token: string) => (token === 'good' ? player : null),
      loadSnapshot: async () => state,
      claimTranscription: async (turnId: string) => !claimed.has(turnId) && !!claimed.add(turnId),
      releaseTranscription: async (turnId: string) => void claimed.delete(turnId),
    },
    transcriber: vi.fn<ServerTranscriber>(fakeTranscriber),
    ...overrides,
  }
}

const post = (fields: {audio?: Blob; token?: string; language?: string}) => {
  const form = new FormData()
  if (fields.audio) form.set('audio', fields.audio, 'answer.webm')
  if (fields.token) form.set('token', fields.token)
  if (fields.language) form.set('language', fields.language)
  return new Request('http://localhost/api/game/transcribe', {method: 'POST', body: form})
}

const audio = new Blob([new Uint8Array(512)], {type: 'audio/webm'})
const valid = {audio, token: 'good', language: 'hu'}

describe('handleTranscribe', () => {
  it('returns the transcript for a player with a running turn', async () => {
    const d = deps()
    const res = await handleTranscribe(post(valid), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      text: '[fake hu transcript of 512 bytes]',
      language: 'hu',
      model: 'fake',
    })
    expect(d.transcriber).toHaveBeenCalledOnce()
  })

  it('rejects missing fields and empty audio', async () => {
    expect((await handleTranscribe(post({...valid, audio: undefined}), deps())).status).toBe(400)
    expect((await handleTranscribe(post({...valid, language: 'de'}), deps())).status).toBe(400)
    expect((await handleTranscribe(post({...valid, audio: new Blob([])}), deps())).status).toBe(400)
  })

  it('rejects an unknown token', async () => {
    expect((await handleTranscribe(post({...valid, token: 'bad'}), deps())).status).toBe(401)
  })

  it('accepts a late upload after the host ended the round or game', async () => {
    const finished = [{...myTurn, finishedAt: NOW - UPLOAD_GRACE_MS}]
    for (const state of [snapshot('live', 'done', finished), snapshot('ended', 'done', finished)]) {
      expect((await handleTranscribe(post(valid), deps({}, state))).status).toBe(200)
    }
  })

  it('rejects a player with no turn of their own, or one that ended too long ago', async () => {
    const stale = [{...myTurn, finishedAt: NOW - UPLOAD_GRACE_MS - 1}]
    const partners = [{...myTurn, playerId: 'p2'}]
    for (const turns of [[], stale, partners]) {
      const d = deps({}, snapshot('live', 'live', turns))
      expect((await handleTranscribe(post(valid), d)).status).toBe(409)
      expect(d.transcriber).not.toHaveBeenCalled()
    }
  })

  it('rejects a turn claimed in Type or None mode, even after a switch back to Voice', async () => {
    const state = snapshot('live', 'live')
    state.game.settings.answerModes = [
      {mode: 'type', at: 0},
      {mode: 'voice', at: myTurn.startedAt + 1},
    ]
    const d = deps({}, state)
    expect((await handleTranscribe(post(valid), d)).status).toBe(409)
    expect(d.transcriber).not.toHaveBeenCalled()
  })

  it('rejects oversized uploads before reading them', async () => {
    const request = new Request('http://localhost/api/game/transcribe', {
      method: 'POST',
      headers: {'content-length': String(30 * 1024 * 1024)},
      body: 'x',
    })
    expect((await handleTranscribe(request, deps())).status).toBe(413)
  })

  it('answers 503 when transcription is not configured', async () => {
    expect((await handleTranscribe(post(valid), deps({transcriber: null}))).status).toBe(503)
  })

  it('refuses a second transcription of the same turn', async () => {
    const d = deps()
    expect((await handleTranscribe(post(valid), d)).status).toBe(200)
    expect((await handleTranscribe(post(valid), d)).status).toBe(409)
    expect(d.transcriber).toHaveBeenCalledOnce()
  })

  it('answers 502 when the transcriber fails, and lets the player retry', async () => {
    const transcriber = vi
      .fn<ServerTranscriber>(fakeTranscriber)
      .mockRejectedValueOnce(new Error('upstream down'))
    const d = deps({transcriber})
    expect((await handleTranscribe(post(valid), d)).status).toBe(502)
    expect((await handleTranscribe(post(valid), d)).status).toBe(200)
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
