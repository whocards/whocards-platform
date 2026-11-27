import {Ionicons} from '@expo/vector-icons'
import {BottomSheet, Host, RNHostView, Switch} from '@expo/ui'
import {DateTimePicker} from '@expo/ui/community/datetime-picker'
import type {ReactNode} from 'react'
import {useEffect, useRef, useState} from 'react'
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
import {getEntitlement} from '@/lib/entitlements'
import {buildFeedbackUrl} from '@/lib/feedback-url'
import {getStoredGame, setStoredGame} from '@/lib/game-store'
import {selection} from '@/lib/haptics'
import {GAME_CATALOG} from '@/lib/games'
import {
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

// The Second language picker's "None".
const NO_LANGUAGE = ''

// Caps the rows at this fraction of the window; they only scroll under max Dynamic Type or in landscape.
const SHEET_MAX_HEIGHT_RATIO = 0.8

// Unified post-sheet timing: the native sheet reports dismissal when it starts (~285ms on iOS),
// not when it finishes. Every stage transformation (Game switch, Language, Second language,
// Tabletop) waits this long so it plays cleanly once the menu has cleared; Theme stays live.
export const SHEET_CLOSE_MS = 320

const languageName = (code: string) => getLanguageName(code) ?? code

const formatTime = ({hour, minute}: Pick<DailySetting, 'hour' | 'minute'>) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

type SettingsModalProps = {
  visible: boolean
  onClose: () => void
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
}

type RowProps = {label: string; hint?: string; last?: boolean; children: ReactNode}

/** One setting: its label on the left, its control inline on the right. Every row shares one min height. */
const Row = ({label, hint, last = false, children}: RowProps) => (
  <View
    className={`border-gray-lighter dark:border-white/10 min-h-14 flex-row items-center justify-between gap-3 px-5 py-2 ${
      last ? '' : 'border-b'
    }`}
  >
    <View className="flex-1">
      <Text className="text-darker dark:text-white font-sans text-lg">{label}</Text>
      {hint ? (
        <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">{hint}</Text>
      ) : null}
    </View>
    {children}
  </View>
)

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
}: SettingsModalProps) => {
  const isDark = useIsDark()
  const mutedColor = isDark ? colors.gray.dark : colors.mutedOnLight
  const {height: windowHeight} = useWindowDimensions()

  const [game, setGame] = useState<GameId>(DEFAULT_GAME)
  const [earlyAccess, setEarlyAccess] = useState(false)
  const [language, setLanguage] = useState(languages[0])
  const [secondary, setSecondary] = useState<string[]>([])
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

  // Players learn a Game is a paid feature before purchases exist (ADR-0006).
  useEffect(() => {
    let cancelled = false
    const tier = GAME_CATALOG.find((entry) => entry.id === game)?.tier
    if (!tier) return undefined
    void getEntitlement(tier).then((entitlement) => {
      if (!cancelled) setEarlyAccess(entitlement.granted && entitlement.reason === 'early_access')
    })
    return () => {
      cancelled = true
    }
  }, [game])

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
    void setStoredLanguage(deckSlug, next)
    onSelectLanguage?.(next)
    if (secondary.includes(next)) setSecondaryLanguages([])
  }

  const languageOptions = languages.map((code) => ({value: code, label: languageName(code)}))
  const hasLanguageChoice = languages.length > 1
  const time = new Date(2000, 0, 1, daily.hour, daily.minute)

  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={onClose}
      contentPadding={0}
      {...sheetTheme(isDark)}
    >
      {/* The sheet is SwiftUI / Compose: its React Native rows take its width and report their height. */}
      <RNHostView matchContents={{vertical: true}}>
        <View>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-6">
            <Text className="text-darker dark:text-white font-title text-2xl">Settings</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="close"
              hitSlop={12}
            >
              <Ionicons name="close" size={24} color={isDark ? colors.white : colors.darker} />
            </Pressable>
          </View>
          <ScrollView style={{maxHeight: windowHeight * SHEET_MAX_HEIGHT_RATIO}} bounces={false}>
            <Row label="Game" hint={earlyAccess ? 'Included in early access' : undefined}>
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
            <Row label="Language">
              <Choice
                label="Language"
                options={languageOptions}
                current={language}
                onSelect={selectLanguage}
                enabled={hasLanguageChoice}
                isDark={isDark}
              />
            </Row>
            <Row label="Second language">
              <Choice
                label="Second language"
                options={[
                  {value: NO_LANGUAGE, label: 'None'},
                  ...languageOptions.filter((option) => option.value !== language),
                ]}
                current={secondary[0] ?? NO_LANGUAGE}
                onSelect={(next) => setSecondaryLanguages(next === NO_LANGUAGE ? [] : [next])}
                enabled={hasLanguageChoice}
                isDark={isDark}
              />
            </Row>
            <Row label="Card animation">
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
              hint="Mirror the Question so both sides of the table can read it."
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
            <Row label="Theme">
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
            <Row label="Daily question" last={!daily.enabled || allowed}>
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
                className="min-h-14 flex-row items-center justify-between gap-3 px-5 py-2"
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
        </View>
      </RNHostView>
    </BottomSheet>
  )
}
