import {Heading, Hr, Link, Section, Text} from '@react-email/components'

import {emailBrand} from '../brand'
import {BrandButton, EmailShell} from '../components'

// Pre-launch buildup #1 (#96): sent to CONSENTED NEWSLETTER subscribers once the
// /app waitlist is live. Warms the list with the why, one Question, and a reply
// prompt. App-only waitlist subscribers are NOT in this audience.

export const waitlistLiveSubject = 'WhoCards is coming to your pocket'
export const waitlistLivePreview =
  'A peek at the app, why we built it, and a question to carry until launch.'

const DEFAULT_APP_URL =
  'https://whocards.cc/app?utm_source=email&utm_medium=buildup&utm_campaign=launch'

export type WaitlistLiveProps = Readonly<{
  /** /app landing URL (with UTM). Defaults to the canonical buildup link. */
  appUrl?: string
  /** Opening greeting — segment copy by source list. */
  greeting?: string
}>

export function WaitlistLiveEmail({
  appUrl = DEFAULT_APP_URL,
  greeting = 'Hi there,',
}: WaitlistLiveProps) {
  return (
    <EmailShell preview={waitlistLivePreview}>
      <Text style={eyebrow}>COMING SOON</Text>
      <Heading style={heading}>The questions you love are about to fit in your pocket.</Heading>
      <Text style={paragraph}>{greeting}</Text>
      <Text style={paragraph}>
        We&apos;re putting the finishing touches on the WhoCards app — all 66 questions, in 14
        languages, free on iOS and Android. No cards to carry, no setup. Just the right question
        when a moment could use a little more honesty.
      </Text>
      <Text style={paragraph}>
        We built it because the best conversations rarely start with &ldquo;What do you do?&rdquo;
        They start with a better question — and now you&apos;ll always have one on hand.
      </Text>

      <Section style={questionCard}>
        <Text style={questionLabel}>A QUESTION TO CARRY</Text>
        <Text style={question}>What is the most interesting thing you have learned recently?</Text>
        <Text style={questionNote}>(About yourself or in general.)</Text>
      </Section>

      <Text style={paragraph}>
        Try it on someone today — then <strong>just hit reply and tell us their answer.</strong> We
        read every one.
      </Text>

      <Section style={{margin: '30px 0', textAlign: 'center'}}>
        <BrandButton href={appUrl}>See what&apos;s coming →</BrandButton>
      </Section>
      <Text style={smallText}>
        Button not working?{' '}
        <Link href={appUrl} style={link}>
          Open whocards.cc/app
        </Link>
      </Text>

      <Hr style={rule} />

      <Text style={{...paragraph, marginBottom: 0}}>
        See you past the small talk,
        <br />
        The WhoCards team
      </Text>
    </EmailShell>
  )
}

export function waitlistLiveText({
  appUrl = DEFAULT_APP_URL,
  greeting = 'Hi there,',
}: Required<WaitlistLiveProps>) {
  return `WhoCards is coming to your pocket.

${greeting}

We're putting the finishing touches on the WhoCards app — all 66 questions, in 14 languages, free on iOS and Android. No cards to carry, no setup. Just the right question when a moment could use a little more honesty.

We built it because the best conversations rarely start with "What do you do?" They start with a better question — and now you'll always have one on hand.

A QUESTION TO CARRY

What is the most interesting thing you have learned recently?
(About yourself or in general.)

Try it on someone today — then just hit reply and tell us their answer. We read every one.

See what's coming:
${appUrl}

See you past the small talk,
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

WaitlistLiveEmail.PreviewProps = {
  appUrl: DEFAULT_APP_URL,
  greeting: 'Hi waitlist friend,',
} satisfies WaitlistLiveProps

// oxlint-disable-next-line import/no-default-export -- required by React Email template discovery
export default WaitlistLiveEmail
