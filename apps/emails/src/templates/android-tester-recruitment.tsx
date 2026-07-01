import {Heading, Hr, Link, Section, Text} from '@react-email/components'

import {emailBrand} from '../brand'
import {BrandButton, BrandCard, EmailShell} from '../components'

export const androidTesterRecruitmentSubject = 'The WhoCards app is almost here — want in early?'
export const androidTesterRecruitmentPreview =
  'We’re looking for Android testers to help shape the first WhoCards app release.'

export type AndroidTesterRecruitmentProps = Readonly<{signupUrl?: string}>

export function AndroidTesterRecruitmentEmail({
  signupUrl = 'https://whocards.cc',
}: AndroidTesterRecruitmentProps) {
  return (
    <EmailShell preview={androidTesterRecruitmentPreview}>
      <Text style={eyebrow}>THE APP IS COMING</Text>
      <Heading style={heading}>WhoCards is about to fit in your pocket.</Heading>
      <Text style={paragraph}>
        We’re getting the first WhoCards mobile release ready: the questions that skip the small
        talk, now close at hand whenever a conversation could use a little spark.
      </Text>
      <BrandCard>
        <Text style={cardHeading}>Android people, we need you.</Text>
        <Text style={cardText}>
          Join our early tester crew and help us catch the awkward bits before launch. Try a deck,
          draw some questions, switch languages, share a card—and tell us what feels delightful or
          confusing.
        </Text>
        <Text style={{...cardText, marginBottom: 0}}>
          You don’t need to be technical. Curiosity, an Android phone, and a willingness to press
          buttons are perfect.
        </Text>
      </BrandCard>
      <Text style={paragraph}>
        Sign up now and we’ll send you the private download and installation link as soon as the
        first test release is available. You’ll need to open it with the same Google account you use
        on your Android phone.
      </Text>
      <Section style={{margin: '30px 0', textAlign: 'center'}}>
        <BrandButton href={signupUrl}>Count me in →</BrandButton>
      </Section>
      <Text style={smallText}>
        Button not working? Open this link:{' '}
        <Link href={signupUrl} style={link}>
          {signupUrl}
        </Link>
      </Text>
      <Text style={{...paragraph, marginTop: '24px'}}>
        Know another Android person who loves a good conversation? Forward this their way—the more
        curious button-pressers, the better.
      </Text>
      <Hr style={rule} />
      <Text style={paragraph}>
        Thanks for helping us bring better questions into more rooms, walks, dinners, dates, and
        gloriously long conversations.
      </Text>
      <Text style={{...paragraph, marginBottom: 0}}>
        See you past the small talk,
        <br />
        The WhoCards team
      </Text>
    </EmailShell>
  )
}

export function androidTesterRecruitmentText({signupUrl}: Required<AndroidTesterRecruitmentProps>) {
  return `WhoCards is about to fit in your pocket.

We’re getting the first WhoCards mobile release ready: the questions that skip the small talk, now close at hand whenever a conversation could use a little spark.

ANDROID PEOPLE, WE NEED YOU.

Join our early tester crew and help us catch the awkward bits before launch. Try a deck, draw some questions, switch languages, share a card—and tell us what feels delightful or confusing.

You don’t need to be technical. Curiosity, an Android phone, and a willingness to press buttons are perfect.

Sign up now and we’ll send you the private download and installation link as soon as the first test release is available:
${signupUrl}

You’ll need to open the testing link with the same Google account you use on your Android phone.

Know another Android person who loves a good conversation? Forward this their way—the more curious button-pressers, the better.

Thanks for helping us bring better questions into more rooms, walks, dinners, dates, and gloriously long conversations.

See you past the small talk,
The WhoCards team

WhoCards helps people move past “What do you do?” toward “Who are you?”
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
const cardHeading = {
  color: emailBrand.colors.accent,
  fontSize: '22px',
  fontWeight: 700,
  lineHeight: '28px',
  margin: '0 0 12px',
}
const cardText = {
  color: emailBrand.colors.ink,
  fontSize: '16px',
  lineHeight: '25px',
  margin: '0 0 14px',
}
const smallText = {
  color: emailBrand.colors.inkMuted,
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
  textAlign: 'center' as const,
  wordBreak: 'break-all' as const,
}
const link = {color: emailBrand.colors.accent, textDecoration: 'underline'}
const rule = {borderColor: emailBrand.colors.cardMuted, margin: '30px 0'}

AndroidTesterRecruitmentEmail.PreviewProps = {
  signupUrl: 'https://whocards.cc/android-testers',
} satisfies AndroidTesterRecruitmentProps

// oxlint-disable-next-line import/no-default-export -- required by React Email template discovery
export default AndroidTesterRecruitmentEmail
