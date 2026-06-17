// Loaded by Tailwind/NativeWind via jiti (which transpiles this and the imported
// @whocards/tokens source on the fly). Excluded from `tsc` typecheck because the
// nativewind preset ships loose types — see tsconfig.json "exclude".
import {tailwindPreset} from '@whocards/tokens/tailwind-preset'
import nativewindPreset from 'nativewind/preset'

const config = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [nativewindPreset, tailwindPreset],
}

export default config
