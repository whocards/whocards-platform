import type {GamePort} from '@whocards/api'
import {logError} from '@whocards/observability'
import {
  MAX_AUDIO_BYTES,
  transcribeFieldsSchema,
  transcriptSchema,
  uploadableTurn,
} from '@whocards/game'
import type {GameLanguage, Transcript} from '@whocards/game'
import {z} from 'zod'

export const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'
const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions'
const OPENAI_TIMEOUT_MS = 25_000
// Multipart framing and the text fields ride on top of the audio itself.
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 1024 * 1024

/** Server-side speech-to-text; the audio is passed through and never stored. */
export type ServerTranscriber = (audio: Blob, language: GameLanguage) => Promise<Transcript>

export type TranscribeDeps = {
  game: Pick<
    GamePort,
    'now' | 'findPlayerByToken' | 'loadSnapshot' | 'claimTranscription' | 'releaseTranscription'
  >
  transcriber: ServerTranscriber | null
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

const fail = (status: number, error: string) => json({error}, status)

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

/** POST multipart `audio` + `token` + `language` → Transcript JSON. */
export const handleTranscribe = async (request: Request, deps: TranscribeDeps) => {
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
  const fields = transcribeFieldsSchema.safeParse({
    token: form.get('token'),
    language: form.get('language'),
  })
  const audio = form.get('audio')
  if (!fields.success || !(audio instanceof Blob) || audio.size === 0) {
    return fail(400, 'Send audio, token and language')
  }
  if (audio.size > MAX_AUDIO_BYTES) return fail(413, 'Recording is too long')

  const player = await deps.game.findPlayerByToken(fields.data.token)
  if (!player) return fail(401, 'Join the game first')
  const snapshot = await deps.game.loadSnapshot(player.gameId)
  const turn = snapshot && uploadableTurn(snapshot, player.id, deps.game.now())
  if (!turn) return fail(409, 'No turn to transcribe')
  if (!(await deps.game.claimTranscription(turn.id))) return fail(409, 'Turn already transcribed')

  try {
    return json(transcriptSchema.parse(await deps.transcriber(audio, fields.data.language)), 200)
  } catch (error) {
    logError('game/transcribe: transcriber failed', error)
    await deps.game.releaseTranscription(turn.id)
    return fail(502, 'Transcription failed, try again')
  }
}
