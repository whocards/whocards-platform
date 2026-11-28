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
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {colors} from '@whocards/tokens'

import {Choice} from '@/components/choice'
import {SegmentedControl} from '@/components/segmented-control'
import {useIsDark} from '@/lib/color-scheme'
import {buildFeedbackUrl} from '@/lib/feedback-url'
import {getStoredGame, setStoredGame} from '@/lib/game-store'
import {selection} from '@/lib/haptics'
import {deviceLanguage} from '@/lib/device-language'
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
import {NATIVE_LANGUAGE_NAMES, setUiLanguage, useT} from '@/lib/i18n'
import type {MessageKey} from '@/lib/i18n'
import {MOTION_DURATION, motionDuration} from '@/lib/motion'
import {SHEET_PADDING, sheetTheme} from '@/lib/sheet-theme'
import {getStoredTabletopMode, setStoredTabletopMode} from '@/lib/tabletop-store'
import type {ThemeSetting} from '@/lib/theme-store'

const THEME_OPTIONS = [
  {value: 'system', key: 'settings.themeSystem'},
  {value: 'light', key: 'settings.themeLight'},
  {value: 'dark', key: 'settings.themeDark'},
] as const satisfies readonly {value: ThemeSetting; key: MessageKey}[]

const CARD_ANIMATION_OPTIONS = [
  {value: 'slide', key: 'settings.slide'},
  {value: 'flip', key: 'settings.flip'},
] as const satisfies readonly {value: CardAnimation; key: MessageKey}[]

// Caps the rows at this fraction of the window; they only scroll under max Dynamic Type or in landscape.
const SHEET_MAX_HEIGHT_RATIO = 0.8

// After an X close, stage changes wait out the sheet's native teardown (~100ms block ending ~690ms in).
export const SHEET_CLOSE_MS = 720

const languageName = (code: string) => NATIVE_LANGUAGE_NAMES[code] ?? getLanguageName(code) ?? code

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
  /** Every Language pick, even one equal to the stored value; the play screen applies it live. */
  onSelectLanguage?: (language: string) => void
  /** Window x of the edges the rows line up with (the Card's, in Card view); the sheet's own otherwise. */
  alignTo?: {left: number; right: number}
}

/** Where the rows' visible left and right edges sit, in points from the window's edges. */
type Inset = {left: number; right: number}
const DEFAULT_INSET: Inset = {left: 26, right: 26}
const RowInset = createContext<Inset>(DEFAULT_INSET)

type Trailing = 'picker' | 'switch' | 'segmented' | 'close' | 'chevron' | 'none'
// Where each piece is drawn relative to its layout edge inside the iOS 26 sheet (measured on device).
const DRAWN_AT: Record<Trailing | 'label', number> =
  Platform.OS === 'ios'
    ? {label: 8, picker: -21.3, switch: -5.7, segmented: -7.7, close: -13.7, chevron: -14, none: 0}
    : {label: 0, picker: 0, switch: 0, segmented: 0, close: 0, chevron: 0, none: 0}

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
  /** Makes the whole row a button (a row that opens another page). */
  onPress?: () => void
  children: ReactNode
}

/** One setting: its label on the left, its control inline on the right. Every row shares one min height. */
const Row = ({label, hint, last = false, trailing = 'none', onPress, children}: RowProps) => {
  const edges = useEdges(trailing)
  const Container = onPress ? Pressable : View
  return (
    <Container
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? label : undefined}
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
    </Container>
  )
}

/** One page of the sheet; the hidden one is out of reach for screen readers and touch. */
const Page = ({active, width, children}: {active: boolean; width: number; children: ReactNode}) => (
  <View
    style={{width}}
    pointerEvents={active ? 'auto' : 'none'}
    accessibilityElementsHidden={!active}
    importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
  >
    {children}
  </View>
)

type HeaderProps = {title: string; onBack?: () => void; onClose: () => void; isDark: boolean}

