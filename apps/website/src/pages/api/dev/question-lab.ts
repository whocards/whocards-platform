import type {APIRoute} from 'astro'
import {z} from 'zod'
import {env} from '~env'
import {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MESSAGES_URL,
  QUESTION_LAB_MAX_TOKENS,
  QUESTION_LAB_MODELS,
} from '~server/question-lab/models'
import {
  parseModelResponse,
  substituteDirection,
  validateDeckJson,
} from '~server/question-lab/prompt'

// Dev-only benchmark endpoint for the AI Check-In question-generation prompt
// (the "psychedelic AI benchmark" Question Lab). Never shipped to production —
// this route, like its page, must not exist outside `astro dev`.
export const prerender = false

const schema = z.object({
  prompt: z.string().min(1),
  direction: z.string(),
  model: z.string().min(1),
})

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

export const POST: APIRoute = async ({request}) => {
  // Hard dev gate — mirrors the page's own gate so the endpoint can't be hit
  // even if someone finds the URL in a production deploy.
  if (!import.meta.env.DEV) {
    return new Response(null, {status: 404})
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return json({error: 'Invalid request body — expected {prompt, direction, model}.'}, 400)
  }

  const {prompt, direction, model} = parsed.data

  if (!QUESTION_LAB_MODELS.some((m) => m.id === model)) {
    return json({error: `Unknown model "${model}".`}, 400)
  }

  if (!env.ANTHROPIC_API_KEY) {
    return json(
      {
        error:
          'ANTHROPIC_API_KEY is not configured — set it in the repo root .env to use the Question Lab.',
      },
      503
    )
  }

  const finalPrompt = substituteDirection(prompt, direction)
  const startedAt = Date.now()

  let response: Response
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: QUESTION_LAB_MAX_TOKENS,
        messages: [{role: 'user', content: finalPrompt}],
      }),
    })
  } catch (error) {
    console.error('question-lab: request to Anthropic failed', error)
    return json({error: 'Could not reach the Anthropic API.'}, 502)
  }

  const latencyMs = Date.now() - startedAt

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    console.error('question-lab: Anthropic API error', response.status, errorBody)
    return json({error: `Anthropic API error (${response.status}).`, details: errorBody}, 502)
  }

  const data = (await response.json()) as {
    content?: Array<{type: string; text?: string}>
    usage?: {input_tokens?: number; output_tokens?: number}
    model?: string
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')

  let deck: unknown = null
  let parseError: string | null = null
  try {
    deck = parseModelResponse(text)
    validateDeckJson(deck)
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'Failed to parse model response.'
  }

  return json(
    {
      model,
      latencyMs,
      usage: {
        inputTokens: data.usage?.input_tokens ?? null,
        outputTokens: data.usage?.output_tokens ?? null,
      },
      rawText: text,
      deck: parseError ? null : deck,
      parseError,
    },
    200
  )
}
