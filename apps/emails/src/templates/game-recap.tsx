import {Column, Heading, Hr, Link, Row, Section, Text} from '@react-email/components'
import {render} from '@react-email/render'

import {emailBrand} from '../brand'
import {BrandButton, EmailShell} from '../components'

export const gameRecapSubject = 'Your WhoCards recap'
export const gameRecapPreview =
  'Thanks for playing. Your numbers, the room, and a question to take home.'

export type GameRecapProps = Readonly<{
  name: string
  eventTitle: string
  /** The conference or company hosting the workshop; null for games made before it was asked. */
  organizer: string | null
  event: Readonly<{
    players: number
    rounds: number
    turns: number
    minutes: number
    languages: number
  }>
  you: Readonly<{peopleMet: number; turns: number; minutes: number; savedAnswers: number}>
  /** The questions the player answered, oldest first; there even when nothing was saved. */
  asked: readonly string[]
  /** A question from the round decks the player didn't draw; null when the deck ran dry. */
  question: string | null
  appUrl: string
  eventUrl: string
  myAnswersUrl: string
}>

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const eventStats = (event: GameRecapProps['event']): [string, string][] => [
  [String(event.players), 'players'],
  [String(event.rounds), 'rounds'],
  [String(event.turns), 'turns'],
  [String(event.minutes), 'minutes spoken'],
  [String(event.languages), 'languages'],
]

const yourStats = (you: GameRecapProps['you']): [string, string][] => [
  [String(you.peopleMet), 'people met'],
  [String(you.turns), 'turns'],
  [String(you.minutes), 'minutes'],
  [String(you.savedAnswers), 'saved answers'],
]

function StatRow({stats}: Readonly<{stats: [string, string][]}>) {
  return (
    <Row>
      {stats.map(([value, label]) => (
        <Column key={label} style={statCell}>
          <Text style={statValue}>{value}</Text>
          <Text style={statLabel}>{label}</Text>
        </Column>
      ))}
    </Row>
  )
}

export function GameRecapEmail({
  name,
  eventTitle,
  organizer,
  event,
  you,
  asked,
  question,
  appUrl,
  eventUrl,
  myAnswersUrl,
}: GameRecapProps) {
  return (
    <EmailShell preview={gameRecapPreview}>
      <Text style={eyebrow}>{eventTitle.toUpperCase()}</Text>
      {organizer && <Text style={hostedBy}>{`Hosted by ${organizer}`}</Text>}
      <Heading style={heading}>{`Thanks for playing, ${name}.`}</Heading>
      <Text style={paragraph}>
        You traded small talk for real questions with a room full of strangers. That takes a bit of
        nerve. Thank you for bringing it.
      </Text>

      <Text style={sectionLabel}>THE ROOM</Text>
      <StatRow stats={eventStats(event)} />

      <Text style={sectionLabel}>YOUR GAME</Text>
      <StatRow stats={yourStats(you)} />

      {asked.length > 0 && (
        <>
          <Text style={sectionLabel}>YOUR QUESTIONS</Text>
          {asked.map((q, i) => (
            <Text key={`${i}:${q}`} style={askedText}>
              {q}
            </Text>
          ))}
        </>
      )}

      {question && (
        <Section style={questionCard}>
          <Text style={questionLabel}>A QUESTION TO TAKE HOME</Text>
          <Text style={questionText}>{question}</Text>
          <Text style={questionNote}>One you didn&apos;t draw. Try it on someone this week.</Text>
        </Section>
      )}

      <Section style={{margin: '30px 0 12px', textAlign: 'center'}}>
        <BrandButton href={myAnswersUrl}>See my answers →</BrandButton>
      </Section>
      <Text style={smallText}>
        <Link href={appUrl} style={link}>
          Get the WhoCards app
        </Link>
        {' · '}
        <Link href={eventUrl} style={link}>
          About the event
        </Link>
      </Text>

      <Hr style={rule} />

      <Text style={{...paragraph, marginBottom: 0}}>
        See you past the small talk,
        <br />
        Avi &amp; Tamas
      </Text>
    </EmailShell>
  )
}

const statLines = (rows: [string, string][]) => rows.map(([v, l]) => `- ${v} ${l}`).join('\n')

