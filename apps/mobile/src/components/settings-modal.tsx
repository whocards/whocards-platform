import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {StatusBar} from 'expo-status-bar'
import {useEffect, useState} from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import type {GameId} from '@whocards/decks'
import {DEFAULT_GAME, getLanguageName} from '@whocards/decks'
import {EVENTS, track} from '@whocards/observability/events'
import {colors} from '@whocards/tokens'

import {GameSettingsPage} from '@/components/game-settings-page'
import {LanguageSettingsPage} from '@/components/language-settings-page'
import {SecondLanguageSettingsPage} from '@/components/second-language-settings-page'
import {SettingsSheetHeader} from '@/components/settings-sheet-header'
import {ThemeSettingsPage} from '@/components/theme-settings-page'
import {getStoredGame, setStoredGame} from '@/lib/game-store'
import {selection} from '@/lib/haptics'
import {GAME_CATALOG} from '@/lib/games'
import {
  getStoredLanguage,
  getStoredSecondaryLanguages,
  setStoredLanguage,
  setStoredSecondaryLanguages,
} from '@/lib/language-store'
import {getStoredTabletopMode, setStoredTabletopMode} from '@/lib/tabletop-store'
import type {ThemeSetting} from '@/lib/theme-store'

const THEME_LABEL: Record<ThemeSetting, string> = {system: 'System', light: 'Light', dark: 'Dark'}

// Caps the menu page at this fraction of the window so max Dynamic Type or a
// compact device in landscape can't push the Tabletop row off-screen —
// content still sizes naturally (well under this cap in the normal case) and
// only this section scrolls; the header stays put. Every pushed page carries
// its own copy of this same cap+ratio.
const SHEET_MAX_HEIGHT_RATIO = 0.8

// Page-rise duration — matches CARD_ENTER_MS (play/[deck].tsx), this app's
// existing "snappy but not instant" UI-navigation timing, rather than
// FLIP_MS/LOGO_MS's slower, more deliberate reveal timings (those are for a
// card flip and the app's own entrance, not a settings-row tap). Kept as-is
// across the horizontal→vertical motion change (issue #189, fourth pass) —
// only the axis and easing shape changed, not the pace.
const PAGE_SLIDE_MS = 260

// How dark the menu dims underneath a risen page, at most — subtle, just
// enough to read as "behind" something (see the doc comment below).
const PAGE_DIM_OPACITY = 0.3

type Page = 'menu' | 'game' | 'theme' | 'language' | 'secondLanguage'

type SettingsModalProps = {
  visible: boolean
  onClose: () => void
  /**
   * The deck the Language row edits (issue #176 scoping decision — see this
   * file's doc comment below). Passed in rather than resolved here so this
   * component doesn't need its own opinion about which deck that is.
   */
  deckSlug: string
  languages: string[]
  theme: ThemeSetting
  onSelectTheme: (theme: ThemeSetting) => void
}

