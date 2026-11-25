import {Heading, Hr, Link, Text} from '@react-email/components'

import {emailBrand} from '../brand'
import {EmailShell} from '../components'

export type ContactMessageProps = Readonly<{
  name: string
  email: string
  message: string
  /** What the message is about, as the form labels it (e.g. "Android test"). */
  about?: string
  /** The app's platform and version, when sent from the app's Send feedback link. */
  platform?: string
  version?: string
}>

export const contactMessageSubject = (name: string, about?: string) =>
  about ? `Contact form (${about}): ${name}` : `Contact form: ${name}`

const sentFrom = ({platform, version}: ContactMessageProps) =>
  [platform, version].filter(Boolean).join(' ')
export const contactMessagePreview = (name: string) => `New contact message from ${name}`

export function ContactMessageEmail(props: ContactMessageProps) {
  const {name, email, message, about} = props
  const app = sentFrom(props)
  return (
    <EmailShell preview={contactMessagePreview(name)}>
      <Text style={eyebrow}>NEW CONTACT MESSAGE</Text>
      <Heading style={heading}>{name} got in touch.</Heading>
      <Text style={label}>Email</Text>
      <Text style={value}>
        <Link href={`mailto:${email}`} style={link}>
          {email}
        </Link>
      </Text>
      {about ? (
        <>
          <Text style={label}>About</Text>
          <Text style={value}>{about}</Text>
        </>
      ) : null}
      {app ? (
        <>
          <Text style={label}>App</Text>
          <Text style={value}>{app}</Text>
        </>
      ) : null}
      <Hr style={rule} />
      <Text style={label}>Message</Text>
      {message.split('\n').map((line, index) => (
        <Text key={index} style={value}>
          {line === '' ? ' ' : line}
        </Text>
      ))}
      <Hr style={rule} />
      <Text style={smallText}>Sent via the contact form at whocards.cc/contact</Text>
    </EmailShell>
  )
}

export function contactMessageText(props: ContactMessageProps) {
  const {name, email, message, about} = props
  const app = sentFrom(props)
  return `New contact message from ${name}

Email: ${email}${about ? `\nAbout: ${about}` : ''}${app ? `\nApp: ${app}` : ''}

Message:
${message}

— Sent via the contact form at whocards.cc/contact`
}

const heading = {
  color: emailBrand.colors.ink,
  fontFamily: emailBrand.fonts.title,
  fontSize: '28px',
  fontWeight: 800,
  letterSpacing: '-0.5px',
  lineHeight: '34px',
  margin: '8px 0 22px',
}
const eyebrow = {
  color: emailBrand.colors.accent,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '1.5px',
  margin: 0,
}
const label = {
  color: emailBrand.colors.accent,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
}
const value = {
  color: emailBrand.colors.ink,
  fontSize: '16px',
  lineHeight: '25px',
  margin: '0 0 6px',
}
const smallText = {
  color: emailBrand.colors.inkMuted,
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
}
const link = {color: emailBrand.colors.accent, textDecoration: 'underline'}
const rule = {borderColor: emailBrand.colors.cardMuted, margin: '20px 0'}
