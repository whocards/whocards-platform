import {APP_VISIBLE} from './app'
import {websiteNextUrl} from './urls'

export type Link = {
  href: string
  title: string
  button?: boolean
  icon?: string
  play?: boolean
  external?: boolean
  /** Give a plain nav link a subtle on-brand "pop" (used for the app CTA). */
  pop?: boolean
}

export const mainLinks: Link[] = [
  {href: '/#what-is-whocards', title: 'About'},
  {href: '/play', title: 'Play', play: true},
  {href: '/print', title: 'Print'},
  // Only surface the /app entry when the funnel is visible (a store is live or the
  // waitlist is open). `pop` gives it a tasteful on-brand glow in the nav.
  ...(APP_VISIBLE ? [{href: '/app', title: 'Get the App', pop: true} as Link] : []),
  // {href: donationUrl, title: 'Donate', external: true},
  {href: '/request-cards', title: 'Request Cards', button: true},
]

// Rendered as the "Events" dropdown. One entry per edition; the landing page is
// the same shape, distinguished by year.
export const eventLinks: Link[] = [
  {href: '/events/hajnalig', title: 'Hajnalig 2026'},
  {href: '/events/hajnalig/2025', title: 'Hajnalig 2025'},
]

export const eventMainLinks: Link[] = [
  // {href: donationUrl, title: 'Donate', external: true},
  {href: '/request-cards', title: 'Request Cards', button: true},
]

export const socialLinks: Link[] = [
  {icon: 'mdi:linkedin', title: 'Linkedin', href: 'https://www.linkedin.com/company/whocards'},
  // { icon: 'mdi:twitter', href: 'https://twitter.com/whocards' },
  {icon: 'entypo-social:facebook', title: 'Facebook', href: 'https://facebook.com/whocards'},
  {icon: 'mdi:instagram', title: 'Instagram', href: 'https://instagram.com/who_cards'},
]

export const contactLinks: Link[] = [
  ...socialLinks,
  {icon: 'mdi:email', title: 'Email', href: 'mailto:hello@whocards.cc'},
  {icon: 'mdi:github', title: 'Github', href: 'https://github.com/whocards'},
]

export const legalLinks: Link[] = [
  {title: 'Contact', href: '/contact'},
  {title: 'Privacy Policy', href: '/legal/pp'},
  {title: 'Login', href: websiteNextUrl},
]
