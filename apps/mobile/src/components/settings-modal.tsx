import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {StatusBar} from 'expo-status-bar'
import {useEffect, useState} from 'react'
import {Modal, Pressable, ScrollView, Text, useWindowDimensions, View} from 'react-native'
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
// only this section scrolls; the header stays put. The Game/Theme/Language
// pages each carry their own copy of this same cap+ratio.
const SHEET_MAX_HEIGHT_RATIO = 0.8

// Page-slide duration — matches CARD_ENTER_MS (play/[deck].tsx), this app's
// existing "snappy but not instant" UI-navigation timing, rather than
// FLIP_MS/LOGO_MS's slower, more deliberate reveal timings (those are for a
// card flip and the app's own entrance, not a settings-row tap).
const PAGE_SLIDE_MS = 260

type Page = 'menu' | 'game' | 'theme' | 'language'

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
 * four rows plus a toggle. Restyled to the same compact bottom sheet as
 * ShareModal (issue #166/#162: a transparent, `statusBarTranslucent` `Modal`
 * with a dimmed backdrop that's press-to-dismiss, and a `rounded-t-3xl`
 * `View` sized to its own content).
 *
 * Single Modal, internal pages (issue #189, third pass): the first #189 pass
 * kept the nested Game/Theme/Language pickers on `presentationStyle=
 * "pageSheet"`; owner feedback called the resulting full-height sheet
 * "broken" opening from this now-compact one. The second pass restyled those
 * three into their own compact `Modal`s stacked on top of this one, with a
 * "hide my own backdrop while a child is open" guard to avoid a double-dim —
 * on-device, that stacking-two-Modals approach was "even funkier": switching
 * which `Modal` is presented is an instant native swap, so the outer sheet's
 * hide and the inner sheet's slide-in couldn't be made to land in the same
 * frame, and the seam flickered. That ruled out modal-over-modal as a family
 * of solutions, not just that one guard's tuning.
 *
 * This pass is structural instead: there is exactly one `Modal` for the
 * whole sheet. "Opening" Game/Theme/Language is really just this component
 * swapping which `View` is showing, driven by one `reanimated` shared value
 * (`pageTranslate`) — the menu and the active page sit side by side in a
 * row twice the window's width, and sliding that row by one window-width
 * left/right is the entire "navigation." Since it's one continuous surface
 * (not two Modals handing off), there's no seam left to flicker. Game and
 * Theme's `onSelect` calls `goBack()` after applying the pick (a pick is a
 * complete action, same as the pre-pager modals auto-closing on select);
 * Language's does not, since users often want to also toggle an "Also show"
 * secondary right after (same as the pre-pager LanguageModal never
 * auto-closing either).
 *
 * Height: each page sizes to its own content (each still carries its own
 * `SHEET_MAX_HEIGHT_RATIO`-capped, scrolling `ScrollView` for the
 * unbounded-list case — Language). The sheet doesn't measure and
 * cross-fade/morph between two heights as a page changes: while both the
 * menu and the destination page are mounted (mid-slide), the row's height is
 * simply the taller of the two (ordinary flexbox row behavior, free); once
 * the destination settles and the other page unmounts, the sheet's height
 * drops to just that page's height. That reads as "the sheet adjusts to the
 * new page" rather than a jump-cut, without a second animated value tracking
 * two pages' measured heights in lockstep with the slide — not worth the
 * extra moving parts for a transition that's mid-slide for under 300ms.
 *
 * Android hardware back (`onRequestClose`) pops to the menu first and only
 * closes the sheet from the menu page — mirrors a native nav stack. The
 * backdrop tap and the header's close/back icons stay simpler: backdrop
 * always fully dismisses (tapping outside the whole sheet reads as "leave",
 * not "go back one step" — different from a hardware key's own "undo last
 * navigation" convention), the menu's own header is a close "X" (dismiss),
 * every pushed page's header is a `chevron-back` (`SettingsSheetHeader`,
 * `goBack()`).
 *
 * A11y: the inactive slide (the menu while a page is open, mid-slide or
 * settled) is marked `accessibilityElementsHidden` /
 * `importantForAccessibility="no-hide-descendants"` so a screen reader never
 * lands on off-screen content — keyed off `page` (the intended destination),
 * not the animation's own progress, since the destination is already what a
 * screen reader user should reach immediately rather than after a ~260ms
 * slide finishes.
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

  const {width: windowWidth} = useWindowDimensions()
  // 0 = menu showing, -windowWidth = the active page showing.
  const pageTranslate = useSharedValue(0)

  // Neither direction gets its own haptic — matches the pre-pager convention
  // (opening/closing a nested modal was silent; only an actual selection —
  // picking a Game/Theme/Language, flipping Tabletop mode — called
  // `selection()`, and still does, in each onSelect handler below). goBack()
  // is also called right after a Game/Theme pick's own selection() fires, so
  // giving it one too would double-buzz that gesture.
  const goToPage = (next: Exclude<Page, 'menu'>) => {
    setPage(next)
    pageTranslate.set(withTiming(-windowWidth, {duration: reduceMotion ? 0 : PAGE_SLIDE_MS}))
  }

  const goBack = () => {
    pageTranslate.set(
      withTiming(0, {duration: reduceMotion ? 0 : PAGE_SLIDE_MS}, (finished) => {
        if (finished) runOnJS(setPage)('menu')
      })
    )
  }

  const handleRequestClose = () => {
    if (page !== 'menu') goBack()
    else onClose()
  }

  // Every fresh open starts at the menu, no lingering page/slide state from
  // however the sheet was last closed (X, backdrop, or Android back from the
  // menu level all reach this the same way — `visible` turning false).
  useEffect(() => {
    if (!visible) {
      setPage('menu')
      pageTranslate.set(0)
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

  const {height: windowHeight} = useWindowDimensions()
  const sheetMaxHeight = windowHeight * SHEET_MAX_HEIGHT_RATIO

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{translateX: pageTranslate.get()}],
  }))

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
        {/* Dimmed backdrop — the Library screen underneath stays visible.
            Tapping it always fully dismisses (see the doc comment above on
            why that's simpler than Android back's pop-then-close). The sheet
            below swallows its own taps (see the no-op onPress further down)
            so tapping the sheet itself doesn't also close it. */}
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={onClose}
          accessibilityLabel="dismiss"
        />
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
          {/* Clips the pager row to one window-width — the row itself is twice
              that, with only one "page" ever in view. */}
          <View style={{overflow: 'hidden'}}>
            <Animated.View style={[{flexDirection: 'row', width: windowWidth * 2}, pagerStyle]}>
              <View
                style={{width: windowWidth}}
                accessibilityElementsHidden={page !== 'menu'}
                importantForAccessibility={page !== 'menu' ? 'no-hide-descendants' : 'auto'}
              >
                <SettingsSheetHeader title="Settings" icon="close" onPress={onClose} />
                <ScrollView style={{maxHeight: sheetMaxHeight}} bounces={false}>
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
                    onPress={() => goToPage('theme')}
                    accessibilityRole="button"
                    accessibilityLabel={`Theme: ${THEME_LABEL[theme]}`}
                    className="border-gray-lighter dark:border-white/10 flex-row items-center justify-between border-b px-5 py-4"
                  >
                    <Text className="text-darker dark:text-white font-sans text-lg">Theme</Text>
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-base">
                        {THEME_LABEL[theme]}
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

                  {/* Tabletop mode (issue #148): moved here from the play-screen sheet by
                      #176 since it's a global preference (tabletop-store.ts), not a
                      per-deck one — a plain on/off row, no nested page needed for one
                      checkbox. */}
                  <View className="border-gray-lighter dark:border-white/10 mt-2 border-t px-5 pb-1 pt-5">
                    <Text className="text-darker dark:text-white font-title text-lg">
                      Tabletop mode
                    </Text>
                    <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                      Lay the phone flat on the table — the question mirrors on top so both sides
                      can read it at once.
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
                </ScrollView>
              </View>

              {page !== 'menu' ? (
                <View style={{width: windowWidth}}>
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
                      secondary={secondary}
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
                        if (secondary.includes(next)) {
                          setSecondary([])
                          void setStoredSecondaryLanguages(deckSlug, [])
                        }
                      }}
                      onSecondaryChange={(next) => {
                        selection()
                        track({
                          name: EVENTS.SECONDARY_LANGUAGES_CHANGED,
                          props: {deck_id: deckSlug, secondary: next},
                        })
                        setSecondary(next)
                        void setStoredSecondaryLanguages(deckSlug, next)
                      }}
                      onBack={goBack}
                    />
                  ) : null}
                </View>
              ) : null}
            </Animated.View>
          </View>
        </Pressable>
      </View>
    </Modal>
  )
}