/**
 * The one settings menu (issue #176): every setting that used to be scattered
 * across the Library chips (Game, Theme) and the play screens' language sheet
 * (Language, secondary language, Tabletop mode) now lives here, behind a
 * single entry point on the home screen (the `SecondaryButton` in
 * `app/index.tsx`).
 *
 * Two sections (issue #189, owner on-device feedback — see "Second language"
 * below): **Gameplay** (Game, Language, Second language, Tabletop mode) and
 * **Appearance** (Theme). Primary Language sits in Gameplay, not Appearance,
 * even though — like Theme — it never changes which Card is drawn (CONTEXT.md's
 * Display-setting boundary holds for both). The distinction that matters here
 * is *content* vs. *chrome*: Language decides what you actually read (the
 * Question's text, in which script, which direction) — that's core to
 * *playing*, not to how the app around the Card looks. Theme only ever
 * changes the canvas/chrome color, never the Card. So Language groups with
 * the other things that shape the play experience (which Game, whether a
 * second language shows, whether the table reads both ways), and Appearance
 * is left with just Theme — a one-item section today, but a real, separate
 * category (font/density-style settings would also land there, not here).
 *
 * Language scoping decision (flagged per #176): Language and its secondary
 * are stored per-deck (`whocards-language:{deck}`,
 * `whocards-language-secondary:{deck}`), but this menu lives on the home
 * screen, before any deck is open. The registry
 * (packages/decks/src/decks/registry.ts) currently has exactly one deck
 * (`library`/`DEFAULT_DECK_SLUG`) reachable from the home screen's one Play
 * button — there is no deck picker to scope against. So rather than inventing
 * a new "global language" concept (which would fight the existing per-deck
 * storage keys and the web's per-deck `languageStorageKey`) or building a
 * deck-listing UI for a catalog of one, this menu's Language row always reads
 * and writes the one deck the home screen actually opens (`deckSlug`, passed
 * in as `DEFAULT_DECK_SLUG` from `app/index.tsx`, where `deck.slug` is
 * already resolved for the Play button and card counts). If a deck picker
 * ever ships on the home screen, this row will need to become deck-aware
 * (list decks, or scope to "last played") — until then, global vs per-deck is
 * a distinction without a difference against a catalog of one, and this is
 * the simplest thing that respects CONTEXT.md's Display-setting boundary
 * (presentation only, never affects which Card is drawn or progress) without
 * over-building for a deck catalog that doesn't exist yet.
 *
 * Themed (issue #163, amendment 1): a dark surface in dark mode, the
 * pre-existing light sheet surface in light mode — see
 * docs/design/163-light-mode/proposal.md.
 *
 * Content-hugging sheet (issue #189): this menu used to be a full
 * `presentationStyle="pageSheet"` native card — nearly the whole screen for
 * a handful of rows. Restyled to the same compact bottom sheet as ShareModal
 * (issue #166/#162: a transparent, `statusBarTranslucent` `Modal` with a
 * `rounded-t-3xl` `View` sized to its own content). The backdrop itself is
 * transparent (no dim) — owner on-device feedback found the dim behind this
 * particular sheet visually competing with the page-rise dim below; tapping
 * it still fully dismisses.
 *
 * Single Modal, internal pages (issue #189, third pass): the first #189 pass
 * kept the nested Game/Theme/Language pickers on `presentationStyle=
 * "pageSheet"`; owner feedback called the resulting full-height sheet
 * "broken" opening from this now-compact one. The second pass restyled those
 * into their own compact `Modal`s stacked on top of this one — on-device,
 * that stacking-two-Modals approach was "even funkier": switching which
 * `Modal` is presented is an instant native swap, so the outer sheet's own
 * hide-while-a-child-is-open guard and the inner sheet's slide-in couldn't be
 * made to land in the same frame, and the seam flickered. That ruled out
 * modal-over-modal as a family of solutions, not just that one guard's
 * tuning. There is exactly one `Modal` for the whole sheet; every page swaps
 * in and out of it.
 *
 * Motion (issue #189, fourth pass — owner on-device feedback: "the right side
 * is a jarring animation"): the third pass slid pages in horizontally, menu
 * and page side by side in a row twice the window's width. On-device, a
 * settings row sliding in from the right read like page navigation, not like
 * opening a sheet — jarring next to every other sheet in this app, which all
 * rise from the bottom. Replaced with vertical motion instead: a pushed page
 * is its own `rounded-t-3xl` card that rises from below the screen to cover
 * the menu, translateY-only (driven by `subPageProgress`, 0 = fully below,
 * 1 = fully risen), with the menu dimmed subtly (`PAGE_DIM_OPACITY`)
 * underneath rather than sliding away — reads as the same "sheet" language
 * every other surface in this app already speaks. `goBack()` reverses the
 * same drive in the other direction, then unmounts the page once it's
 * settled back below (`runOnJS(setPage)('menu')`).
 *
 * Backdrop / dismiss semantics shifted with the motion (documented here since
 * it's a deliberate change from the third pass, not an oversight): with pages
 * now visually stacked as cards rather than laid out side by side, a tap on
 * the dim behind a risen page pops that page (`goBack()`), same as Android
 * hardware back — both read as "dismiss the thing on top," matching how
 * nested sheets behave everywhere else. The *outer* sheet's own backdrop
 * (behind the menu) still always fully closes; it's simply covered by the
 * page-dim while a page is risen, so it isn't reachable in that state
 * anyway. Android hardware back still pops the page first and only closes
 * the sheet from the menu page.
 *
 * Game and Theme's `onSelect` calls `goBack()` after applying the pick (a
 * pick is a complete action, same as the pre-pager modals auto-closing on
 * select). Primary Language now does too (issue #189, fourth pass) — it used
 * to stay open so a secondary could also be toggled right after, but that
 * secondary picker is its own page now (see "Second language" below), so the
 * original reason to linger is gone; every single-pick page behaves the same
 * way. Second language also auto-returns, including a bare "None" pick.
 *
 * Second language (issue #189, owner on-device feedback: "split the second
 * language selector into a separate section in game play options"): the
 * "Also show" secondary-language picker used to live as a second section
 * beneath the primary list on the Language page. It's now its own menu row
 * and page (`second-language-settings-page.tsx`) — see the section-grouping
 * note above for where it landed and why.
 *
 * Height: each page still sizes to its own content (each carries its own
 * `SHEET_MAX_HEIGHT_RATIO`-capped, scrolling `ScrollView` for the
 * unbounded-list case — Language, Second language). Review finding on the
 * third pass's horizontal version: the menu `View` was unconditionally
 * mounted (only a11y-hidden) as a flex-row sibling of the destination page,
 * so the row's height was the *max* of both — a short page (Game, Theme)
 * left a dead blank block under its own content, the full height of the
 * (taller) menu, in every state except back on the menu itself. That
 * shared-row layout is gone entirely in this pass: the menu is still always
 * mounted (`page !== 'menu'` only a11y-hides it, unchanged), but it's no
 * longer a layout sibling of the risen page — the page is a separate,
 * `StyleSheet.absoluteFill` overlay, bottom-anchored to the actual screen
 * edge via its own `justifyContent: 'flex-end'`, sized to nothing but its
 * own content. The menu's own height can't leak into the risen page's
 * height because there is no shared box left to leak into.
 *
 * A11y: the menu is marked `accessibilityElementsHidden` /
 * `importantForAccessibility="no-hide-descendants"` while any page is risen
 * (or rising/falling) so a screen reader never lands on the dimmed content
 * underneath — keyed off `page` (the intended destination), not the
 * animation's own progress, since the destination is already what a screen
 * reader user should reach immediately rather than after a ~260ms rise
 * finishes.
 */
