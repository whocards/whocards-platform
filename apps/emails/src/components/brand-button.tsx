import {Button} from '@react-email/components'

import {emailBrand} from '../brand'

type BrandButtonProps = Readonly<{children: React.ReactNode; href: string}>

export function BrandButton({children, href}: BrandButtonProps) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: emailBrand.colors.accent,
        borderRadius: '999px',
        color: emailBrand.colors.accentInk,
        display: 'inline-block',
        fontFamily: emailBrand.fonts.sans,
        fontSize: '18px',
        fontWeight: 700,
        lineHeight: '24px',
        padding: '15px 28px',
        textAlign: 'center',
        textDecoration: 'none',
      }}
    >
      {children}
    </Button>
  )
}
