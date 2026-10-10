import type {GameLanguage, Recording, Transcriber} from '@whocards/game'
import {transcriptSchema} from '@whocards/game'
import {z} from 'zod'

const failureSchema = z.object({error: z.string()})

export const TRANSCRIBE_URL = '/api/game/transcribe'

export const createWebTranscriber = (
  token: () => string | null,
  fetcher: typeof fetch = fetch
): Transcriber<Blob> => ({
  async transcribe(recording: Recording<Blob>, language: GameLanguage) {
    const form = new FormData()
    form.set('audio', recording.audio)
    form.set('token', token() ?? '')
    form.set('language', language)
    const res = await fetcher(TRANSCRIBE_URL, {method: 'POST', body: form})
    const body: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const failure = failureSchema.safeParse(body)
      throw new Error(failure.success ? failure.data.error : `Transcription failed: ${res.status}`)
    }
    return transcriptSchema.parse(body)
  },
})
