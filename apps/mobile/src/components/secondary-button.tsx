import type {ReactNode} from 'react'
import {Text} from 'react-native'

import {PressableScale} from '@/components/pressable-scale'
import {impact} from '@/lib/haptics'

type SecondaryButtonProps = {
  label: string
  icon?: ReactNode
  onPress: () => void
  accessibilityLabel?: string
}

/**
 * The app's secondary-button — didn't exist before issue #176. Ported from the
 * website's `.btn-secondary` (apps/website/src/styles/base.css): a filled gray
 * pill (`bg-gray`/`colors.gray.DEFAULT`), white label, that turns yellow on
 * press (`hover:text-yellow-500` on web — there's no hover on a touchscreen, so
 * this reads it off the press state via NativeWind's `group`/`group-active:`
 * pair instead). The website pairs `.btn-primary`/`.btn-secondary` as two
 * filled pill CTAs distinguished by colour, not outline-vs-filled (see
 * `apps/website/src/pages/404.astro`'s "Go to homepage" / "Go Back") — that's
 * the pattern this component ports, deliberately more visually weighted than
 * the app's other "quiet secondary control" (an outline chip, DESIGN.md's
 * default). The Settings entry point needs that extra weight: being the
 * single, only-here home for every setting is the whole point of #176, and an
 * easy-to-miss outline chip is exactly what got Tabletop mode lost twice
 * before this issue (see #176's "Why").
 *
 * Not itself theme-aware (no `dark:` variants) — like the Play button, it's a
 * fixed-colour CTA that sits on top of whichever canvas is themed underneath
 * it, not a piece of chrome that themes itself.
 */
export const SecondaryButton = ({
  label,
  icon,
  onPress,
  accessibilityLabel,
}: SecondaryButtonProps) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    onPress={() => {
      impact('light')
      onPress()
    }}
    className="group active:bg-gray bg-gray w-full flex-row items-center justify-center gap-2 rounded-full py-4"
  >
    {icon}
    <Text className="group-active:text-yellow-500 font-sans text-base font-bold text-white">
      {label}
    </Text>
  </PressableScale>
)
