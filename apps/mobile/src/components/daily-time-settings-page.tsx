import {useRef} from 'react'
import {Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native'

import {SettingsSheetHeader} from '@/components/settings-sheet-header'

const SHEET_MAX_HEIGHT_RATIO = 0.8

const HOURS = Array.from({length: 24}, (_, hour) => hour)

export const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`

type DailyTimeSettingsPageProps = {
  current: number
  onSelect: (hour: number) => void
  onBack: () => void
}

/** The hour the daily question arrives: one page in SettingsModal's pager, whole hours only. */
export const DailyTimeSettingsPage = ({current, onSelect, onBack}: DailyTimeSettingsPageProps) => {
  const scrollRef = useRef<ScrollView>(null)
  const {height: windowHeight} = useWindowDimensions()

  return (
    <View>
      <SettingsSheetHeader title="Daily question time" icon="back" onPress={onBack} />
      <ScrollView
        ref={scrollRef}
        style={{maxHeight: windowHeight * SHEET_MAX_HEIGHT_RATIO}}
        bounces={false}
      >
        {HOURS.map((hour) => {
          const selected = hour === current
          return (
            <Pressable
              key={hour}
              onPress={() => onSelect(hour)}
              // 18:00 sits below the fold, so open with the current hour in view.
              onLayout={
                selected
                  ? (event) =>
                      scrollRef.current?.scrollTo({y: event.nativeEvent.layout.y, animated: false})
                  : undefined
              }
              accessibilityRole="button"
              accessibilityState={{selected}}
              className={`flex-row items-center justify-between px-5 py-4 ${
                selected ? 'bg-yellow-300/40' : ''
              }`}
            >
              <Text className="text-darker dark:text-white font-sans text-lg">
                {formatHour(hour)}
              </Text>
              {selected ? (
                <Text className="text-accentOnLight dark:text-accentOnDark text-lg font-bold">
                  ✓
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
