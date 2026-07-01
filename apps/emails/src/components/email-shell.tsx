import {Body, Container, Head, Html, Link, Preview, Section, Text} from '@react-email/components'

import {emailBrand} from '../brand'

export function EmailShell({
  children,
  preview,
}: Readonly<{children: React.ReactNode; preview: string}>) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: emailBrand.colors.background,
          fontFamily: emailBrand.fonts.sans,
          margin: 0,
          padding: '32px 12px',
        }}
      >
        <Container style={{margin: '0 auto', maxWidth: '600px'}}>
          <Section style={{padding: '8px 8px 24px'}}>
            <Text
              style={{
                color: emailBrand.colors.accent,
                fontFamily: emailBrand.fonts.title,
                fontSize: '24px',
                fontWeight: 800,
                letterSpacing: '-0.5px',
                margin: 0,
              }}
            >
              WhoCards<span style={{color: emailBrand.colors.secondaryAccent}}>?</span>
            </Text>
          </Section>
          <Section
            style={{
              backgroundColor: emailBrand.colors.card,
              borderRadius: '24px',
              padding: '32px 28px',
            }}
          >
            {children}
          </Section>
          <Text
            style={{
              color: emailBrand.colors.inkMuted,
              fontSize: '12px',
              lineHeight: '18px',
              margin: '24px 8px 0',
              textAlign: 'center',
            }}
          >
            WhoCards helps people move past “What do you do?” toward “Who are you?”
            <br />
            <Link href="https://whocards.cc" style={{color: emailBrand.colors.accent}}>
              whocards.cc
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
