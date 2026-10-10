import type {GameLanguage, Transcript} from './schemas'

// Device seams each app implements; `TAudio` is the platform's audio handle (Blob on web, file URI on mobile).

export type Recording<TAudio> = {audio: TAudio; mimeType: string; durationMs: number}

export type Recorder<TAudio> = {
  start: () => Promise<void>
  stop: () => Promise<Recording<TAudio>>
  cancel: () => Promise<void>
}

export type WakeLock = {
  /** Resolves false when the platform refuses; the game still works, the screen may dim. */
  acquire: () => Promise<boolean>
  release: () => Promise<void>
}

export type Transcriber<TAudio> = {
  transcribe: (recording: Recording<TAudio>, language: GameLanguage) => Promise<Transcript>
}

export type Scanner = {
  start: (onCode: (code: string) => void) => Promise<void>
  stop: () => Promise<void>
}
