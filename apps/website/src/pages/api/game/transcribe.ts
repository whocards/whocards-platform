import type {APIRoute} from 'astro'
import {env} from '~env'
import {db} from '~server/db'
import {createDrizzleGamePort} from '~server/game/drizzle-port'
import {createOpenAiTranscriber, fakeTranscriber, handleTranscribe} from '~server/game/transcribe'

export const prerender = false

const game = createDrizzleGamePort(db)

// Without a key, production refuses rather than handing players fake transcripts.
const transcriber = env.OPENAI_API_KEY
  ? createOpenAiTranscriber(env.OPENAI_API_KEY)
  : env.CONTEXT === 'production'
    ? null
    : fakeTranscriber

export const POST: APIRoute = ({request}) => handleTranscribe(request, {game, transcriber})
