import {codeSchema} from './schemas'

/** Normalises a scanned or typed partner code; null when it can't be one. */
export const readPairCode = (raw: string): string | null => {
  const parsed = codeSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