const Header = ({title, onBack, onClose, isDark}: HeaderProps) => {
  const edges = useEdges('close')
  const t = useT()
  return (
    <View
      className={`flex-row items-center justify-between pb-2 ${SHEET_PADDING.top}`}
      style={edges.row}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('settings.backToSettings')}
          hitSlop={12}
          className="flex-row items-center gap-1"
          style={{marginLeft: -6}}
        >
          <Ionicons name="chevron-back" size={24} color={isDark ? colors.white : colors.darker} />
          <Text className="text-darker dark:text-white font-title text-2xl">{title}</Text>
        </Pressable>
      ) : (
        <Text className="text-darker dark:text-white font-title text-2xl">{title}</Text>
      )}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.close')}
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
  const reduceMotion = useReducedMotion()
  const t = useT()
  const mutedColor = isDark ? colors.gray.dark : colors.mutedOnLight
  const {height: windowHeight, width: windowWidth} = useWindowDimensions()
  // The sheet is one page, or the Gameplay page pushed over it the way iOS Settings does.
  const [page, setPage] = useState<0 | 1>(0)
  // A page takes touches only once it has slid in, or a quick second tap on Gameplay flips the switch sliding in under it.
  const [settledPage, setSettledPage] = useState<0 | 1 | null>(0)
  const [pageWidth, setPageWidth] = useState(windowWidth)
  const pageX = useSharedValue(0)
  const goTo = (next: 0 | 1) => {
    selection()
    setPage(next)
    setSettledPage(null)
    pageX.set(
      withTiming(
        next,
        {duration: motionDuration(MOTION_DURATION.slide, reduceMotion)},
        (finished) => {
          if (finished) runOnJS(setSettledPage)(next)
        }
      )
    )
  }
  useEffect(() => {
    if (!visible) return
    setPage(0)
    setSettledPage(0)
    pageX.set(0)
  }, [visible, pageX])
  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{translateX: -pageX.get() * pageWidth}],
  }))
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
  }, [deckSlug, visible])

  // The play screen applies a pick live, and a warm link can switch the Language while the sheet is open.
  useEffect(() => {
    if (currentLanguage) setLanguage(currentLanguage)
  }, [currentLanguage])

  // A warm link can switch the Game while the sheet is open.
  useEffect(() => {
    if (currentGame) setGame(currentGame)
  }, [currentGame])

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
    track({
      name: EVENTS.DAILY_QUESTION_CHANGED,
      props: {enabled: next.enabled, hour: next.hour, minute: next.minute},
    })
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
    setUiLanguage(next)
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
  // A link can open a Card in the saved second language; it then shows as off, still saved.
  const activeSecondary = secondary.find((code) => code !== language)
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
        <View
          className={`overflow-hidden ${SHEET_PADDING.bottom}`}
          onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}
        >
          <RowInset.Provider value={inset}>
            <Header
              title={page === 1 ? t('settings.gameplay') : t('settings.title')}
              onBack={page === 1 ? () => goTo(0) : undefined}
              onClose={() => onClose()}
              isDark={isDark}
            />
            <ScrollView style={{maxHeight: windowHeight * SHEET_MAX_HEIGHT_RATIO}} bounces={false}>
              <Animated.View className="flex-row" style={[{width: pageWidth * 2}, pagerStyle]}>
                <Page active={settledPage === 0} width={pageWidth}>
                  <Row label={t('settings.language')} trailing="picker">
                    <Choice
                      label={t('settings.language')}
                      options={languageOptions}
                      current={language}
                      onSelect={selectLanguage}
                      enabled={hasLanguageChoice}
                      isDark={isDark}
                    />
                  </Row>
                  <Row label={t('settings.gameplay')} trailing="chevron" onPress={() => goTo(1)}>
                    <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-lg">
                      {t(game === 'pick' ? 'games.pick' : 'games.classic')}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color={mutedColor} />
                  </Row>
                  <Row label={t('settings.theme')} trailing="segmented">
                    <SegmentedControl
                      label={t('settings.theme')}
                      options={THEME_OPTIONS.map(({value, key}) => ({value, label: t(key)}))}
                      current={theme}
                      onSelect={(next) => {
                        selection()
                        onSelectTheme(next)
                      }}
                    />
                  </Row>
                  <Row
                    label={t('settings.dailyQuestion')}
                    last={!daily.enabled || allowed}
                    trailing="switch"
                  >
                    {/* Off disables the time, never removes it: the row must not jump. */}
                    {Platform.OS === 'android' ? (
                      <Pressable
                        onPress={() => setTimeOpen(true)}
                        disabled={!daily.enabled}
                        accessibilityRole="button"
                        accessibilityLabel={t('settings.time', {time: formatTime(daily)})}
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
                      label={t('settings.dailyQuestion')}
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
                      accessibilityLabel={t('settings.allowNotifications')}
                      className="min-h-14 flex-row items-center justify-between gap-3 py-2"
                      style={{paddingLeft: inset.left - DRAWN_AT.label, paddingRight: inset.right}}
                    >
                      <View className="flex-1">
                        <Text className="text-darker dark:text-white font-sans text-lg">
                          {t('settings.allowNotifications')}
                        </Text>
                        <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                          {t('settings.notificationsOff')}
                        </Text>
                      </View>
                      <Ionicons name="open-outline" size={16} color={mutedColor} />
                    </Pressable>
                  ) : null}
                  <View className="border-gray-lighter dark:border-white/10 min-h-14 items-center justify-center border-t">
                    <Pressable
                      onPress={() => void Linking.openURL(buildFeedbackUrl()).catch(() => {})}
                      accessibilityRole="link"
                      accessibilityLabel={t('settings.sendFeedback')}
                      hitSlop={12}
                      className="flex-row items-center gap-1.5"
                    >
                      <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-base font-semibold">
                        {t('settings.sendFeedback')}
                      </Text>
                      <Ionicons name="open-outline" size={15} color={mutedColor} />
                    </Pressable>
                  </View>
                </Page>
                <Page active={settledPage === 1} width={pageWidth}>
                  <Row
                    label={t('settings.pickACard')}
                    hint={t('settings.pickACardHint')}
                    trailing="switch"
                  >
                    <Toggle
                      label={t('settings.pickACard')}
                      value={game === 'pick'}
                      onChange={(on) => {
                        const next: GameId = on ? 'pick' : 'wh'
                        selection()
                        track({name: EVENTS.GAME_CHANGED, props: {from: game, to: next}})
                        setGame(next)
                        void setStoredGame(next)
                        onSelectGame?.(next)
                      }}
                      isDark={isDark}
                    />
                  </Row>
                  {hasLanguageChoice ? (
                    <>
                      <Row label={t('settings.secondLanguage')} last trailing="switch">
                        <Toggle
                          label={t('settings.secondLanguage')}
                          value={activeSecondary !== undefined}
                          onChange={(on) =>
                            setSecondaryLanguages(
                              on && restoredSecondary ? [restoredSecondary] : []
                            )
                          }
                          isDark={isDark}
                        />
                      </Row>
                      {/* Always shown, dimmed while off, so the sheet never changes height. */}
                      <Row label="" trailing="picker">
                        <View style={{opacity: activeSecondary ? 1 : 0.35}}>
                          <Choice
                            label={t('settings.secondLanguage')}
                            options={secondaryOptions}
                            current={activeSecondary ?? restoredSecondary ?? ''}
                            onSelect={(next) => setSecondaryLanguages([next])}
                            enabled={activeSecondary !== undefined}
                            isDark={isDark}
                          />
                        </View>
                      </Row>
                    </>
                  ) : null}
                  <Row
                    label={t('settings.tabletop')}
                    hint={t('settings.tabletopHint')}
                    trailing="switch"
                  >
                    <Toggle
                      label={t('settings.tabletop')}
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
                  <Row label={t('settings.cardAnimation')} trailing="segmented" last>
                    <SegmentedControl
                      label={t('settings.cardAnimation')}
                      options={CARD_ANIMATION_OPTIONS.map(({value, key}) => ({
                        value,
                        label: t(key),
                      }))}
                      current={cardAnimation}
                      onSelect={(next) => {
                        selection()
                        track({name: EVENTS.CARD_ANIMATION_CHANGED, props: {animation: next}})
                        setCardAnimation(next)
                        void setStoredCardAnimation(next)
                      }}
                    />
                  </Row>
                </Page>
              </Animated.View>
            </ScrollView>
          </RowInset.Provider>
        </View>
      </RNHostView>
    </BottomSheet>
  )
}
