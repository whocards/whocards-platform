import {Ionicons} from '@expo/vector-icons'
import {logWarn} from '@whocards/observability'
import type {ShareFormat} from '@whocards/observability/events'
import {StatusBar} from 'expo-status-bar'
import {useCallback, useEffect, useState} from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors} from '@whocards/tokens'

import {downloadAndShareImage} from '@/lib/share-image'

export type {ShareFormat}

type ShareModalProps = {
  visible: boolean
  /** The question text, used only for the link row's message payload. */
  questionText: string
  /** The web deep-link — today's unchanged share payload. */
  shareUrl: string
  /** On-demand Share Card image URLs (issue #153 / ADR-0007). */
  storyImageUrl: string
  postImageUrl: string
  /** Fired once a row's OS share sheet has been successfully invoked. */
  onShare: (format: ShareFormat) => void
  onClose: () => void
}

type Row = {
  format: ShareFormat
  icon: keyof typeof Ionicons.glyphMap
  label: string
}

const ROWS: Row[] = [
  {format: 'link', icon: 'link-outline', label: 'Share link'},
  {format: 'story', icon: 'phone-portrait-outline', label: 'Story image'},
  {format: 'post', icon: 'image-outline', label: 'Post image'},
]

/**
 * Native Share picker — same OS sheet treatment as the language/game modals
 * (`presentationStyle="pageSheet"`). Offers the web deep-link (unchanged payload,
 * works offline) alongside the two on-demand Share Card images (issue #154).
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
    (format: ShareFormat) => {
      if (pending) return
      if (format === 'link') {
        shareLink()
        return
      }
      shareImage(format, format === 'story' ? storyImageUrl : postImageUrl)
    },
    [pending, shareLink, shareImage, storyImageUrl, postImageUrl]
  )

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      {/* Dark status-bar icons are legible over this white sheet. */}
      <StatusBar style="dark" />
      <View className="flex-1 bg-white">
        {/* On Android, pageSheet renders behind the status bar, so push the header
            below the display cutout. On iOS the card sheet already insets itself. */}
        <View
          className="border-gray-lighter flex-row items-center justify-between border-b px-5 py-4"
          style={{paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 16}}
        >
          <Text className="text-darker font-title text-2xl">Share</Text>
          <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.darker} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{paddingBottom: Math.max(insets.bottom, 24)}}>
          {ROWS.map((row) => {
            const isPending = pending === row.format
            const disabled = pending !== null && !isPending
            return (
              <Pressable
                key={row.format}
                onPress={() => handlePress(row.format)}
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
        </ScrollView>
      </View>
    </Modal>
  )
}
