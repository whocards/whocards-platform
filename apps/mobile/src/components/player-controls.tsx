import {View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'

import {ControlButton} from './control-button'

type PlayerControlsProps = {
  language: string
  showLanguage: boolean
  canPrevious: boolean
  onPrevious: () => void
  onNext: () => void
  onLanguage: () => void
  onExit: () => void
}

/**
 * The player's native-style bottom toolbar: a translucent dark surface with a hairline
 * top border that runs to the screen edge (its own safe-area padding sits the controls
 * above the home indicator). Exit is set apart on the left; Prev / Language / Next are
 * grouped on the right — every button shares the one {@link ControlButton} treatment.
 */
export const PlayerControls = ({
  language,
  showLanguage,
  canPrevious,
  onPrevious,
  onNext,
  onLanguage,
  onExit,
}: PlayerControlsProps) => {
  const insets = useSafeAreaInsets()

  return (
    <View
      className="flex-row items-center justify-between border-t border-white/10 bg-darker/80 px-5 pt-3"
      style={{paddingBottom: Math.max(insets.bottom, 14)}}
    >
      <ControlButton icon="close" accessibilityLabel="exit deck" onPress={onExit} />

      <View className="flex-row items-center gap-3">
        <ControlButton
          icon="chevron-back"
          accessibilityLabel="previous question"
          onPress={onPrevious}
          disabled={!canPrevious}
        />
        {showLanguage ? (
          <ControlButton
            label={language}
            accessibilityLabel="change language"
            onPress={onLanguage}
          />
        ) : null}
        <ControlButton icon="chevron-forward" accessibilityLabel="next question" onPress={onNext} />
      </View>
    </View>
  )
}
