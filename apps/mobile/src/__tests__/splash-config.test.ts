/**
 * Config + asset guard for the Android splash fix (#100).
 *
 * The original splash used the full 1200x226 wordmark; under Android 12's bounded
 * (circularly masked) splash-icon region that wide image was clipped on the sides.
 * The fix points Android at a padded, near-square asset via the plugin's `android`
 * override. The native splash itself can't be screenshotted reliably (it's dismissed
 * before any e2e command runs), so these assertions lock the fix at the config/asset
 * level: an edit that reverts Android to a wide image — which clips again — fails here.
 */
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

import appJson from '../../app.json'

type SplashOptions = {
  android?: {image?: string; imageWidth?: number}
}

// PNG dimensions live in the IHDR chunk: big-endian uint32 width @ byte 16, height @ 20
// (8-byte signature + 8-byte chunk length/type header precede them).
const pngSize = (path: string) => {
  const buf = readFileSync(path)
  return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)}
}

const splashEntry = (appJson.expo.plugins as unknown[]).find(
  (p): p is [string, SplashOptions] => Array.isArray(p) && p[0] === 'expo-splash-screen'
)

describe('Android splash config (#100)', () => {
  it('configures an Android-specific splash image override', () => {
    expect(splashEntry).toBeDefined()
    expect(splashEntry?.[1].android?.image).toBe('./assets/images/splash-logo-android.png')
  })

  it('uses a near-square Android splash asset so the logo stays inside the icon region', () => {
    const rel = splashEntry?.[1].android?.image
    expect(rel).toBeDefined()
    const {width, height} = pngSize(join(__dirname, '../../', rel as string))
    // Near-square keeps the wordmark padded well within Android 12's inscribed splash
    // circle; a wide aspect (like the raw 1200x226 wordmark, ~5.3) is what clipped.
    const aspect = width / height
    expect(aspect).toBeGreaterThan(0.9)
    expect(aspect).toBeLessThan(1.1)
  })
})
