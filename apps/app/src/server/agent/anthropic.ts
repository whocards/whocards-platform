import {z} from 'zod'
import {env} from '@whocards/env/app'

// Mirrors the raw-fetch pattern from the dev-only Question Lab
// (apps/website/src/server/question-lab/, feat/ai-at-work-question-lab, not yet
// on main) — no @anthropic-ai/sdk dependency, just the Messages API directly.
const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const DISCUSSION_MODEL = 'claude-sonnet-5'
const TRANSLATION_MODEL = 'claude-opus-5-5'
const MAX_TOKENS = 1024

const SYSTEM_PROMPT = `You are a thinking partner for a facilitator preparing to run WhoCards' "AI Check-In" — a
20-minute team conversation about AI arriving in people's work. The facilitator is looking at one
specific card and wants to talk it through with you before the session: what the question is really
asking, how to introduce it to a nervous room, what answers to expect, or a concern they have about
it landing wrong. Be a concise, warm, concrete conversational partner — a few sentences, not an
essay — and ground everything in the actual question text you're given. You are not writing new
questions; you're helping someone facilitate this one well.`

export type AgentMessage = {role: 'user' | 'assistant'; content: string}

/**
 * Sends the conversation so far (plus the question under discussion) to
 * Claude and returns the assistant's reply text. Throws if ANTHROPIC_API_KEY
 * is absent — callers must check `agentEnabled` first and degrade gracefully
 * (see @whocards/env/app) rather than let this throw reach a user-facing crash.
 */
export async function askAgent(
  questionText: string,
  history: readonly AgentMessage[]
): Promise<string> {
  const {text} = await createMessage({
    model: DISCUSSION_MODEL,
    max_tokens: MAX_TOKENS,
    system: `${SYSTEM_PROMPT}\n\nThe card under discussion: "${questionText}"`,
    messages: history.map((m) => ({role: m.role, content: m.content})),
  })
  return text
}

export type SourceQuestion = {id: string; source: string}

const TRANSLATION_PROMPT = `You translate WhoCards questions. WhoCards is a conversation game: each card asks one
warm, personal question that moves people past small talk. Translate each question from English so it
reads as if first written in the target language: natural, informal second person, the same feeling and
intent, not word for word. Keep line breaks and any parenthesised aside. Return every id you are given.`

const translationsSchema = z.object({
  translations: z.array(z.object({id: z.string(), text: z.string()})),
})

/** One Messages call translating `questions` into `language`; returns id -> translated text. */
export async function translateQuestions(
  language: string,
  questions: readonly SourceQuestion[]
): Promise<Map<string, string>> {
  const {text, stopReason} = await createMessage({
    model: TRANSLATION_MODEL,
    max_tokens: 16000,
    system: `${TRANSLATION_PROMPT}\n\nTarget language (BCP 47 tag): ${language}`,
    messages: [{role: 'user', content: JSON.stringify(questions)}],
    output_config: {
      effort: 'medium',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            translations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {id: {type: 'string'}, text: {type: 'string'}},
                required: ['id', 'text'],
                additionalProperties: false,
              },
            },
          },
          required: ['translations'],
          additionalProperties: false,
        },
      },
    },
  })
  if (stopReason !== 'end_turn') throw new Error(`Translation stopped early (${stopReason}).`)
  const {translations} = translationsSchema.parse(JSON.parse(text))
  return new Map(translations.map((t) => [t.id, t.text]))
}

async function createMessage(
  body: Record<string, unknown>
): Promise<{text: string; stopReason: string | null}> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`Anthropic API error (${response.status}): ${errorBody.slice(0, 300)}`)
  }

  const anthropicResponseSchema = z.object({
    stop_reason: z.string().nullable().optional(),
    content: z.array(z.object({type: z.string(), text: z.string().optional()})).optional(),
  })
  const data = anthropicResponseSchema.parse(await response.json())
  return {
    stopReason: data.stop_reason ?? null,
    text: (data.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join(''),
  }
}
