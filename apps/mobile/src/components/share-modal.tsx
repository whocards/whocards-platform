import {Ionicons} from '@expo/vector-icons'
import {logWarn} from '@whocards/observability'
import type {ShareFormat} from '@whocards/observability/events'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {ActivityIndicator, Modal, Pressable, Share, Text, View} from 'react-native'
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors} from '@whocards/tokens'

import {downloadAndShareImage} from '@/lib/share-image'

// A downward drag past this many px, or a fling faster than this velocity
// (px/s), counts as "swipe down" and dismisses the sheet — mirrors the
// SWIPE_THRESHOLD-and-velocity pattern used for the card swipe in pick-player.tsx.
const SWIPE_DISMISS_DISTANCE = 80
const SWIPE_DISMISS_VELOCITY = 800

export type {ShareFormat}

type ShareModalProps = {
  visible: boolean
  /** The question text, used only for the link row's message payload. */
  questionText: string
  /** The web deep-link — today's unchanged share payload. Offered for every deck. */
  shareUrl: string
  /**
   * On-demand Share Card image URLs (issue #153 / ADR-0007). Omit both when the
   * current deck isn't Pool-backed (`@whocards/decks`' `isPoolBacked`) — the
   * endpoint resolves ids against the global Pool only, so an inline deck's ids
   * either 404 or (worse) collide with an unrelated Pool id and silently serve
   * the wrong image. The sheet then shows the link row alone.
   */
  storyImageUrl?: string
  postImageUrl?: string
  /** Fired once a row's OS share sheet has been successfully invoked. */
  onShare: (format: ShareFormat) => void
  onClose: () => void
}

type Row = {
  format: ShareFormat
  icon: keyof typeof Ionicons.glyphMap
  label: string
  /** The Share Card URL for an image row; undefined (and unused) for the link row. */
  url?: string
}

/**
 * Native Share picker — a compact bottom sheet sized to its content (title +
 * up to three rows), anchored to the bottom edge with the screen behind it
 * dimmed (issue #162). Unlike the language/game modals (`presentationStyle=
 * "pageSheet"`, a native full-height card sheet — appropriate there since a
 * language list can run long), this sheet's content is always small and
 * fixed-size, so a full-height native sheet wasted most of the screen. That's
 * an intentional divergence, not an oversight — the language/game modals are
 * unaffected by this change.
 *
 * Built on a transparent, `overFullScreen` `Modal` (RN's own suggestion for a
 * custom-height sheet — there's no first-class "compact detent" API) rather
 * than a bottom-sheet library: the content is simple enough that a dimmed
 * backdrop + a bottom-anchored, content-sized `View` gets the native
 * partial-height feel without a new native dependency. Tapping the backdrop,
 * or swiping down on the sheet, both call `onClose`; a `GestureDetector` pan
 * (`react-native-gesture-handler`, already a dependency — see pick-player.tsx's
 * card swipe) drives the swipe, wrapped in its own `GestureHandlerRootView`
 * since gestures inside an RN `Modal` need a fresh root (the Modal renders
 * into a separate native surface).
 *
 * Offers the web deep-link (unchanged payload, works offline) alongside the
 * two on-demand Share Card images (issue #154) — when the current deck
 * supports them (see `storyImageUrl`/`postImageUrl` above). A link-only sheet
 * (one row) is a normal, intentional state, not a degraded one.
 *
 * The link row never touches the network. The image rows download the PNG to a
 * local cache file (`@/lib/share-image`) and hand it to the OS share sheet as a
 * file, which is what makes Instagram/TikTok/WhatsApp status show up as targets.
 * A download failure (offline, endpoint error) shows a brief inline message and
 * leaves the sheet open and usable — it never blocks the link row.
 */
