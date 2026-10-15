import {Heading, Hr, Link, Section, Text} from '@react-email/components'
import {render} from '@react-email/render'

import {emailBrand} from '../brand'
import {BrandButton, EmailShell} from '../components'

export const gameRevisitSubject = 'Your questions, one more time'
export const gameRevisitPreview =
  'The questions you answered at the workshop, for when you have a quiet minute.'

export type GameRevisitProps = Readonly<{
  name: string
  eventTitle: string
  organizer: string | null
  /** The questions the player answered, oldest first; `url` is null for the host's own questions. */
  questions: ReadonlyArray<Readonly<{text: string; url: string | null}>>
  playUrl: string
  appUrl: string
}>

const INVITATIONS = [
  'Write it down tonight. Three lines is plenty.',
  'Ask a friend this one over dinner, then answer it yourself.',
  'Take it on a walk and see if your answer has changed.',
  'Ask someone who knows you well how they think you would answer.',
]

const intro =
  'at the workshop you gave each of these a few minutes, with someone listening. Good questions keep working after the timer stops. Here they are again, for a quiet moment this week.'

/** One gentle way to come back to the question, varied down the list. */
export const revisitInvitation = (i: number): string => INVITATIONS[i % INVITATIONS.length] ?? ''

export function GameRevisitEmail({
  name,
  eventTitle,
  organizer,
  questions,
  playUrl,
  appUrl,
}: GameRevisitProps) {
  return (
    <EmailShell preview={gameRevisitPreview}>
      <Text style={eyebrow}>{eventTitle.toUpperCase()}</Text>
      {organizer && <Text style={hostedBy}>{`Hosted by ${organizer}`}</Text>}
      <Heading style={heading}>Your questions, one more time.</Heading>
      <Text style={paragraph}>{`Hi ${name}, ${intro}`}</Text>

      {questions.map((q, i) => (
        <Section key={`${i}:${q.text}`} style={questionCard}>
          <Text style={questionLabel}>{`QUESTION ${i + 1}`}</Text>
          <Text style={questionText}>{q.text}</Text>
          <Text style={questionNote}>
            {revisitInvitation(i)}
            {q.url && (
              <>
                {' '}
                <Link href={q.url} style={link}>
                  Open the card
                </Link>
              </>
            )}
          </Text>
        </Section>
      ))}

      <Section style={{margin: '30px 0 12px', textAlign: 'center'}}>
        <BrandButton href={playUrl}>Draw a new question →</BrandButton>
      </Section>
      <Text style={smallText}>
        <Link href={appUrl} style={link}>
          Get the WhoCards app
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

export function gameRevisitText({
  name,
  eventTitle,
  organizer,
  questions,
  playUrl,
  appUrl,
}: GameRevisitProps) {
  const host = organizer ? `Hosted by ${organizer}\n\n` : ''
  const list = questions
    .map(
      (q, i) => `QUESTION ${i + 1}\n${q.text}\n${revisitInvitation(i)}${q.url ? `\n${q.url}` : ''}`
    )
    .join('\n\n')
  return `${host}${eventTitle}: your questions, one more time.

Hi ${name}, ${intro}

${list}

Draw a new question: ${playUrl}
Get the WhoCards app: ${appUrl}

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
const questionCard = {
  backgroundColor: emailBrand.colors.background,
  border: `1px solid ${emailBrand.colors.cardMuted}`,
  borderRadius: '20px',
  margin: '20px 0',
  padding: '24px',
}
const questionLabel = {
  color: emailBrand.colors.accent,
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  margin: '0 0 12px',
}
const questionText = {
  color: emailBrand.colors.ink,
  fontFamily: emailBrand.fonts.title,
  fontSize: '22px',
  fontWeight: 700,
  lineHeight: '29px',
  margin: 0,
  whiteSpace: 'pre-line' as const,
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

GameRevisitEmail.PreviewProps = {
  name: 'Réka',
  eventTitle: 'SDD 2026',
  organizer: 'Spec-Driven Development Conf',
  questions: [
    {
      text: 'What would you do with a free year?',
      url: 'https://whocards.cc/play?lang=en&q=1',
    },
    {text: 'Who taught you to be brave?', url: null},
  ],
  playUrl: 'https://whocards.cc/play',
  appUrl: 'https://whocards.cc/app',
} satisfies GameRevisitProps

/** The email as the HTML a player receives, for the host's preview. */
export const renderGameRevisit = (props: GameRevisitProps): Promise<string> =>
  render(<GameRevisitEmail {...props} />)

// oxlint-disable-next-line import/no-default-export -- required by React Email template discovery
export default GameRevisitEmail
