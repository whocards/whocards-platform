import {Heading, Link, Section, Text} from '@react-email/components'

import {emailBrand} from '../brand'
import {BrandButton, BrandCard, EmailShell} from '../components'

export type AndroidTesterOnboardingProps = Readonly<{
  groupUrl: string
  optInUrl: string
  feedbackUrl: string
}>

export const androidTesterOnboardingSubject = 'Your WhoCards Android testing mission'
export const androidTesterOnboardingPreview =
  'Opt in with your Google account, install WhoCards, and complete one focused test.'

export function AndroidTesterOnboardingEmail({
  groupUrl,
  optInUrl,
  feedbackUrl,
}: AndroidTesterOnboardingProps) {
  return (
    <EmailShell preview={androidTesterOnboardingPreview}>
      <Text style={eyebrow}>ANDROID CLOSED TEST</Text>
      <Heading style={heading}>Your testing mission is ready.</Heading>
      <Text style={paragraph}>
        Thanks for helping unlock the Android launch. Use the same Google account that joined the
        tester group when you open the Play link.
      </Text>
      <BrandCard>
        <Text style={cardHeading}>Four steps</Text>
        <Text style={cardText}>
          1.{' '}
          <Link href={groupUrl} style={link}>
            Join the tester Google Group
          </Link>{' '}
          with your Android phone’s Google account.
        </Text>
        <Text style={cardText}>2. Open the Play opt-in link and choose “Become a tester.”</Text>
        <Text style={cardText}>3. Install WhoCards from Google Play.</Text>
        <Text style={{...cardText, marginBottom: 0}}>
          4. Play one deck, switch language once, share a card, then tell us what felt confusing.
        </Text>
      </BrandCard>
      <Section style={buttonSection}>
        <BrandButton href={optInUrl}>Opt in and install →</BrandButton>
      </Section>
      <Text style={smallText}>
        Stay opted in for the full 14 days—leaving resets your qualifying time.
      </Text>
      <Text style={paragraph}>
        Finished the mission?{' '}
        <Link href={feedbackUrl} style={link}>
          Send feedback here
        </Link>
        .
      </Text>
    </EmailShell>
  )
}

export function androidTesterOnboardingText({
  groupUrl,
  optInUrl,
  feedbackUrl,
}: AndroidTesterOnboardingProps) {
  return `Your WhoCards Android testing mission is ready.

Use the same Google account that joined the tester group when you open the Play link.

1. Join the tester Google Group with your Android phone’s Google account: ${groupUrl}
2. Open the Play opt-in link and choose “Become a tester.”
3. Install WhoCards from Google Play.
4. Play one deck, switch language once, share a card, then tell us what felt confusing.

Opt in and install: ${optInUrl}
Send feedback: ${feedbackUrl}

Stay opted in for the full 14 days—leaving resets your qualifying time.`
}

export type AndroidTesterCheckInProps = Readonly<{feedbackUrl: string}>
export const androidTesterCheckInSubject = 'One week with WhoCards — what got in the way?'

export function AndroidTesterCheckInEmail({feedbackUrl}: AndroidTesterCheckInProps) {
  return (
    <EmailShell preview="A quick day-7 check-in for the WhoCards Android Closed Test.">
      <Text style={eyebrow}>DAY 7 CHECK-IN</Text>
      <Heading style={heading}>What got in the way?</Heading>
      <Text style={paragraph}>Thank you for keeping WhoCards installed and staying opted in.</Text>
      <BrandCard>
        <Text style={{...cardText, marginBottom: 0}}>
          One focused question: what was the most confusing or frustrating moment while using the
          app?
        </Text>
      </BrandCard>
      <Section style={buttonSection}>
        <BrandButton href={feedbackUrl}>Share your answer →</BrandButton>
      </Section>
      <Text style={smallText}>
        Please remain opted in until we confirm the 14-day test is complete.
      </Text>
    </EmailShell>
  )
}

export function androidTesterCheckInText({feedbackUrl}: AndroidTesterCheckInProps) {
  return `One week with WhoCards — thank you for staying opted in.

What was the most confusing or frustrating moment while using the app?
Share your answer: ${feedbackUrl}

Please remain opted in until we confirm the 14-day test is complete.`
}

export const androidTesterCompletionSubject = 'You helped unlock the WhoCards Android launch'

export function AndroidTesterCompletionEmail() {
  return (
    <EmailShell preview="The Android Closed Test is complete—thank you for helping WhoCards launch.">
      <Text style={eyebrow}>TEST COMPLETE</Text>
      <Heading style={heading}>You helped unlock the launch.</Heading>
      <Text style={paragraph}>
        The 14-day Closed Test is complete. Thank you for testing the critical journey, sharing
        honest feedback, and sticking with us through the full window.
      </Text>
      <Text style={paragraph}>
        We’ll keep you in the tester cohort for early access to future releases. This does not add
        you to the general newsletter.
      </Text>
    </EmailShell>
  )
}

export const androidTesterCompletionText = () => `You helped unlock the WhoCards Android launch.

The 14-day Closed Test is complete. Thank you for testing the critical journey, sharing honest feedback, and sticking with us through the full window.

We’ll keep you in the tester cohort for early access to future releases. This does not add you to the general newsletter.`

const eyebrow = {
  color: emailBrand.colors.accent,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  margin: 0,
}
const heading = {
  color: emailBrand.colors.ink,
  fontFamily: emailBrand.fonts.title,
  fontSize: '38px',
  fontWeight: 800,
  lineHeight: '44px',
  margin: '8px 0 22px',
}
const paragraph = {
  color: emailBrand.colors.ink,
  fontSize: '17px',
  lineHeight: '27px',
  margin: '0 0 18px',
}
const cardHeading = {
  color: emailBrand.colors.accent,
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 12px',
}
const cardText = {
  color: emailBrand.colors.ink,
  fontSize: '16px',
  lineHeight: '25px',
  margin: '0 0 12px',
}
const buttonSection = {margin: '30px 0', textAlign: 'center' as const}
const smallText = {
  color: emailBrand.colors.inkMuted,
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 24px',
  textAlign: 'center' as const,
}
const link = {color: emailBrand.colors.accent, textDecoration: 'underline'}

AndroidTesterOnboardingEmail.PreviewProps = {
  groupUrl: 'https://groups.google.com/g/example-testers',
  optInUrl: 'https://play.google.com/apps/testing/example',
  feedbackUrl: 'https://example.com/feedback',
} satisfies AndroidTesterOnboardingProps
AndroidTesterCheckInEmail.PreviewProps = {
  feedbackUrl: 'https://example.com/feedback',
} satisfies AndroidTesterCheckInProps