export function gameRecapText({
  name,
  eventTitle,
  organizer,
  event,
  you,
  asked,
  question,
  appUrl,
  eventUrl,
  myAnswersUrl,
}: GameRecapProps) {
  const questions =
    asked.length > 0 ? `\nYOUR QUESTIONS\n${asked.map((q) => `- ${q}`).join('\n')}\n` : ''
  const take = question
    ? `\nA QUESTION TO TAKE HOME\n\n${question}\nOne you didn't draw. Try it on someone this week.\n`
    : ''
  const host = organizer ? `Hosted by ${organizer}\n\n` : ''
  return `${host}${eventTitle}: thanks for playing, ${name}.

You traded small talk for real questions with a room full of strangers. That takes a bit of nerve. Thank you for bringing it.

THE ROOM
${statLines(eventStats(event))}

YOUR GAME
You met ${plural(you.peopleMet, 'person', 'people')}.
${statLines(yourStats(you))}
${questions}${take}
See my answers: ${myAnswersUrl}
Get the WhoCards app: ${appUrl}
About the event: ${eventUrl}

See you past the small talk,
Avi & Tamas

WhoCards helps people move past "What do you do?" toward "Who are you?"
https://whocards.cc`
}

const eyebrow = {
  color: emailBrand.colors.accent,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  margin: 0,
}
const hostedBy = {
  color: emailBrand.colors.inkMuted,
  fontSize: '14px',
  lineHeight: '20px',
  margin: '4px 0 0',
}
const heading = {
  color: emailBrand.colors.ink,
  fontFamily: emailBrand.fonts.title,
  fontSize: '34px',
  fontWeight: 800,
  letterSpacing: '-1px',
  lineHeight: '40px',
  margin: '8px 0 22px',
}
const paragraph = {
  color: emailBrand.colors.ink,
  fontSize: '17px',
  lineHeight: '27px',
  margin: '0 0 18px',
}
const sectionLabel = {
  color: emailBrand.colors.accent,
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  margin: '26px 0 6px',
}
const statCell = {padding: '6px 4px', textAlign: 'center' as const, verticalAlign: 'top'}
const statValue = {
  color: emailBrand.colors.ink,
  fontFamily: emailBrand.fonts.title,
  fontSize: '28px',
  fontWeight: 800,
  lineHeight: '32px',
  margin: 0,
}
const statLabel = {
  color: emailBrand.colors.inkMuted,
  fontSize: '12px',
  lineHeight: '16px',
  margin: '4px 0 0',
}
const askedText = {...paragraph, margin: '0 0 10px'}
const questionCard = {
  backgroundColor: emailBrand.colors.background,
  border: `1px solid ${emailBrand.colors.cardMuted}`,
  borderRadius: '20px',
  margin: '28px 0',
  padding: '26px 24px',
}
const questionLabel = {
  color: emailBrand.colors.accent,
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  margin: '0 0 14px',
}
const questionText = {
  color: emailBrand.colors.ink,
  fontFamily: emailBrand.fonts.title,
  fontSize: '24px',
  fontWeight: 700,
  lineHeight: '31px',
  margin: 0,
}
const questionNote = {
  color: emailBrand.colors.inkMuted,
  fontSize: '14px',
  lineHeight: '21px',
  margin: '12px 0 0',
}
const smallText = {
  color: emailBrand.colors.inkMuted,
  fontSize: '14px',
  lineHeight: '20px',
  margin: 0,
  textAlign: 'center' as const,
}
const link = {color: emailBrand.colors.accent, textDecoration: 'underline'}
const rule = {borderColor: emailBrand.colors.cardMuted, margin: '30px 0'}

GameRecapEmail.PreviewProps = {
  name: 'Réka',
  eventTitle: 'SDD 2026',
  organizer: 'Spec-Driven Development Conf',
  event: {players: 42, rounds: 4, turns: 268, minutes: 301, languages: 2},
  you: {peopleMet: 4, turns: 8, minutes: 9, savedAnswers: 6},
  asked: ['What would you do with a free year?', 'Who taught you to be brave?'],
  question: 'What is something you changed your mind about this year?',
  appUrl: 'https://whocards.cc/app',
  eventUrl: 'https://whocards.cc/events/sdd-2026',
  myAnswersUrl: 'https://whocards.cc/events/sdd-2026/me?code=K7QM2',
} satisfies GameRecapProps

/** The recap as the HTML a player receives, for the host's preview. */
export const renderGameRecap = (props: GameRecapProps): Promise<string> =>
  render(<GameRecapEmail {...props} />)

// oxlint-disable-next-line import/no-default-export -- required by React Email template discovery
export default GameRecapEmail
