import type {ReactNode} from 'react'
import {ImageBackground} from 'react-native'
import {colors} from '@whocards/tokens'

// Rasterized from the website's public/background.svg (the bg-hero texture).
const texture = require('../../assets/images/background.png')

type ScreenBackgroundProps = {children: ReactNode}

/** Full-screen WhoCards backdrop: the web's dark hero texture over the darkest base. */
export const ScreenBackground = ({children}: ScreenBackgroundProps) => (
  <ImageBackground
    source={texture}
    resizeMode="cover"
    style={{flex: 1, backgroundColor: colors.darkest}}
  >
    {children}
  </ImageBackground>
)
