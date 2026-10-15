import type {GamePort} from '@whocards/api'
import {saveAnswer} from '@whocards/api'
import {logError} from '@whocards/observability'
import {
  answerModeAt,
  answerUploadFieldsSchema,
  MAX_AUDIO_BYTES,
  MAX_TRANSCRIPT_CHARS,
  transcriptSchema,
} from '@whocards/game'
import type {AnswerUploadResult, GameLanguage, Transcript} from '@whocards/game'
import {z} from 'zod'

export const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'
const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions'
const OPENAI_TIMEOUT_MS = 25_000
// Multipart framing and the text fields ride on top of the audio itself.
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 1024 * 1024

/** Server-side speech-to-text; the audio is passed through and never stored. */
export type ServerTranscriber = (audio: Blob, language: GameLanguage) => Promise<Transcript>

export type AnswerUploadDeps = {
  game: Pick<
    GamePort,
    | 'now'
    | 'findPlayerByToken'
    | 'loadSnapshot'
    | 'claimTranscription'
    | 'releaseTranscription'
    | 'listResponses'
    | 'finishTurn'
    | 'saveResponse'
  >
  transcriber: ServerTranscriber | null
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

const fail = (status: number, error: string) => json({error}, status)

const done = (result: AnswerUploadResult) => json(result, 200)

const extensionFor = (mimeType: string) => {
  const subtype = mimeType.split(';')[0]?.split('/')[1] ?? ''
  if (subtype === 'mpeg') return 'mp3'
  if (subtype === 'x-m4a' || subtype === 'aac') return 'm4a'
  return ['webm', 'mp4', 'm4a', 'ogg', 'wav', 'mp3', 'flac'].includes(subtype) ? subtype : 'webm'
}

const openAiResponseSchema = z.object({text: z.string()})

export const createOpenAiTranscriber =
  (apiKey: string): ServerTranscriber =>
  async (audio, language) => {
    const form = new FormData()
    form.set('file', audio, `answer.${extensionFor(audio.type)}`)
    form.set('model', TRANSCRIBE_MODEL)
    form.set('language', language)
    form.set('response_format', 'json')
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`},
      body: form,
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`OpenAI transcription failed: ${res.status}`)
    const {text} = openAiResponseSchema.parse(await res.json())
    return {text, language, model: TRANSCRIBE_MODEL}
  }

/** Dev/preview stand-in so the game flow works without an OpenAI key. */
export const fakeTranscriber: ServerTranscriber = async (audio, language) => ({
  text: `[fake ${language} transcript of ${audio.size} bytes]`,
  language,
  model: 'fake',
})

/** POST multipart `audio` + `token` + `turnId` + `durationMs`: transcribes and saves my turn's answer, once. */
export const handleAnswerUpload = async (request: Request, deps: AnswerUploadDeps) => {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail(413, 'Recording is too long')
  }
  if (!deps.transcriber) return fail(503, 'Transcription is not configured')

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail(400, 'Expected multipart form data')
  }
  const fields = answerUploadFieldsSchema.safeParse({
    token: form.get('token'),
    turnId: form.get('turnId'),
    durationMs: form.get('durationMs'),
  })
  const audio = form.get('audio')
  if (!fields.success || !(audio instanceof Blob) || audio.size === 0) {
    return fail(400, 'Send audio, token, turnId and durationMs')
  }
  if (audio.size > MAX_AUDIO_BYTES) return fail(413, 'Recording is too long')

  const player = await deps.game.findPlayerByToken(fields.data.token)
  if (!player) return fail(401, 'Join the game first')
  if (!player.consentTranscript) return fail(403, 'You chose to play without saving answers')
  const snapshot = await deps.game.loadSnapshot(player.gameId)
  const turn = snapshot?.turns.find((t) => t.id === fields.data.turnId && t.playerId === player.id)
  const round = turn && snapshot?.rounds.find((r) => r.id === turn.roundId)
  if (!snapshot || !turn || !round) return fail(404, 'No such turn')
  if (answerModeAt(snapshot.game.settings, turn.startedAt) !== 'voice') {
    return fail(422, 'This turn takes no recording')
  }
  // A retry after a lost reply lands here instead of transcribing twice.
  const answered = (await deps.game.listResponses(player.id)).some((r) => r.turnId === turn.id)
  if (answered) return done({saved: true})
  if (!(await deps.game.claimTranscription(turn.id))) return fail(409, 'Already being transcribed')

  let text: string
  try {
    const transcript = transcriptSchema.parse(await deps.transcriber(audio, player.language))
    text = transcript.text.trim().slice(0, MAX_TRANSCRIPT_CHARS)
  } catch (error) {
    logError('game/answer: transcriber failed', error)
    await deps.game.releaseTranscription(turn.id)
    return fail(502, 'Transcription failed, try again')
  }
  if (text === '') return done({saved: false})

  try {
    await saveAnswer(deps.game, round, turn, {
      playerId: player.id,
      language: player.language,
      transcript: text,
      durationMs: fields.data.durationMs,
    })
  } catch (error) {
    logError('game/answer: saving the answer failed', error)
    await deps.game.releaseTranscription(turn.id)
    return fail(500, 'Saving failed, try again')
  }
  return done({saved: true})
}
