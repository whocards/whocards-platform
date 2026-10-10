import type {Recorder, Recording} from '@whocards/game'

// Opus in webm where the browser has it; iOS Safari only records mp4/aac.
const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
]

// Plenty for speech, and keeps a long answer far under the 25 MB upload cap.
const BITS_PER_SECOND = 32_000

/** Empty string lets the browser pick its default. */
export const pickMimeType = (isSupported: (type: string) => boolean): string =>
  MIME_TYPES.find(isSupported) ?? ''

const stopTracks = (stream: MediaStream) => {
  for (const track of stream.getTracks()) track.stop()
}

type Session = {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  startedAt: number
}

export const canRecord = (): boolean =>
  typeof MediaRecorder !== 'undefined' && 'getUserMedia' in (navigator.mediaDevices ?? {})

export const createWebRecorder = (): Recorder<Blob> => {
  let session: Session | null = null

  return {
    async start() {
      if (session) return
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {echoCancellation: true, noiseSuppression: true},
      })
      const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? {mimeType} : {}),
        audioBitsPerSecond: BITS_PER_SECOND,
      })
      const chunks: Blob[] = []
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      })
      // Timeslices keep earlier audio if the tab dies before stop().
      recorder.start(1000)
      session = {recorder, stream, chunks, startedAt: Date.now()}
    },

    stop() {
      const current = session
      if (!current) return Promise.reject(new Error('Not recording'))
      session = null
      return new Promise<Recording<Blob>>((resolve) => {
        current.recorder.addEventListener(
          'stop',
          () => {
            stopTracks(current.stream)
            const type = current.recorder.mimeType || current.chunks[0]?.type || 'audio/webm'
            resolve({
              audio: new Blob(current.chunks, {type}),
              mimeType: type,
              durationMs: Date.now() - current.startedAt,
            })
          },
          {once: true}
        )
        current.recorder.stop()
      })
    },

    async cancel() {
      const current = session
      session = null
      if (!current) return
      if (current.recorder.state !== 'inactive') current.recorder.stop()
      stopTracks(current.stream)
    },
  }
}
