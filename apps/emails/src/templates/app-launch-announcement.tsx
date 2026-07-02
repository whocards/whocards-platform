import {Heading, Hr, Link, Section, Text} from '@react-email/components'
import {buildAppStoreUrl, buildPlayStoreUrl} from '@whocards/app-store'

import {emailBrand} from '../brand'
import {BrandButton, EmailShell} from '../components'

export const appLaunchAnnouncementSubject = "It's live — WhoCards is in your pocket"
export const appLaunchAnnouncementPreview =
  'WhoCards is now on iOS and Android. Download it and start a real conversation today.'

export type AppLaunchAnnouncementProps = Readonly<{
  /**
   * Pre-populated App Store URL (with UTM). Required — no fallback. A missing
   * value must fail the render rather than silently ship a stale CTA (#128).
   */
  appStoreUrl: string
  /**
   * Pre-populated Google Play URL (with UTM). Required — no fallback. A missing
   * value must fail the render rather than silently ship a stale CTA (#128).
   */
  playStoreUrl: string
  /**
   * Opening greeting — use to segment copy by source list.
   * e.g. "Hi waitlist friend," vs "Hi there,"
   */
  greeting?: string
}>

export function AppLaunchAnnouncementEmail({
  appStoreUrl,
  playStoreUrl,
  greeting = 'Hi there,',
}: AppLaunchAnnouncementProps) {
  return (
    <EmailShell preview={appLaunchAnnouncementPreview}>
      <Text style={eyebrow}>IT&apos;S LIVE</Text>
      <Heading style={heading}>Your next good conversation is one tap away.</Heading>
      <Text style={paragraph}>{greeting}</Text>
      <Text style={paragraph}>
        We promised to let you know when WhoCards landed in the stores. It&apos;s here: all 66
        questions, in 14 languages, free on iOS and Android.
      </Text>

      <Section style={questionCard}>
        <Text style={questionLabel}>YOUR FIRST CARD</Text>
        <Text style={question}>What is the most interesting thing you have learned recently?</Text>
        <Text style={questionNote}>(About yourself or in general.)</Text>
      </Section>

      <Text style={paragraph}>
        Open it on a date, a walk, over dinner, or whenever the room could use a little more
        curiosity. Draw a card, ask it, and listen. That&apos;s the whole app.
      </Text>

      <Section style={{margin: '30px 0', textAlign: 'center'}}>
        <BrandButton href={appStoreUrl}>Download on the App Store →</BrandButton>
      </Section>
      <Section style={{margin: '0 0 30px', textAlign: 'center'}}>
        <BrandButton href={playStoreUrl}>Get it on Google Play →</BrandButton>
      </Section>

      <Text style={smallText}>
        Buttons not working?{' '}
        <Link href={appStoreUrl} style={link}>
          Open the App Store
        </Link>
        {' · '}
        <Link href={playStoreUrl} style={link}>
          Open Google Play
        </Link>
      </Text>

      <Text style={{...paragraph, marginTop: '24px'}}>
        Know someone who&apos;d love a better question? Forward this. WhoCards only gets interesting
        when there&apos;s someone else in the conversation.
      </Text>

      <Hr style={rule} />

      <Text style={paragraph}>
        Thanks for being one of the curious people who asked us to keep them posted. We&apos;re glad
        you&apos;re here.
      </Text>
      <Text style={{...paragraph, marginBottom: 0}}>
        See you past the small talk,
        <br />
        The WhoCards team
      </Text>
    </EmailShell>
  )
}

export function appLaunchAnnouncementText({
  appStoreUrl,
  playStoreUrl,
  greeting = 'Hi there,',
}: Required<AppLaunchAnnouncementProps>) {
  return `It's live — WhoCards is in your pocket.

${greeting}

We promised to let you know when WhoCards landed in the stores. It's here: all 66 questions, in 14 languages, free on iOS and Android.

YOUR FIRST CARD

What is the most interesting thing you have learned recently?
(About yourself or in general.)

Open it on a date, a walk, over dinner, or whenever the room could use a little more curiosity. Draw a card, ask it, and listen. That's the whole app.

Download on the App Store:
${appStoreUrl}

Get it on Google Play:
${playStoreUrl}

Know someone who'd love a better question? Forward this. WhoCards only gets interesting when there's someone else in the conversation.

Thanks for being one of the curious people who asked us to keep them posted. We're glad you're here.

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

// Placeholder values live only here, for the React Email preview UI (`email:dev`).
// The send path (render.tsx) must pass real URLs explicitly — see #128.
AppLaunchAnnouncementEmail.PreviewProps = {
  appStoreUrl: buildAppStoreUrl({source: 'email', medium: 'launch_blast'}),
  playStoreUrl: buildPlayStoreUrl({source: 'email', medium: 'launch_blast'}),
  greeting: 'Hi waitlist friend,',
} satisfies AppLaunchAnnouncementProps

// oxlint-disable-next-line import/no-default-export -- required by React Email template discovery
export default AppLaunchAnnouncementEmail
