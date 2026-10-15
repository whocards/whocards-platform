import {render} from '@react-email/render'
import {describe, expect, it} from 'vitest'

import {
  GameRevisitEmail,
  gameRevisitText,
  renderGameRevisit,
  revisitInvitation,
} from './game-revisit'

const props = {...GameRevisitEmail.PreviewProps}

describe('GameRevisitEmail', () => {
  it('renders each question with an invitation, a card link only where one exists, and the site links', async () => {
    const html = await render(<GameRevisitEmail {...props} />)
    expect(html).toContain('Your questions, one more time.')
    expect(html).toContain('Hi Réka,')
    expect(html).toContain(props.questions[0]?.text)
    expect(html).toContain(props.questions[1]?.text)
    expect(html).toContain(revisitInvitation(0))
    expect(html).toContain(revisitInvitation(1))
    expect(html.match(/Open the card/g)).toHaveLength(1)
    expect(html).toContain(props.playUrl)
    expect(html).toContain(props.appUrl)
    expect(html).toContain('Hosted by Spec-Driven Development Conf')
  })

  it('renders the same HTML for the host preview, and skips a missing organizer', async () => {
    expect(await renderGameRevisit(props)).toBe(await render(<GameRevisitEmail {...props} />))
    expect(await renderGameRevisit({...props, organizer: null})).not.toContain('Hosted by')
  })

  it('cycles the invitations so a long list never runs out', () => {
    expect(revisitInvitation(4)).toBe(revisitInvitation(0))
  })

  it('provides a complete plain-text fallback', () => {
    const text = gameRevisitText(props)
    expect(text).toMatch(/^Hosted by Spec-Driven Development Conf\n/)
    expect(text).toContain(`QUESTION 1\n${props.questions[0]?.text}\n${revisitInvitation(0)}\n`)
    expect(text).toContain(`QUESTION 2\n${props.questions[1]?.text}\n${revisitInvitation(1)}\n`)
    expect(text).toContain(props.questions[0]?.url)
    expect(text).toContain(`Draw a new question: ${props.playUrl}`)
  })
})
