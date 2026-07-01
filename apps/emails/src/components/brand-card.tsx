import {Section} from '@react-email/components'

import {emailBrand} from '../brand'

export function BrandCard({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <Section
      style={{
        backgroundColor: emailBrand.colors.card,
        border: `1px solid ${emailBrand.colors.cardMuted}`,
        borderRadius: '20px',
        margin: '28px 0',
        padding: '24px',
      }}
    >
      {children}
    </Section>
  )
}
