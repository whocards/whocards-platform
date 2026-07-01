import {Heading, Hr, Link, Section, Text} from '@react-email/components'

import {emailBrand} from '../brand'
import {BrandButton, EmailShell} from '../components'

// Pre-launch buildup #2 (#96): the "almost ready" email, sent to consented
// newsletter subscribers AFTER the Android Closed Test passes (#98). A
// behind-the-scenes update + one Question to play/share. Intentionally makes NO
// launch-date promise — the date is set by the runbook (#94), not this email.

export const betaValidatedSubject = 'WhoCards passed its final test'
export const betaValidatedPreview =
  'Real testers put the app through its paces. Here is what happened — and a question while you wait.'

const DEFAULT_PLAY_URL =
  'https://whocards.cc/play?utm_source=email&utm_medium=buildup&utm_campaign=launch'

export type BetaValidatedProps = Readonly<{
  /** Where "play now in your browser" points (with UTM). */
  playUrl?: string
  /** Opening greeting — segment copy by source list. */
  greeting?: string
}>

export function BetaValidatedEmail({
  playUrl = DEFAULT_PLAY_URL,
  greeting = 'Hi there,',
}: BetaValidatedProps) {
  // Show the same address the button opens — never a hardcoded one that can drift.
  const playUrlLabel = (() => {
    const {host, pathname} = new URL(playUrl)
    return `${host}${pathname}`
  })()

  return (
    <EmailShell preview={betaValidatedPreview}>
      <Text style={eyebrow}>ALMOST READY</Text>
      <Heading style={heading}>The app cleared its final test.</Heading>
      <Text style={paragraph}>{greeting}</Text>
      <Text style={paragraph}>
        Quick behind-the-scenes update: a group of real testers spent the last two weeks living with
        the WhoCards app — playing decks, switching languages, sharing cards — and telling us every
        place it felt rough. We listened and polished.
      </Text>
      <Text style={paragraph}>
        We&apos;re not naming a date yet (we&apos;d rather ship it right than ship it fast), but the
        finish line is in sight. You&apos;ll be among the first to know the moment it&apos;s live.
      </Text>

      <Section style={questionCard}>
        <Text style={questionLabel}>WHILE YOU WAIT</Text>
        <Text style={question}>What is a small thing that recently made your day better?</Text>
        <Text style={questionNote}>
          Play it with someone — or share it and see what comes back.
        </Text>
      </Section>

      <Text style={paragraph}>
        You don&apos;t have to wait for the app to play. All 66 questions already work in your
        browser, free, no install needed.
      </Text>

      <Section style={{margin: '30px 0', textAlign: 'center'}}>
        <BrandButton href={playUrl}>Play a question now →</BrandButton>
      </Section>
      <Text style={smallText}>
        Button not working?{' '}
        <Link href={playUrl} style={link}>
          Open {playUrlLabel}
        </Link>
      </Text>

      <Hr style={rule} />

      <Text style={{...paragraph, marginBottom: 0}}>
        Almost there,
        <br />
        The WhoCards team
      </Text>
    </EmailShell>
  )
}

export function betaValidatedText({
  playUrl = DEFAULT_PLAY_URL,
  greeting = 'Hi there,',
}: Required<BetaValidatedProps>) {
  return `WhoCards passed its final test.

${greeting}

Quick behind-the-scenes update: a group of real testers spent the last two weeks living with the WhoCards app — playing decks, switching languages, sharing cards — and telling us every place it felt rough. We listened and polished.

We're not naming a date yet (we'd rather ship it right than ship it fast), but the finish line is in sight. You'll be among the first to know the moment it's live.

WHILE YOU WAIT

What is a small thing that recently made your day better?
Play it with someone — or share it and see what comes back.

You don't have to wait for the app to play. All 66 questions already work in your browser, free, no install needed.

Play a question now:
${playUrl}

Almost there,
The WhoCards team

WhoCards helps people move past "What do you do?" toward "Who are you?"
https://whocards.cc`
}

const heading = {
  color: emailBrand.colors.ink,
  fontFamily: emailBrand.fonts.title,
  fontSize: '38px',
  fontWeight: 800,
  letterSpacing: '-1px',
  lineHeight: '44px',
  margin: '8px 0 22px',
}
const eyebrow = {
  color: emailBrand.colors.accent,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  margin: 0,
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
const question = {
  color: emailBrand.colors.ink,
  fontFamily: emailBrand.fonts.title,
  fontSize: '26px',
  fontWeight: 700,
  lineHeight: '33px',
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
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
  textAlign: 'center' as const,
}
const link = {color: emailBrand.colors.accent, textDecoration: 'underline'}
const rule = {borderColor: emailBrand.colors.cardMuted, margin: '30px 0'}

BetaValidatedEmail.PreviewProps = {
  playUrl: DEFAULT_PLAY_URL,
  greeting: 'Hi waitlist friend,',
} satisfies BetaValidatedProps

// oxlint-disable-next-line import/no-default-export -- required by React Email template discovery
export default BetaValidatedEmail
