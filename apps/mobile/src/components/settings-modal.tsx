import {Ionicons} from '@expo/vector-icons'
import {BottomSheet, Host, RNHostView, Switch} from '@expo/ui'
import {DateTimePicker} from '@expo/ui/community/datetime-picker'
import type {ReactNode} from 'react'
import {createContext, useContext, useEffect, useRef, useState} from 'react'
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import type {GameId} from '@whocards/decks'
import {DEFAULT_GAME, getLanguageName} from '@whocards/decks'
import {EVENTS, track} from '@whocards/observability/events'
import {colors} from '@whocards/tokens'

import {Choice} from '@/components/choice'
import {SegmentedControl} from '@/components/segmented-control'
import {useIsDark} from '@/lib/color-scheme'
import {buildFeedbackUrl} from '@/lib/feedback-url'
import {getStoredGame, setStoredGame} from '@/lib/game-store'
import {selection} from '@/lib/haptics'
import {GAME_CATALOG} from '@/lib/games'
import {
  deviceLanguage,
  getStoredLanguage,
  getStoredSecondaryLanguages,
  setStoredLanguage,
  setStoredSecondaryLanguages,
} from '@/lib/language-store'
import type {DailySetting} from '@/lib/notification-store'
import {
  DAILY_HOUR,
  getDailySetting,
  notificationsAllowed,
  openNotificationSetting,
  refillDailyQuestions,
  setDailySetting,
} from '@/lib/notification-store'
import {getStoredCardAnimation, setStoredCardAnimation} from '@/lib/card-animation-store'
import type {CardAnimation} from '@/lib/card-animation-store'
import {sheetTheme} from '@/lib/sheet-theme'
import {getStoredTabletopMode, setStoredTabletopMode} from '@/lib/tabletop-store'
import type {ThemeSetting} from '@/lib/theme-store'

