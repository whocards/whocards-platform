import {Heading, Text} from '@react-email/components'

import {emailBrand} from '../brand'
import {BrandButton, EmailShell} from '../components'

export type MagicLinkEmailProps = Readonly<{
  url: string
}>

export const magicLinkSubject = 'Sign in to WhoCards @ Work'
export const magicLinkPreview = 'Your sign-in link for WhoCards @ Work'

export function MagicLinkEmail({url}: MagicLinkEmailProps) {
  return (
    <EmailShell preview={magicLinkPreview}>
      <Text style={eyebrow}>SIGN IN</Text>
      <Heading style={heading}>One click and you&apos;re in.</Heading>
      <Text style={body}>
        Use the button below to sign in to WhoCards @ Work. This link expires shortly and can only
        be used once.
      </Text>
      <BrandButton href={url}>Sign in</BrandButton>
      <Text style={smallText}>
        Didn&apos;t request this? You can safely ignore this email — no account changes were made.
      </Text>
    </EmailShell>
  )
}

export function magicLinkText({url}: MagicLinkEmailProps) {
  return `Sign in to WhoCards @ Work

Use this link to sign in (expires shortly, single use):
${url}

Didn't request this? You can safely ignore this email.`
}

const heading = {
  color: emailBrand.colors.ink,
  fontFamily: emailBrand.fonts.title,
  fontSize: '28px',
  fontWeight: 800,
  letterSpacing: '-0.5px',
  lineHeight: '34px',
  margin: '8px 0 16px',
}
const eyebrow = {
  color: emailBrand.colors.accent,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  margin: 0,
}
const body = {
  color: emailBrand.colors.ink,
  fontSize: '16px',
  lineHeight: '25px',
  margin: '0 0 24px',
}
const smallText = {
  color: emailBrand.colors.inkMuted,
  fontSize: '12px',
  lineHeight: '18px',
  margin: '24px 0 0',
}
