import {Heading, Hr, Link, Section, Text} from '@react-email/components'

import {emailBrand} from '../brand'
import {BrandButton, BrandCard, EmailShell} from '../components'

export const appLaunchAnnouncementSubject = "It's live — WhoCards is in your pocket"
export const appLaunchAnnouncementPreview =
  'WhoCards is now on iOS and Android. Download it and start a real conversation today.'

// TODO: replace idTODO / cc.whocards.appTODO with real store IDs before sending.
const DEFAULT_APP_STORE_URL =
  'https://apps.apple.com/app/whocards/idTODO?utm_source=email&utm_medium=launch_blast&utm_campaign=launch'
const DEFAULT_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=cc.whocards.appTODO&utm_source=email&utm_medium=launch_blast&utm_campaign=launch'

export type AppLaunchAnnouncementProps = Readonly<{
  /** Pre-populated App Store URL (with UTM). Defaults to placeholder. */
  appStoreUrl?: string
  /** Pre-populated Google Play URL (with UTM). Defaults to placeholder. */
  playStoreUrl?: string
  /**
   * Opening greeting — use to segment copy by source list.
   * e.g. "Hi waitlist friend," vs "Hi there,"
   */
  greeting?: string
}>

export function AppLaunchAnnouncementEmail({
  appStoreUrl = DEFAULT_APP_STORE_URL,
  playStoreUrl = DEFAULT_PLAY_STORE_URL,
  greeting = 'Hi there,',
}: AppLaunchAnnouncementProps) {
  return (
    <EmailShell preview={appLaunchAnnouncementPreview}>
      <Text style={eyebrow}>IT&apos;S LIVE</Text>
      <Heading style={heading}>WhoCards is now in your pocket.</Heading>
      <Text style={paragraph}>{greeting}</Text>
      <Text style={paragraph}>
        We promised to let you know when WhoCards landed in the stores — and here we are. The
        questions that skip the small talk are now available on iOS and Android, free to download.
      </Text>
      <BrandCard>
        <Text style={cardHeading}>Download WhoCards now</Text>
        <Text style={cardText}>
          All 66 questions. Multiple languages. Draw a card, ask it, listen. That&apos;s the whole
          app — and it only gets better when the person across from you is surprised by their own
          answer.
        </Text>
        <Text style={{...cardText, marginBottom: 0}}>
          Whether it&apos;s a date, a team meeting, a family dinner, or just two people on a walk —
          WhoCards helps you move past &quot;What do you do?&quot; toward &quot;Who are you?&quot;
        </Text>
      </BrandCard>

      <Section style={{margin: '30px 0', textAlign: 'center'}}>
        <BrandButton href={appStoreUrl}>Download on the App Store →</BrandButton>
      </Section>
      <Section style={{margin: '0 0 30px', textAlign: 'center'}}>
        <BrandButton href={playStoreUrl}>Get it on Google Play →</BrandButton>
      </Section>

      <Text style={smallText}>
        Buttons not working? App Store:{' '}
        <Link href={appStoreUrl} style={link}>
          {appStoreUrl}
        </Link>
        <br />
        Google Play:{' '}
        <Link href={playStoreUrl} style={link}>
          {playStoreUrl}
        </Link>
      </Text>

      <Text style={{...paragraph, marginTop: '24px'}}>
        Know someone who&apos;d love a good conversation? Forward this — the best thing about
        WhoCards is that it&apos;s better with others.
      </Text>

      <Hr style={rule} />

      <Text style={paragraph}>
        Thanks for being part of this. The list we sent this to was built one curious person at a
        time — we&apos;re glad you&apos;re on it.
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
  appStoreUrl = DEFAULT_APP_STORE_URL,
  playStoreUrl = DEFAULT_PLAY_STORE_URL,
  greeting = 'Hi there,',
}: Required<AppLaunchAnnouncementProps>) {
  return `It's live — WhoCards is in your pocket.

${greeting}

We promised to let you know when WhoCards landed in the stores — and here we are. The questions that skip the small talk are now available on iOS and Android, free to download.

DOWNLOAD WHOCARDS NOW

All 66 questions. Multiple languages. Draw a card, ask it, listen. That's the whole app — and it only gets better when the person across from you is surprised by their own answer.

Whether it's a date, a team meeting, a family dinner, or just two people on a walk — WhoCards helps you move past "What do you do?" toward "Who are you?"

Download on the App Store:
${appStoreUrl}

Get it on Google Play:
${playStoreUrl}

Know someone who'd love a good conversation? Forward this — the best thing about WhoCards is that it's better with others.

Thanks for being part of this. The list we sent this to was built one curious person at a time — we're glad you're on it.

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

AppLaunchAnnouncementEmail.PreviewProps = {
  appStoreUrl: DEFAULT_APP_STORE_URL,
  playStoreUrl: DEFAULT_PLAY_STORE_URL,
  greeting: 'Hi waitlist friend,',
} satisfies AppLaunchAnnouncementProps

// oxlint-disable-next-line import/no-default-export -- required by React Email template discovery
export default AppLaunchAnnouncementEmail
