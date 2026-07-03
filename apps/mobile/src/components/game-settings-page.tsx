import {useEffect, useState} from 'react'
import {Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native'
import type {GameId} from '@whocards/decks'

import {SettingsSheetHeader} from '@/components/settings-sheet-header'
import type {Entitlement} from '@/lib/entitlements'
import {getEntitlement} from '@/lib/entitlements'
import {GAME_CATALOG} from '@/lib/games'

// Caps the page at this fraction of the window so max Dynamic Type or a compact
// device in landscape can't push the last row off-screen — content still sizes
// naturally (well under this cap in the normal case) and only this section
// scrolls. GAME_CATALOG is short today, but the cap is here for the same reason
// it's on every page in this family — cheap insurance against a taller catalog
// or Dynamic Type later.
const SHEET_MAX_HEIGHT_RATIO = 0.8

type GameSettingsPageProps = {
  current: GameId
  onSelect: (game: GameId) => void
  onBack: () => void
}

/**
 * Game picker — one page in SettingsModal's single-Modal pager (issue #189,
 * third pass). Extracted from the standalone `GameModal` component the
 * second #189 pass built (a second, separately-stacked compact `Modal`):
 * on-device, stacking a `Modal` on top of another `Modal` — even with both
 * compact and the outer one hiding its own dim to avoid a double-dim — still
 * produced a visible flicker at the instant-hide/slide-in handoff between the
 * two. The fix is structural, not a tuning knob: one `Modal`, one native
 * surface, content that slides internally. `GameModal` itself is gone —
 * settings-modal.tsx was its only caller (confirmed by a full-repo grep) — so
 * there was nothing to strand by deleting the Modal shell, backdrop, and
 * double-dim guard along with it. What's left here is exactly the row list.
 *
 * Selecting a game calls `onSelect` and its caller (settings-modal.tsx) slides
 * back to the menu — a pick is a complete action here, same as before.
 *
 * Paid-tier Games resolved as `early_access` wear an "Included in early
 * access" pill (ADR-0006): players learn these are paid features before
 * purchases exist, so the future paywall is a communicated transition rather
 * than a silent removal.
 */
export const GameSettingsPage = ({current, onSelect, onBack}: GameSettingsPageProps) => {
  const [entitlements, setEntitlements] = useState<Partial<Record<GameId, Entitlement>>>({})

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      GAME_CATALOG.map(async (game) => [game.id, await getEntitlement(game.tier)] as const)
    ).then((entries) => {
      if (!cancelled) setEntitlements(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const {height: windowHeight} = useWindowDimensions()
  const sheetMaxHeight = windowHeight * SHEET_MAX_HEIGHT_RATIO

  return (
    <View>
      <SettingsSheetHeader title="Choose your game" icon="back" onPress={onBack} />
      <ScrollView style={{maxHeight: sheetMaxHeight}} bounces={false}>
        {GAME_CATALOG.map((game) => {
          const selected = game.id === current
          const entitlement = entitlements[game.id]
          return (
            <Pressable
              key={game.id}
              onPress={() => onSelect(game.id)}
              accessibilityRole="button"
              accessibilityLabel={game.title}
              accessibilityState={{selected}}
              className={`gap-1 px-5 py-4 ${selected ? 'bg-yellow-300/40' : ''}`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Text className="text-darker dark:text-white font-sans text-lg">
                    {game.title}
                  </Text>
                  {entitlement?.granted && entitlement.reason === 'early_access' ? (
                    <View className="rounded-full bg-yellow-400 px-2 py-0.5">
                      <Text className="text-darker font-sans text-xs font-bold">
                        Included in early access
                      </Text>
                    </View>
                  ) : null}
                </View>
                {selected ? (
                  <Text className="text-accentOnLight dark:text-accentOnDark text-lg font-bold">
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                {game.description}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
