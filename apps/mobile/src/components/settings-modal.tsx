import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {StatusBar} from 'expo-status-bar'
import {useEffect, useState} from 'react'
import {Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import type {GameId} from '@whocards/decks'
import {DEFAULT_GAME, getLanguageName} from '@whocards/decks'
import {EVENTS, track} from '@whocards/observability/events'
import {colors} from '@whocards/tokens'

import {GameModal} from '@/components/game-modal'
import {LanguageModal} from '@/components/language-modal'
import {ThemeModal} from '@/components/theme-modal'
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

// Caps the sheet at this fraction of the window so max Dynamic Type or a compact
// device in landscape can't push the Tabletop row off-screen — content still sizes
// naturally (well under this cap in the normal case) and only this section
// scrolls; the header stays put. Same ratio and rationale as share-modal.tsx.
const SHEET_MAX_HEIGHT_RATIO = 0.8

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
 * `app/index.tsx`). Nested modals: this sheet is the menu, each row that
 * isn't a plain toggle opens its own sheet on top of it (GameModal,
 * ThemeModal, LanguageModal) — the same `presentationStyle="pageSheet"`
 * treatment every sheet in the app already uses, just stacked one deeper.
 * Tabletop mode is a plain on/off preference, so it's an inline switch row
 * here rather than a further nested sheet for a single checkbox.
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
 * `View` sized to its own content, capped at `SHEET_MAX_HEIGHT_RATIO` of the
 * window for the scroll-to-fit edge case). Unlike ShareModal, this sheet
 * skips the drag-handle swipe gesture — its content is a static list of rows
 * rather than something you'd want to flick away mid-scroll, and the close
 * button + backdrop tap already cover dismissal.
 *
 * The three nested sheets (GameModal, ThemeModal, LanguageModal) deliberately
 * keep their existing `presentationStyle="pageSheet"` native-card treatment
 * rather than also going compact: LanguageModal's list is unbounded (every
 * language in the deck plus an "Also show" section) and already documents
 * pageSheet as the right call for a list that can run long (see its own doc
 * comment) — forcing it into a content-hugging sheet would make the common
 * case (a handful of languages) look fine but the edge case (many languages)
 * scroll inside a tiny window instead of using the screen it actually needs.
 * Rather than fork the nested sheets' presentation from each other, all three
 * stay pageSheet for a consistent "menu is compact, drilling in is
 * full native sheet" hierarchy — a deeper sheet reads as more deliberate,
 * which matches them being one tap further from the home screen.
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
  const iconColor = isDark ? colors.white : colors.darker
  const chevronColor = isDark ? colors.gray.dark : colors.mutedOnLight

  const [game, setGame] = useState<GameId>(DEFAULT_GAME)
  const [gameModalOpen, setGameModalOpen] = useState(false)
  const [themeModalOpen, setThemeModalOpen] = useState(false)
  const [language, setLanguage] = useState(languages[0])
  const [secondary, setSecondary] = useState<string[]>([])
  const [languageModalOpen, setLanguageModalOpen] = useState(false)
  const [tabletop, setTabletop] = useState(false)

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Android only: without this, the status-bar strip isn't part of the
      // Modal's surface, so the backdrop dims everything below it but leaves
      // the status-bar area undimmed — same as ShareModal.
      statusBarTranslucent
    >
      {/* Dark sheet → light status-bar icons; light sheet → dark icons. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View className="flex-1 justify-end">
        {/* Dimmed backdrop — the Library screen underneath stays visible.
            Tapping it dismisses; the sheet below swallows its own taps (see
            the no-op onPress further down) so tapping the sheet itself
            doesn't also close it. */}
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={onClose}
          accessibilityLabel="dismiss"
        />
        {/* No-op tap target: swallows taps landing on the sheet's own whitespace
            (header padding, the gap around the title) so they don't fall through
            to the backdrop above and close the sheet — same pattern as
            ShareModal. `accessible={false}` keeps this out of the accessibility
            tree so it doesn't swallow every row's own label into one opaque
            element (a Pressable is `accessible` by default, which would
            otherwise group everything below into a single unlabeled node). */}
        <Pressable
          onPress={() => {}}
          accessible={false}
          className="bg-white dark:bg-dark rounded-t-3xl"
          style={{paddingBottom: Math.max(insets.bottom, 24)}}
        >
          {/* On Android with statusBarTranslucent, the sheet can otherwise sit
              under the status bar/notch on a device in the rare case its
              content pushes the header above the safe area — push the header
              below the display cutout, same guard the pageSheet header used. */}
          <View
            className="border-gray-lighter dark:border-white/10 flex-row items-center justify-between border-b px-5 py-4"
            style={{paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 16}}
          >
            <Text className="text-darker dark:text-white font-title text-2xl">Settings</Text>
            <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
              <Ionicons name="close" size={24} color={iconColor} />
            </Pressable>
          </View>
          {/* Caps the sheet at SHEET_MAX_HEIGHT_RATIO of the window so max
              Dynamic Type or a compact device in landscape can't push the
              Tabletop row off-screen — content still sizes naturally (well
              under this cap) in the normal case. */}
          <ScrollView style={{maxHeight: sheetMaxHeight}} bounces={false}>
            {/* label mirrors the visible text so tests and screen readers see the
              current value (a button's children collapse behind its label in
              the iOS a11y tree) — same pattern as the old Library chips. */}
            <Pressable
              onPress={() => setGameModalOpen(true)}
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
              onPress={() => setThemeModalOpen(true)}
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
              onPress={() => hasLanguageChoice && setLanguageModalOpen(true)}
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
              per-deck one — a plain on/off row, no nested sheet needed for one
              checkbox. */}
            <View className="border-gray-lighter dark:border-white/10 mt-2 border-t px-5 pb-1 pt-5">
              <Text className="text-darker dark:text-white font-title text-lg">Tabletop mode</Text>
              <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                Lay the phone flat on the table — the question mirrors on top so both sides can read
                it at once.
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
        </Pressable>

        <GameModal
          visible={gameModalOpen}
          current={game}
          onSelect={(next) => {
            selection()
            setGame(next)
            void setStoredGame(next)
            setGameModalOpen(false)
          }}
          onClose={() => setGameModalOpen(false)}
        />

        <ThemeModal
          visible={themeModalOpen}
          current={theme}
          onSelect={(next) => {
            selection()
            onSelectTheme(next)
            setThemeModalOpen(false)
          }}
          onClose={() => setThemeModalOpen(false)}
        />

        <LanguageModal
          visible={languageModalOpen}
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
            setLanguageModalOpen(false)
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
          onClose={() => setLanguageModalOpen(false)}
        />
      </View>
    </Modal>
  )
}