export const SettingsModal = ({
  visible,
  onClose,
  deckSlug,
  languages,
  theme,
  onSelectTheme,
}: SettingsModalProps) => {
  const insets = useSafeAreaInsets()
  const {colorScheme} = useColorScheme()
  const isDark = colorScheme !== 'light'
  const chevronColor = isDark ? colors.gray.dark : colors.mutedOnLight
  const reduceMotion = useReducedMotion()

  const [game, setGame] = useState<GameId>(DEFAULT_GAME)
  const [language, setLanguage] = useState(languages[0])
  const [secondary, setSecondary] = useState<string[]>([])
  const [tabletop, setTabletop] = useState(false)
  const [page, setPage] = useState<Page>('menu')
  // Touch-lock (review finding on issue #189, third pass): true while a rise
  // or fall is in flight, so a fast tap mid-animation can't fire a second,
  // conflicting transition (e.g. double-tapping a menu row before the state
  // update lands, or tapping back while the page is still rising). Also
  // drives `pointerEvents="none"` on the moving card itself, below.
  const [isTransitioning, setIsTransitioning] = useState(false)

  const {height: windowHeight} = useWindowDimensions()
  // 0 = no page risen (or fully back down), 1 = the active page fully risen.
  const subPageProgress = useSharedValue(0)

  // Neither direction gets its own haptic — matches the pre-pager convention
  // (opening/closing a nested modal was silent; only an actual selection —
  // picking a Game/Theme/Language, flipping Tabletop mode — called
  // `selection()`, and still does, in each onSelect handler below). goBack()
  // is also called right after a pick's own selection() fires, so giving it
  // one too would double-buzz that gesture.
  const goToPage = (next: Exclude<Page, 'menu'>) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setPage(next)
    subPageProgress.set(
      withTiming(1, {duration: reduceMotion ? 0 : PAGE_SLIDE_MS}, (finished) => {
        if (finished) runOnJS(setIsTransitioning)(false)
      })
    )
  }

  const goBack = () => {
    if (isTransitioning) return
    setIsTransitioning(true)
    subPageProgress.set(
      withTiming(0, {duration: reduceMotion ? 0 : PAGE_SLIDE_MS}, (finished) => {
        if (finished) {
          runOnJS(setPage)('menu')
          runOnJS(setIsTransitioning)(false)
        }
      })
    )
  }

  const handleRequestClose = () => {
    if (page !== 'menu') goBack()
    else onClose()
  }

  // Every fresh open starts at the menu, no lingering page/rise/transition
  // state from however the sheet was last closed (X, backdrop, or Android
  // back from the menu level all reach this the same way — `visible` turning
  // false).
  useEffect(() => {
    if (!visible) {
      setPage('menu')
      setIsTransitioning(false)
      subPageProgress.set(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Load every setting once on mount, same as the old Library/DeckPlayer
  // effects this replaces — so the rows never pop from a default value to the
  // real one while the sheet is already open.
  useEffect(() => {
    void getStoredGame().then(setGame)
    void getStoredTabletopMode().then(setTabletop)
    void getStoredLanguage(deckSlug).then((stored) => {
      if (stored && languages.includes(stored)) setLanguage(stored)
    })
    void getStoredSecondaryLanguages(deckSlug).then((stored) =>
      setSecondary(stored.filter((code) => languages.includes(code)))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckSlug])

  const gameTitle = GAME_CATALOG.find((entry) => entry.id === game)?.title ?? game
  const languageLabel = getLanguageName(language) ?? language
  const hasLanguageChoice = languages.length > 1
  const secondaryLabel = secondary[0] ? (getLanguageName(secondary[0]) ?? secondary[0]) : 'None'

  const sheetMaxHeight = windowHeight * SHEET_MAX_HEIGHT_RATIO

  const dimStyle = useAnimatedStyle(() => ({
    opacity: subPageProgress.get() * PAGE_DIM_OPACITY,
  }))
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{translateY: (1 - subPageProgress.get()) * windowHeight}],
  }))

  const setSecondaryLanguages = (next: string[]) => {
    selection()
    track({name: EVENTS.SECONDARY_LANGUAGES_CHANGED, props: {deck_id: deckSlug, secondary: next}})
    setSecondary(next)
    void setStoredSecondaryLanguages(deckSlug, next)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleRequestClose}
      // Android only: without this, the status-bar strip isn't part of the
      // Modal's surface, so the backdrop dims everything below it but leaves
      // the status-bar area undimmed — same as ShareModal.
      statusBarTranslucent
    >
      {/* Dark sheet → light status-bar icons; light sheet → dark icons. One
          Modal now, so this is trivially the only StatusBar override any
          page of this sheet ever contributes. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View className="flex-1 justify-end">
        {/* Transparent backdrop — the Library screen underneath stays visible,
            with no dim of its own (see the doc comment above). Tapping it
            always fully dismisses. The sheet below swallows its own taps (see
            the no-op onPress further down) so tapping the sheet itself
            doesn't also close it. */}
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="dismiss" />
        {/* No-op tap target: swallows taps landing on the sheet's own whitespace
            so they don't fall through to the backdrop above and close the sheet
            — same pattern as ShareModal. `accessible={false}` keeps this out of
            the accessibility tree so it doesn't swallow every row's own label
            into one opaque element (a Pressable is `accessible` by default,
            which would otherwise group everything below into a single
            unlabeled node). */}
        <Pressable
          onPress={() => {}}
          accessible={false}
          className="bg-white dark:bg-dark rounded-t-3xl"
          style={{paddingBottom: Math.max(insets.bottom, 24)}}
        >
          <View
            accessibilityElementsHidden={page !== 'menu'}
            importantForAccessibility={page !== 'menu' ? 'no-hide-descendants' : 'auto'}
          >
            <SettingsSheetHeader title="Settings" icon="close" onPress={onClose} />
            <ScrollView style={{maxHeight: sheetMaxHeight}} bounces={false}>
              {/* Gameplay — everything that shapes what you're actually playing
                  with: which Game, which language(s) the Question renders in,
                  whether the table reads both ways. */}
              <Text className="text-mutedOnLight dark:text-gray-dark px-5 pb-1 pt-4 font-sans text-xs font-bold uppercase tracking-wide">
                Gameplay
              </Text>
              {/* label mirrors the visible text so tests and screen readers see the
                  current value (a button's children collapse behind its label in
                  the iOS a11y tree) — same pattern as the old Library chips. */}
              <Pressable
                onPress={() => goToPage('game')}
                accessibilityRole="button"
                accessibilityLabel={`Game: ${gameTitle}`}
                className="border-gray-lighter dark:border-white/10 flex-row items-center justify-between border-b px-5 py-4"
              >
                <Text className="text-darker dark:text-white font-sans text-lg">Game</Text>
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-base">
                    {gameTitle}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={chevronColor} />
                </View>
              </Pressable>

              <Pressable
                onPress={() => hasLanguageChoice && goToPage('language')}
                disabled={!hasLanguageChoice}
                accessibilityRole="button"
                accessibilityLabel={`Language: ${languageLabel}`}
                accessibilityState={{disabled: !hasLanguageChoice}}
                className="border-gray-lighter dark:border-white/10 flex-row items-center justify-between border-b px-5 py-4"
              >
                <Text className="text-darker dark:text-white font-sans text-lg">Language</Text>
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-base">
                    {languageLabel}
                  </Text>
                  {hasLanguageChoice ? (
                    <Ionicons name="chevron-forward" size={16} color={chevronColor} />
                  ) : null}
                </View>
              </Pressable>

              <Pressable
                onPress={() => hasLanguageChoice && goToPage('secondLanguage')}
                disabled={!hasLanguageChoice}
                accessibilityRole="button"
                accessibilityLabel={`Second language: ${secondaryLabel}`}
                accessibilityState={{disabled: !hasLanguageChoice}}
                className="border-gray-lighter dark:border-white/10 flex-row items-center justify-between border-b px-5 py-4"
              >
                <Text className="text-darker dark:text-white font-sans text-lg">
                  Second language
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-base">
                    {secondaryLabel}
                  </Text>
                  {hasLanguageChoice ? (
                    <Ionicons name="chevron-forward" size={16} color={chevronColor} />
                  ) : null}
                </View>
              </Pressable>

              {/* Tabletop mode (issue #148): moved here from the play-screen sheet by
                  #176 since it's a global preference (tabletop-store.ts), not a
                  per-deck one — a plain on/off row, no nested page needed for one
                  checkbox. */}
              <View className="px-5 pb-1 pt-5">
                <Text className="text-darker dark:text-white font-title text-lg">
                  Tabletop mode
                </Text>
                <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                  Lay the phone flat on the table — the question mirrors on top so both sides can
                  read it at once.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  selection()
                  const next = !tabletop
                  // Global setting, no deck context anymore (this menu opens before
                  // any deck is open) — matches THEME_CHANGED's shape, the other
                  // global setting's event, which also carries no deck_id.
                  track({name: EVENTS.TABLETOP_MODE_CHANGED, props: {enabled: next}})
                  setTabletop(next)
                  void setStoredTabletopMode(next)
                }}
                accessibilityRole="switch"
                accessibilityLabel="Tabletop mode"
                accessibilityState={{checked: tabletop}}
                className={`flex-row items-center justify-between px-5 py-3 ${
                  tabletop ? 'bg-yellow-300/40' : ''
                }`}
              >
                <Text className="text-darker dark:text-white font-sans text-lg">
                  Two-way readable
                </Text>
                <Ionicons
                  name={tabletop ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={
                    tabletop
                      ? isDark
                        ? colors.accentOnDark
                        : colors.accentOnLight
                      : isDark
                        ? colors.gray.dark
                        : colors.mutedOnLight
                  }
                />
              </Pressable>

              {/* Appearance — how the app itself looks, never what you're playing
                  with (Theme never changes the Card, only the chrome/canvas
                  around it). */}
              <Text className="text-mutedOnLight dark:text-gray-dark border-gray-lighter dark:border-white/10 mt-2 border-t px-5 pb-1 pt-5 font-sans text-xs font-bold uppercase tracking-wide">
                Appearance
              </Text>
              <Pressable
                onPress={() => goToPage('theme')}
                accessibilityRole="button"
                accessibilityLabel={`Theme: ${THEME_LABEL[theme]}`}
                className="flex-row items-center justify-between px-5 py-4"
              >
                <Text className="text-darker dark:text-white font-sans text-lg">Theme</Text>
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-base">
                    {THEME_LABEL[theme]}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={chevronColor} />
                </View>
              </Pressable>
            </ScrollView>
          </View>
        </Pressable>

        {/* The active page, risen over the menu (see the "Motion" doc comment
            above). `pointerEvents="box-none"` on both overlay layers: the dim's
            own Pressable (filling the layer) is what actually captures taps —
            these wrappers just position things without stealing touches from
            it or from the menu that would otherwise sit behind an empty area.
            The moving card itself switches to `pointerEvents="none"` while
            `isTransitioning` (review finding on issue #189, third pass): a fast
            tap mid-rise/mid-fall can't land on a row and fire a second,
            conflicting transition — the dim behind it stays tappable the whole
            time (its own `goBack()` press is already a no-op mid-transition via
            the guard above, so this doesn't strand a mid-air tap either). */}
        {page !== 'menu' ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
              <Pressable
                className="flex-1 bg-black"
                onPress={goBack}
                accessibilityLabel="dismiss page"
              />
            </Animated.View>
            <Animated.View
              style={[{flex: 1, justifyContent: 'flex-end'}, cardStyle]}
              pointerEvents={isTransitioning ? 'none' : 'box-none'}
            >
              <Pressable
                onPress={() => {}}
                accessible={false}
                className="bg-white dark:bg-dark rounded-t-3xl"
                style={{paddingBottom: Math.max(insets.bottom, 24)}}
              >
                {page === 'game' ? (
                  <GameSettingsPage
                    current={game}
                    onSelect={(next) => {
                      selection()
                      setGame(next)
                      void setStoredGame(next)
                      goBack()
                    }}
                    onBack={goBack}
                  />
                ) : null}

                {page === 'theme' ? (
                  <ThemeSettingsPage
                    current={theme}
                    onSelect={(next) => {
                      selection()
                      onSelectTheme(next)
                      goBack()
                    }}
                    onBack={goBack}
                  />
                ) : null}

                {page === 'language' ? (
                  <LanguageSettingsPage
                    languages={languages}
                    current={language}
                    onSelect={(next) => {
                      selection()
                      if (next !== language) {
                        track({
                          name: EVENTS.LANGUAGE_CHANGED,
                          props: {deck_id: deckSlug, from: language, to: next},
                        })
                      }
                      setLanguage(next)
                      void setStoredLanguage(deckSlug, next)
                      // the new primary can't also be a secondary
                      if (secondary.includes(next)) setSecondaryLanguages([])
                      goBack()
                    }}
                    onBack={goBack}
                  />
                ) : null}

                {page === 'secondLanguage' ? (
                  <SecondLanguageSettingsPage
                    languages={languages}
                    current={language}
                    secondary={secondary}
                    onChange={(next) => {
                      setSecondaryLanguages(next)
                      goBack()
                    }}
                    onBack={goBack}
                  />
                ) : null}
              </Pressable>
            </Animated.View>
          </View>
        ) : null}
      </View>
    </Modal>
  )
}
