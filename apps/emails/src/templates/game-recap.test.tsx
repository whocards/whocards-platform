import {render} from '@react-email/render'
import {describe, expect, it} from 'vitest'

import {GameRecapEmail, gameRecapText} from './game-recap'

const props = {...GameRecapEmail.PreviewProps}

describe('GameRecapEmail', () => {
  it('renders thanks, both stat blocks, the take-home question and every link', async () => {
    const html = await render(<GameRecapEmail {...props} />)
    expect(html).toContain('Thanks for playing, Réka.')
    expect(html).toContain('THE ROOM')
    expect(html).toContain('minutes spoken')
    expect(html).toContain('people met')
    expect(html).toContain('saved answers')
    expect(html).toContain(props.question)
    expect(html).toContain(props.appUrl)
    expect(html).toContain(props.eventUrl)
    expect(html).toContain(props.myAnswersUrl)
  })

  it('drops the question card when there is no question left', async () => {
    const html = await render(<GameRecapEmail {...props} question={null} />)
    expect(html).not.toContain('A QUESTION TO TAKE HOME')
  })

  it('provides a complete plain-text fallback', () => {
    const text = gameRecapText(props)
    expect(text).toContain('You met 4 people.')
    expect(text).toContain('- 301 minutes spoken')
    expect(text).toContain(props.question)
    expect(text).toContain(props.myAnswersUrl)
    expect(gameRecapText({...props, you: {...props.you, peopleMet: 1}})).toContain(
      'You met 1 person.'
    )
  })
})
