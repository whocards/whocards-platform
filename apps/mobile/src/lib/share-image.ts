import {File, Paths} from 'expo-file-system'
import * as Sharing from 'expo-sharing'

/**
 * Downloads a Share Card PNG (the on-demand endpoint behind {@link
 * buildShareCardUrl}) to a local cache file and hands it to the OS share sheet
 * as an image file via `expo-sharing`. This is what makes image-only targets
 * like Instagram Stories, TikTok, and WhatsApp status show up as destinations —
 * RN's `Share.share` can only carry text/url, never a file.
 *
 * Every call downloads to a fresh, timestamped cache filename so a retry after
 * a failed/partial download never collides with a stale leftover file.
 *
 * Rejects on a download failure (offline, 404 for an unknown id/language/size,
 * server error) or if the OS has no share targets available — callers surface
 * this as a graceful inline message and leave the sheet usable (issue #154).
 */
export const downloadAndShareImage = async (url: string): Promise<void> => {
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing is not available on this device')

  const destination = new File(Paths.cache, `share-card-${Date.now()}.png`)
  const file = await File.downloadFileAsync(url, destination)
  await Sharing.shareAsync(file.uri, {mimeType: 'image/png', UTI: 'public.png'})
}
