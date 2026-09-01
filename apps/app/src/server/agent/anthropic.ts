import {env} from '../env'

// Mirrors the raw-fetch pattern from the dev-only Question Lab
// (apps/website/src/server/question-lab/, feat/ai-at-work-question-lab, not yet
// on main) — no @anthropic-ai/sdk dependency, just the Messages API directly.
const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const DISCUSSION_MODEL = 'claude-sonnet-5'
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
 * (see server/env.ts) rather than let this throw reach a user-facing crash.
 */
export async function askAgent(
  questionText: string,
  history: readonly AgentMessage[]
): Promise<string> {
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
    body: JSON.stringify({
      model: DISCUSSION_MODEL,
      max_tokens: MAX_TOKENS,
      system: `${SYSTEM_PROMPT}\n\nThe card under discussion: "${questionText}"`,
      messages: history.map((m) => ({role: m.role, content: m.content})),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Anthropic API error (${response.status}): ${body.slice(0, 300)}`)
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- response.json() is `any`; this is an external API boundary with no runtime schema validation in place. Callers only read `.text` off blocks that pass the typeof guard below.
  const data = (await response.json()) as {content?: Array<{type: string; text?: string}>}
  return (data.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}
