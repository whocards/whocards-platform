import {Ionicons} from '@expo/vector-icons'
import {BottomSheet, RNHostView} from '@expo/ui'
import {logWarn} from '@whocards/observability'
import {EVENTS} from '@whocards/observability/events'
import type {ShareEventName, ShareFormat} from '@whocards/observability/events'
import {useCallback, useState} from 'react'
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import {colors} from '@whocards/tokens'

import {useIsDark} from '@/lib/color-scheme'
import {useT} from '@/lib/i18n'
import {downloadAndShareImage} from '@/lib/share-image'
import {ASKER_NAME_MAX, buildAskMessage, buildAskUrl} from '@/lib/share-url'
import {sheetTheme} from '@/lib/sheet-theme'

// Caps the rows at this fraction of the window; they only scroll under max Dynamic Type or in landscape.
const SHEET_MAX_HEIGHT_RATIO = 0.8

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
  /** Opened on every OS share sheet; completed only when the OS confirms it (an iOS link share). */
  onShareEvent: (name: ShareEventName, format: ShareFormat) => void
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
 * The Share picker: the same native bottom sheet as Settings (settings-modal.tsx), sized to its
 * rows. It offers the web link (works offline), an ask, and the two on-demand Share Card images
 * when the deck supports them; a link-only sheet is a normal state. An image row downloads the PNG
 * and hands the file to the OS share sheet; a failed download shows an inline message and leaves
 * the sheet usable.
 *
 * Closes once the player is back from the OS share sheet (owner, on-device 2026-11-26), shared or
 * cancelled. It closes on the way back, never while the OS sheet is opening: tearing a sheet
 * down under an opening Android chooser left touch dispatch stuck (issue #192).
 */
export const ShareModal = ({
  visible,
  questionText,
  shareUrl,
  storyImageUrl,
  postImageUrl,
  onShareEvent,
  onClose,
}: ShareModalProps) => {
  // The row currently downloading its image — drives the spinner + disables the
  // other rows so a slow download can't be started twice from a double-tap.
  const [pending, setPending] = useState<ShareFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The ask row (issue #434) opens an optional name field before anything is sent.
  const [askOpen, setAskOpen] = useState(false)
  const [askerName, setAskerName] = useState('')
  // Themed (issue #163, amendment 1): a dark surface in dark mode, the
  // pre-existing light sheet surface in light mode.
  const isDark = useIsDark()
  const t = useT()
  const iconColor = isDark ? colors.white : colors.darker
  const spinnerColor = isDark ? colors.gray.dark : colors.mutedOnLight

  // Story/Post are only offered when the caller supplied their URL (i.e. the
  // current deck is Pool-backed — see the prop docs above). A link-only sheet
  // is a normal, intentional state.
  const rows: Row[] = [
    {format: 'link', icon: 'link-outline', label: t('share.link')},
    {format: 'ask', icon: 'chatbubbles-outline', label: t('share.ask')},
    ...(storyImageUrl
      ? [
          {
            format: 'story',
            icon: 'phone-portrait-outline',
            label: t('share.story'),
            url: storyImageUrl,
          } as const,
        ]
      : []),
    ...(postImageUrl
      ? [
          {
            format: 'post',
            icon: 'image-outline',
            label: t('share.post'),
            url: postImageUrl,
          } as const,
        ]
      : []),
  ]

  // Android's Share.share resolves as its chooser opens, so there the close waits for the app to return.
  const closeAfterShare = useCallback(
    (resolvedOnOpen = false) => {
      if (!(resolvedOnOpen && Platform.OS === 'android')) {
        onClose()
        return
      }
      const sub = AppState.addEventListener('change', (state) => {
        if (state !== 'active') return
        sub.remove()
        onClose()
      })
    },
    [onClose]
  )

  // Clear stale state whenever the sheet is (re)opened for a (possibly new) card.
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setPending(null)
      setError(null)
      setAskOpen(false)
      setAskerName('')
    }
  }

  const shareLink = useCallback(() => {
    setError(null)
    // `url` is read by iOS share sheet; `message` carries the link on Android (which
    // ignores the `url` field) and provides a fallback for any platform. Offline-safe
    // — exactly today's payload, no network involved.
    Share.share({message: `${questionText}\n\n${shareUrl}`, url: shareUrl})
      .then((result) => {
        onShareEvent(EVENTS.SHARE_SHEET_OPENED, 'link')
        // Android's Share.share (ShareModule.kt) resolves `sharedAction` the instant the chooser opens (issue #200).
        if (Platform.OS === 'ios' && result.action === Share.sharedAction) {
          onShareEvent(EVENTS.SHARE_COMPLETED, 'link')
        }
        closeAfterShare(true)
      })
      .catch((err: unknown) => {
        logWarn('[share-modal] link share failed', err)
      })
  }, [questionText, shareUrl, onShareEvent, closeAfterShare])

  const shareImage = useCallback(
    (format: Exclude<ShareFormat, 'link' | 'ask'>, url: string) => {
      setError(null)
      setPending(format)
      downloadAndShareImage(url)
        .then(() => {
          setPending(null)
          // expo-sharing resolves on any dismissal, so an image share never reports completion (issue #200).
          onShareEvent(EVENTS.SHARE_SHEET_OPENED, format)
          closeAfterShare()
        })
        .catch((err: unknown) => {
          logWarn(`[share-modal] ${format} image share failed`, err)
          setPending(null)
          setError(t('share.imageError'))
        })
    },
    [onShareEvent, closeAfterShare, t]
  )

  const sendAsk = useCallback(() => {
    if (pending) return
    const message = buildAskMessage(
      questionText,
      buildAskUrl(shareUrl, askerName),
      t('share.askIntro')
    )
    Share.share({message})
      .then((result) => {
        closeAfterShare(true)
        // iOS reports a cancel; Android resolves as its chooser opens, so it counts there (issue #200).
        if (Platform.OS === 'ios' && result.action !== Share.sharedAction) return
        onShareEvent(EVENTS.ASK_SENT, 'ask')
      })
      .catch((err: unknown) => {
        logWarn('[share-modal] ask share failed', err)
      })
  }, [pending, questionText, shareUrl, askerName, onShareEvent, closeAfterShare, t])

  const handlePress = useCallback(
    (row: Row) => {
      if (pending) return
      if (row.format === 'link') {
        shareLink()
        return
      }
      if (row.format === 'ask') {
        setAskOpen(true)
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

  const {height: windowHeight} = useWindowDimensions()
  const sheetMaxHeight = windowHeight * SHEET_MAX_HEIGHT_RATIO

  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={onClose}
      contentPadding={0}
      {...sheetTheme(isDark)}
    >
      <RNHostView matchContents={{vertical: true}}>
        <ScrollView
          style={{maxHeight: sheetMaxHeight}}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between px-5 pb-2 pt-6">
            <Text className="text-darker dark:text-white font-title text-2xl">
              {t('share.title')}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel={t('a11y.close')} hitSlop={12}>
              <Ionicons name="close" size={24} color={iconColor} />
            </Pressable>
          </View>

          {rows.map((row, index) => {
            const isPending = pending === row.format
            const disabled = pending !== null && !isPending
            // The Settings sheet's dividers: a line under every row but the last.
            const divider = `border-gray-lighter dark:border-white/10 min-h-14 ${index < rows.length - 1 ? 'border-b' : ''}`
            if (row.format === 'ask' && askOpen) {
              return (
                <View
                  key={row.format}
                  className={`flex-row items-center gap-3 px-5 py-2 ${divider}`}
                >
                  <Ionicons name={row.icon} size={22} color={iconColor} />
                  <TextInput
                    value={askerName}
                    onChangeText={setAskerName}
                    onSubmitEditing={sendAsk}
                    placeholder={t('share.namePlaceholder')}
                    placeholderTextColor={spinnerColor}
                    maxLength={ASKER_NAME_MAX}
                    returnKeyType="send"
                    accessibilityLabel={t('share.namePlaceholder')}
                    className="text-darker dark:text-white font-sans text-lg flex-1 py-2"
                  />
                  <Pressable
                    onPress={sendAsk}
                    accessibilityRole="button"
                    accessibilityLabel={t('share.sendAsk')}
                    hitSlop={8}
                    className="active:bg-yellow-500 rounded-full bg-yellow-400 px-4 py-2"
                  >
                    <Text className="text-darker font-sans text-base">{t('share.send')}</Text>
                  </Pressable>
                </View>
              )
            }
            return (
              <Pressable
                key={row.format}
                onPress={() => handlePress(row)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                accessibilityState={{disabled, busy: isPending}}
                className={`flex-row items-center gap-3 px-5 py-2 ${divider} ${disabled ? 'opacity-40' : ''}`}
              >
                <Ionicons name={row.icon} size={22} color={iconColor} />
                <Text className="text-darker dark:text-white font-sans text-lg">{row.label}</Text>
                {isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={spinnerColor}
                    style={{marginLeft: 'auto'}}
                  />
                ) : null}
              </Pressable>
            )
          })}

          {error ? (
            <View className="px-5 pt-2">
              <Text className="text-errorOnLight dark:text-errorOnDark font-sans text-sm">
                {error}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </RNHostView>
    </BottomSheet>
  )
}
