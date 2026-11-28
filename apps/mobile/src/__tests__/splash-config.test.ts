/**
 * Config guard for the splash → landing handoff.
 *
 * Android 12+ draws the splash icon on a 288dp canvas and masks it to a 192dp circle, so the
 * 280dp wordmark iOS shows would be clipped there (#100). Android draws it narrower instead, and
 * the landing logo starts at whatever width each splash draws so the handoff never jumps.
 * The native splash can't be screenshotted reliably, so these lock it at the config level.
 */
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

import {SPLASH_LOGO_WIDTH} from '@/lib/splash-logo'

import appJson from '../../app.json'

type SplashOptions = {
  image: string
  imageWidth: number
  android?: {image?: string; imageWidth?: number}
}

// PNG dimensions live in the IHDR chunk: big-endian uint32 width @ byte 16, height @ 20.
const pngSize = (path: string) => {
  const buf = readFileSync(path)
  return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)}
}

const splash = (appJson.expo.plugins as unknown[]).find(
  (p): p is [string, SplashOptions] => Array.isArray(p) && p[0] === 'expo-splash-screen'
)![1]

describe('splash config', () => {
  it('draws the wordmark at the widths the landing logo starts from', () => {
    expect(splash.imageWidth).toBe(SPLASH_LOGO_WIDTH.ios)
    expect(splash.android?.imageWidth).toBe(SPLASH_LOGO_WIDTH.android)
    // A padded Android image would shrink the wordmark below imageWidth.
    expect(splash.android?.image).toBeUndefined()
  })

  it("keeps Android's wordmark inside the 192dp splash circle", () => {
    const {width, height} = pngSize(join(__dirname, '../../', splash.image))
    const w = SPLASH_LOGO_WIDTH.android
    expect(Math.hypot(w, (w * height) / width)).toBeLessThanOrEqual(192)
  })
})
