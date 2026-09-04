import {DEFAULT_DECK_SLUG, getDeck, getInitialNav, isDeckSlug} from '@whocards/decks'
import type {APIRoute} from 'astro'
import {env} from '~env'
import {verifySlackSignature} from '~server/slack/verify'

// `/whocards [deck] [language]` slash command — Phase 0 spike for issue #179
// (docs/strategy/surface-chat.md §9/§3). Deliberately the smallest possible
// slice that proves the real technical loop: a signed Slack request in, a real
// draw via @whocards/decks (the same pure engine web/mobile already use), a
// Slack-shaped reply out. No bot token, no OAuth install flow, no DB — Slack's
// slash-command response is returned synchronously in this same HTTP response,
// so there's no 3-second-ack budget to manage yet (that starts mattering once
// a network call — e.g. persisted per-channel draw history — enters the
// critical path; see the design doc's Phase 1).
//
// Renders TEXT, not a Share Card image, on purpose: the ai-at-work deck's ids
// are not Pool-backed (@whocards/decks' `isPoolBacked`), so the existing
// /share-card endpoint must not be offered for it (see the design doc §6/§7 —
// it would 404 or, worse, silently serve an unrelated card). Every deck gets a
// plain formatted reply until a deck-aware Share Card endpoint exists.
export const prerender = false

const slackJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

const ephemeral = (text: string): Response => slackJson({response_type: 'ephemeral', text})

export const POST: APIRoute = async ({request}) => {
  // Slash commands arrive application/x-www-form-urlencoded. Slack signs the
  // exact raw body bytes, so read it as text before any parsing.
  const body = await request.text()
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? ''
  const signature = request.headers.get('x-slack-signature') ?? ''

  // Absent secret must degrade to a clear, non-crashing reply — this is a
  // pilot integration, never build-required (see apps/website/src/env.ts).
  if (!env.SLACK_SIGNING_SECRET) {
    return ephemeral(
      'WhoCards Slack integration is not configured yet (SLACK_SIGNING_SECRET unset).'
    )
  }

  const validRequest = verifySlackSignature({
    signingSecret: env.SLACK_SIGNING_SECRET,
    timestamp,
    body,
    signature,
  })
  if (!validRequest) return new Response('Invalid signature', {status: 401})

  const params = new URLSearchParams(body)
  const [rawDeck, rawLanguage] = (params.get('text') ?? '').trim().split(/\s+/).filter(Boolean)

  const slug = rawDeck && isDeckSlug(rawDeck) ? rawDeck : DEFAULT_DECK_SLUG
  const deck = getDeck(slug)
  if (!deck) return ephemeral(`Unknown deck "${rawDeck}". Try "library" or "ai-at-work".`)

  const language =
    rawLanguage && deck.languages.includes(rawLanguage) ? rawLanguage : deck.languages[0]

  // Fresh shuffle per invocation — no persisted "already drawn" state yet
  // (that's Phase 1, see the design doc §3). Fine for a stateless pilot.
  const nav = getInitialNav(deck.questionIds)
  const id = nav.ids[nav.idx]
  const text = id && language ? deck.questions[id]?.[language] : undefined
  if (!id || !text)
    return ephemeral('Could not draw a question for that deck/language — try again.')

  return slackJson({
    response_type: 'in_channel',
    blocks: [
      {type: 'section', text: {type: 'mrkdwn', text: `*${deck.title}*\n${text}`}},
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<https://whocards.cc/play/${deck.slug}?q=${id}|Open in WhoCards> · WHOCARDS.CC`,
          },
        ],
      },
    ],
  })
}