export const ShareModal = ({
  visible,
  questionText,
  shareUrl,
  storyImageUrl,
  postImageUrl,
  onShare,
  onClose,
}: ShareModalProps) => {
  const insets = useSafeAreaInsets()
  // The row currently downloading its image — drives the spinner + disables the
  // other rows so a slow download can't be started twice from a double-tap.
  const [pending, setPending] = useState<ShareFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Story/Post are only offered when the caller supplied their URL (i.e. the
  // current deck is Pool-backed — see the prop docs above). A link-only sheet
  // is a normal, intentional state.
  const rows: Row[] = [
    {format: 'link', icon: 'link-outline', label: 'Share link'},
    ...(storyImageUrl
      ? [
          {
            format: 'story',
            icon: 'phone-portrait-outline',
            label: 'Story image',
            url: storyImageUrl,
          } as const,
        ]
      : []),
    ...(postImageUrl
      ? [{format: 'post', icon: 'image-outline', label: 'Post image', url: postImageUrl} as const]
      : []),
  ]

  // Clear stale state whenever the sheet is (re)opened for a (possibly new) card.
  useEffect(() => {
    if (visible) {
      setPending(null)
      setError(null)
    }
  }, [visible])

  const shareLink = useCallback(() => {
    setError(null)
    // `url` is read by iOS share sheet; `message` carries the link on Android (which
    // ignores the `url` field) and provides a fallback for any platform. Offline-safe
    // — exactly today's payload, no network involved.
    Share.share({message: `${questionText}\n\n${shareUrl}`, url: shareUrl})
      .then((result) => {
        // iOS reports an explicit cancel; Android's Share.share resolves as soon as
        // the chooser opens, with no completion signal either way — best-effort.
        if (result.action === Share.dismissedAction) return
        onShare('link')
        onClose()
      })
      .catch((err: unknown) => {
        logWarn('[share-modal] link share failed', err)
      })
  }, [questionText, shareUrl, onShare, onClose])

  const shareImage = useCallback(
    (format: Exclude<ShareFormat, 'link'>, url: string) => {
      setError(null)
      setPending(format)
      downloadAndShareImage(url)
        .then(() => {
          setPending(null)
          onShare(format)
          onClose()
        })
        .catch((err: unknown) => {
          logWarn(`[share-modal] ${format} image share failed`, err)
          setPending(null)
          setError("Couldn't load the image — check your connection and try again.")
        })
    },
    [onShare, onClose]
  )

  const handlePress = useCallback(
    (row: Row) => {
      if (pending) return
      if (row.format === 'link') {
        shareLink()
        return
      }
      // Every non-link row in `rows` is only ever built with its `url` set (see
      // above), so this is unreachable in practice — the guard just keeps the
      // type honest without a non-null assertion.
      if (!row.url) return
      shareImage(row.format, row.url)
    },
    [pending, shareLink, shareImage]
  )

  // Swipe-down-to-dismiss: scoped to the drag handle only (not the whole sheet)
  // so it can't fight the row Pressables for the touch. `onEnd` rather than a
  // live `onUpdate` — the sheet doesn't track the finger, it just dismisses
  // past a distance/velocity threshold, keeping this in step with the Modal's
  // own `animationType="slide"` rather than driving a second animation.
  // `.runOnJS(true)` runs the callback directly on the JS thread — plain
  // `onClose`, no 'worklet' pragma or reanimated runtime needed.
  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onEnd((event) => {
          if (
            event.translationY > SWIPE_DISMISS_DISTANCE ||
            event.velocityY > SWIPE_DISMISS_VELOCITY
          ) {
            onClose()
          }
        }),
    [onClose]
  )

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Gestures inside an RN Modal need their own root — the Modal renders
          into a separate native surface that isn't a descendant of the app's
          top-level GestureHandlerRootView (see _layout.tsx). */}
      <GestureHandlerRootView style={{flex: 1}}>
        <View className="flex-1 justify-end">
          {/* Dimmed backdrop — the card underneath stays visible. Tapping it
              dismisses; the sheet below swallows its own taps (see the no-op
              onPress) so tapping the sheet itself doesn't also close it. */}
          <Pressable
            className="absolute inset-0 bg-black/50"
            onPress={onClose}
            accessibilityLabel="dismiss"
          />
          <View
            className="rounded-t-3xl bg-white"
            style={{paddingBottom: Math.max(insets.bottom, 24)}}
          >
            <GestureDetector gesture={swipeDown}>
              <View className="items-center pb-1 pt-3">
                <View className="h-1 w-10 rounded-full bg-gray-lighter" />
              </View>
            </GestureDetector>

            {/* No-op tap target: swallows taps landing on the sheet's own
                whitespace so they don't fall through to the backdrop above and
                close the sheet. `accessible={false}` keeps this out of the
                accessibility tree so it doesn't swallow the rows' own labels
                (a Pressable is `accessible` by default, which would otherwise
                group everything below into a single unlabeled element). */}
            <Pressable onPress={() => {}} accessible={false}>
              <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
                <Text className="text-darker font-title text-2xl">Share</Text>
                <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
                  <Ionicons name="close" size={24} color={colors.darker} />
                </Pressable>
              </View>

              {rows.map((row) => {
                const isPending = pending === row.format
                const disabled = pending !== null && !isPending
                return (
                  <Pressable
                    key={row.format}
                    onPress={() => handlePress(row)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={row.label}
                    accessibilityState={{disabled, busy: isPending}}
                    className={`flex-row items-center gap-3 px-5 py-4 ${disabled ? 'opacity-40' : ''}`}
                  >
                    <Ionicons name={row.icon} size={22} color={colors.darker} />
                    <Text className="text-darker font-sans text-lg">{row.label}</Text>
                    {isPending ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.gray.dark}
                        style={{marginLeft: 'auto'}}
                      />
                    ) : null}
                  </Pressable>
                )
              })}

              {error ? (
                <View className="px-5 pt-2">
                  <Text className="text-red font-sans text-sm">{error}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}