const THEME_OPTIONS = [
  {value: 'system', label: 'System'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
] as const satisfies readonly {value: ThemeSetting; label: string}[]

const CARD_ANIMATION_OPTIONS = [
  {value: 'slide', label: 'Slide'},
  {value: 'flip', label: 'Flip'},
] as const satisfies readonly {value: CardAnimation; label: string}[]

const GAME_OPTIONS = GAME_CATALOG.map((game) => ({value: game.id, label: game.title}))

// Caps the rows at this fraction of the window; they only scroll under max Dynamic Type or in landscape.
const SHEET_MAX_HEIGHT_RATIO = 0.8

// After an X close, stage changes wait out the sheet's native teardown (~100ms block ending ~690ms in).
export const SHEET_CLOSE_MS = 720

const languageName = (code: string) => getLanguageName(code) ?? code

const formatTime = ({hour, minute}: Pick<DailySetting, 'hour' | 'minute'>) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

type SettingsModalProps = {
  visible: boolean
  /** `sheetGone` when iOS reports the sheet fully dismissed (a swipe-down); an X close gets no report. */
  onClose: (sheetGone?: boolean) => void
  /** The deck whose languages the Language rows edit: they are stored per deck. */
  deckSlug: string
  languages: string[]
  theme: ThemeSetting
  onSelectTheme: (theme: ThemeSetting) => void
  /** The Game on screen, when it can differ from the stored one (a deep link always opens Classic). */
  currentGame?: GameId
  /** Every Game pick; the play screens switch player once the sheet closes. */
  onSelectGame?: (game: GameId) => void
  /** The language on screen, when it can differ from the stored one (a shared link's). */
  currentLanguage?: string
  /** Every Language pick, even one equal to the stored value. */
  onSelectLanguage?: (language: string) => void
  /** Window x of the edges the rows line up with (the Card's, in Card view); the sheet's own otherwise. */
  alignTo?: {left: number; right: number}
}

/** Where the rows' visible left and right edges sit, in points from the window's edges. */
type Inset = {left: number; right: number}
const DEFAULT_INSET: Inset = {left: 26, right: 26}
const RowInset = createContext<Inset>(DEFAULT_INSET)

type Trailing = 'picker' | 'switch' | 'segmented' | 'close' | 'none'
// Where each piece is drawn relative to its layout edge inside the iOS 26 sheet (measured on device).
const DRAWN_AT: Record<Trailing | 'label', number> =
  Platform.OS === 'ios'
    ? {label: 8, picker: -21.3, switch: -5.7, segmented: -7.7, close: -13.7, none: 0}
    : {label: 0, picker: 0, switch: 0, segmented: 0, close: 0, none: 0}

/** Puts a row's label and trailing control on the shared edges (the Card's, in Card view). */
const useEdges = (trailing: Trailing) => {
  const inset = useContext(RowInset)
  return {
    row: {paddingLeft: inset.left - DRAWN_AT.label, paddingRight: inset.right},
    trailing: {marginRight: DRAWN_AT[trailing]},
  }
}

type RowProps = {
  label: string
  hint?: string
  last?: boolean
  trailing?: Trailing
  children: ReactNode
}

/** One setting: its label on the left, its control inline on the right. Every row shares one min height. */
const Row = ({label, hint, last = false, trailing = 'none', children}: RowProps) => {
  const edges = useEdges(trailing)
  return (
    <View
      className={`border-gray-lighter dark:border-white/10 min-h-14 flex-row items-center justify-between gap-3 py-2 ${
        last ? '' : 'border-b'
      }`}
      style={edges.row}
    >
      <View className="flex-1">
        <Text className="text-darker dark:text-white font-sans text-lg">{label}</Text>
        {hint ? (
          <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">{hint}</Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-3" style={edges.trailing}>
        {children}
      </View>
    </View>
  )
}

const Header = ({onClose, isDark}: {onClose: () => void; isDark: boolean}) => {
  const edges = useEdges('close')
  return (
    <View className="flex-row items-center justify-between pb-2 pt-6" style={edges.row}>
      <Text className="text-darker dark:text-white font-title text-2xl">Settings</Text>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="close"
        hitSlop={12}
        style={edges.trailing}
      >
        <Ionicons name="close" size={24} color={isDark ? colors.white : colors.darker} />
      </Pressable>
    </View>
  )
}

type NativeProps = {isDark: boolean}

type ToggleProps = NativeProps & {label: string; value: boolean; onChange: (value: boolean) => void}

// The native switch carries no label of its own, so the wrapper is the screen reader's switch.
const Toggle = ({label, value, onChange, isDark}: ToggleProps) => (
  <View
    accessible
    accessibilityRole="switch"
    accessibilityLabel={label}
    accessibilityState={{checked: value}}
    accessibilityActions={[{name: 'activate'}]}
    onAccessibilityAction={() => onChange(!value)}
  >
    <Host matchContents colorScheme={isDark ? 'dark' : 'light'} seedColor={accent(isDark)}>
      <Switch value={value} onValueChange={onChange} />
    </Host>
  </View>
)

const accent = (isDark: boolean) => (isDark ? colors.accentOnDark : colors.accentOnLight)

/**
 * The one settings menu, behind the home screen's Settings button and the play bar's gear: the
 * platform's own bottom sheet (Liquid Glass on iOS, Material on Android), one screen, every
 * control inline. Game and the two languages are a Choice each (choice.tsx); Tabletop mode and Daily
 * question are native switches; the Daily question time is the system time picker.
 */
export const SettingsModal = ({
  visible,
  onClose,
  deckSlug,
  languages,
  theme,
  onSelectTheme,
  currentGame,
  onSelectGame,
  currentLanguage,
  onSelectLanguage,
  alignTo,
}: SettingsModalProps) => {
  const isDark = useIsDark()
  const mutedColor = isDark ? colors.gray.dark : colors.mutedOnLight
  const {height: windowHeight, width: windowWidth} = useWindowDimensions()
  const inset: Inset = alignTo
    ? {left: alignTo.left, right: windowWidth - alignTo.right}
    : DEFAULT_INSET

  const [game, setGame] = useState<GameId>(DEFAULT_GAME)
  const [language, setLanguage] = useState(() => deviceLanguage(languages))
  const [secondary, setSecondary] = useState<string[]>([])
  const lastSecondary = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (secondary[0]) lastSecondary.current = secondary[0]
  }, [secondary])
  const [tabletop, setTabletop] = useState(false)
  const [cardAnimation, setCardAnimation] = useState<CardAnimation>('slide')
  const [daily, setDaily] = useState<DailySetting>({enabled: true, hour: DAILY_HOUR, minute: 0})
  const [allowed, setAllowed] = useState(true)
  // Android's time picker is a dialog, opened from the time chip.
  const [timeOpen, setTimeOpen] = useState(false)
  const mounted = useRef(false)

  // Reload on every open: another screen's sheet may have changed them since.
  useEffect(() => {
    if (currentLanguage) setLanguage(currentLanguage)
    if (mounted.current && !visible) return
    mounted.current = true
    if (currentGame) setGame(currentGame)
    else void getStoredGame().then(setGame)
    void getStoredTabletopMode().then(setTabletop)
    void getStoredCardAnimation().then(setCardAnimation)
    void getDailySetting().then(setDaily)
    void notificationsAllowed().then(setAllowed, () => {})
    if (!currentLanguage) {
      void getStoredLanguage(deckSlug).then((stored) => {
        if (stored && languages.includes(stored)) setLanguage(stored)
      })
    }
    void getStoredSecondaryLanguages(deckSlug).then((stored) =>
      setSecondary(stored.filter((code) => languages.includes(code)))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckSlug, visible, currentLanguage])

  // Coming back from the OS setting with the sheet still open: show the new permission and schedule.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !visible) return
      void notificationsAllowed().then(setAllowed, () => {})
      void refillDailyQuestions().catch(() => {})
    })
    return () => sub.remove()
  }, [visible])

  const changeDaily = (next: DailySetting) => {
    setDaily(next)
    void setDailySetting(next).catch(() => {})
  }

  const changeTime = (date: Date) =>
    changeDaily({...daily, hour: date.getHours(), minute: date.getMinutes()})

  const allowNotifications = async () => {
    await openNotificationSetting()
    setAllowed(await notificationsAllowed())
  }

  const setSecondaryLanguages = (next: string[]) => {
    selection()
    track({name: EVENTS.SECONDARY_LANGUAGES_CHANGED, props: {deck_id: deckSlug, secondary: next}})
    setSecondary(next)
    void setStoredSecondaryLanguages(deckSlug, next)
  }

  const selectLanguage = (next: string) => {
    selection()
    if (next !== language) {
      track({name: EVENTS.LANGUAGE_CHANGED, props: {deck_id: deckSlug, from: language, to: next}})
    }
    setLanguage(next)
    // The daily Question already queued follows the new Language too.
    void setStoredLanguage(deckSlug, next)
      .then(() => refillDailyQuestions())
      .catch(() => {})
    onSelectLanguage?.(next)
    if (secondary.includes(next)) setSecondaryLanguages([])
  }

  const languageOptions = languages.map((code) => ({value: code, label: languageName(code)}))
  const hasLanguageChoice = languages.length > 1
  const secondaryOptions = languageOptions.filter((option) => option.value !== language)
  // Switching the second language back on brings back the last one picked.
  const restoredSecondary =
    secondaryOptions.find((option) => option.value === lastSecondary.current)?.value ??
    secondaryOptions[0]?.value
  const time = new Date(2000, 0, 1, daily.hour, daily.minute)

  return (
    <BottomSheet
      isPresented={visible}
      // iOS reports this once the sheet is gone; Android's fires as a swipe starts dismissing.
      onDismiss={() => onClose(Platform.OS === 'ios')}
      contentPadding={0}
      {...sheetTheme(isDark)}
    >
      {/* The sheet is SwiftUI / Compose: its React Native rows take its width and report their height. */}
      <RNHostView matchContents={{vertical: true}}>
        <View>
          <RowInset.Provider value={inset}>
            <Header onClose={() => onClose()} isDark={isDark} />
            <ScrollView style={{maxHeight: windowHeight * SHEET_MAX_HEIGHT_RATIO}} bounces={false}>
              <Row label="Game" trailing="picker">
                <Choice
                  label="Game"
                  options={GAME_OPTIONS}
                  current={game}
                  onSelect={(next) => {
                    selection()
                    setGame(next)
                    void setStoredGame(next)
                    onSelectGame?.(next)
                  }}
                  isDark={isDark}
                />
              </Row>
              <Row label="Language" trailing="picker">
                <Choice
                  label="Language"
                  options={languageOptions}
                  current={language}
                  onSelect={selectLanguage}
                  enabled={hasLanguageChoice}
                  isDark={isDark}
                />
              </Row>
              {hasLanguageChoice ? (
                <Row label="Second language" last={secondary[0] !== undefined} trailing="switch">
                  <Toggle
                    label="Second language"
                    value={secondary[0] !== undefined}
                    onChange={(on) =>
                      setSecondaryLanguages(on && restoredSecondary ? [restoredSecondary] : [])
                    }
                    isDark={isDark}
                  />
                </Row>
              ) : null}
              {secondary[0] ? (
                // Its own row, so every picker shares one right edge.
                <Row label="" trailing="picker">
                  <Choice
                    label="Second language"
                    options={secondaryOptions}
                    current={secondary[0]}
                    onSelect={(next) => setSecondaryLanguages([next])}
                    isDark={isDark}
                  />
                </Row>
              ) : null}
              <Row label="Card animation" trailing="segmented">
                <SegmentedControl
                  label="Card animation"
                  options={CARD_ANIMATION_OPTIONS}
                  current={cardAnimation}
                  onSelect={(next) => {
                    selection()
                    setCardAnimation(next)
                    void setStoredCardAnimation(next)
                  }}
                />
              </Row>
              <Row
                label="Tabletop mode"
                hint="Readable from both sides of the table"
                trailing="switch"
              >
                <Toggle
                  label="Tabletop mode"
                  value={tabletop}
                  onChange={(next) => {
                    selection()
                    // Global setting with no deck context, so no deck_id (same shape as THEME_CHANGED).
                    track({name: EVENTS.TABLETOP_MODE_CHANGED, props: {enabled: next}})
                    setTabletop(next)
                    void setStoredTabletopMode(next)
                  }}
                  isDark={isDark}
                />
              </Row>
              <Row label="Theme" trailing="segmented">
                <SegmentedControl
                  label="Theme"
                  options={THEME_OPTIONS}
                  current={theme}
                  onSelect={(next) => {
                    selection()
                    onSelectTheme(next)
                  }}
                />
              </Row>
              <Row label="Daily question" last={!daily.enabled || allowed} trailing="switch">
                {/* Off disables the time, never removes it: the row must not jump. */}
                {Platform.OS === 'android' ? (
                  <Pressable
                    onPress={() => setTimeOpen(true)}
                    disabled={!daily.enabled}
                    accessibilityRole="button"
                    accessibilityLabel={`Time: ${formatTime(daily)}`}
                    accessibilityState={{disabled: !daily.enabled}}
                    className={`bg-gray-lighter dark:bg-white/10 rounded-full px-3 py-1.5 ${
                      daily.enabled ? '' : 'opacity-40'
                    }`}
                  >
                    <Text className="text-darker dark:text-white font-sans text-base font-semibold">
                      {formatTime(daily)}
                    </Text>
                  </Pressable>
                ) : (
                  <DateTimePicker
                    value={time}
                    mode="time"
                    display="compact"
                    disabled={!daily.enabled}
                    themeVariant={isDark ? 'dark' : 'light'}
                    accentColor={accent(isDark)}
                    onValueChange={(_, date) => changeTime(date)}
                  />
                )}
                <Toggle
                  label="Daily question"
                  value={daily.enabled}
                  onChange={(enabled) => {
                    selection()
                    changeDaily({...daily, enabled})
                  }}
                  isDark={isDark}
                />
              </Row>
              {timeOpen ? (
                <DateTimePicker
                  value={time}
                  mode="time"
                  is24Hour
                  themeVariant={isDark ? 'dark' : 'light'}
                  onValueChange={(_, date) => {
                    setTimeOpen(false)
                    changeTime(date)
                  }}
                  onDismiss={() => setTimeOpen(false)}
                />
              ) : null}
              {daily.enabled && !allowed ? (
                <Pressable
                  onPress={() => void allowNotifications().catch(() => {})}
                  accessibilityRole="button"
                  accessibilityLabel="Allow notifications"
                  className="min-h-14 flex-row items-center justify-between gap-3 py-2"
                  style={{paddingLeft: inset.left - DRAWN_AT.label, paddingRight: inset.right}}
                >
                  <View className="flex-1">
                    <Text className="text-darker dark:text-white font-sans text-lg">
                      Allow notifications
                    </Text>
                    <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                      WhoCards can't send you notifications yet.
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color={mutedColor} />
                </Pressable>
              ) : null}
              <View className="border-gray-lighter dark:border-white/10 min-h-14 items-center justify-center border-t">
                <Pressable
                  onPress={() => void Linking.openURL(buildFeedbackUrl()).catch(() => {})}
                  accessibilityRole="link"
                  accessibilityLabel="Send feedback"
                  hitSlop={12}
                  className="flex-row items-center gap-1.5"
                >
                  <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-base font-semibold">
                    Send feedback
                  </Text>
                  <Ionicons name="open-outline" size={15} color={mutedColor} />
                </Pressable>
              </View>
            </ScrollView>
          </RowInset.Provider>
        </View>
      </RNHostView>
    </BottomSheet>
  )
}
