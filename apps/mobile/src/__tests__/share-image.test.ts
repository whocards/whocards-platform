/**
 * Tests for src/lib/share-image.ts
 *
 * downloadAndShareImage is the seam that turns a Share Card URL into a file the
 * OS share sheet can hand to image-only targets (Instagram Stories, WhatsApp
 * status, etc.) — something RN's `Share.share` can't do. Both `expo-file-system`
 * and `expo-sharing` are native modules, so they're mocked here; the behaviour
 * under test is the sequencing and error handling, not the native download/share
 * itself (that's exercised manually per the issue's device-smoke step).
 */
// jest hoists jest.mock() factories above imports; only `mock`-prefixed names
// are allowed to cross that hoist boundary (see jest's out-of-scope-variable guard).
const mockDownloadFileAsync = jest.fn()
const mockShareAsync = jest.fn()
const mockIsAvailableAsync = jest.fn()

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string
    constructor(..._parts: unknown[]) {
      this.uri = 'file:///mock-cache/share-card.png'
    }
    static downloadFileAsync: (...args: unknown[]) => Promise<{uri: string}> = (
      ...args: unknown[]
    ) => mockDownloadFileAsync(...args)
  },
  Paths: {cache: 'file:///mock-cache/'},
}))

jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailableAsync(),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}))

import {downloadAndShareImage} from '../lib/share-image'

describe('downloadAndShareImage', () => {
  beforeEach(() => {
    mockDownloadFileAsync.mockReset()
    mockShareAsync.mockReset()
    mockIsAvailableAsync.mockReset()
    mockIsAvailableAsync.mockResolvedValue(true)
  })

  it('downloads the PNG to a local cache file and hands its URI to the OS share sheet', async () => {
    mockDownloadFileAsync.mockResolvedValue({uri: 'file:///mock-cache/share-card.png'})

    await downloadAndShareImage('https://whocards.cc/share-card/story/en/q-1.png')

    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      'https://whocards.cc/share-card/story/en/q-1.png',
      expect.anything()
    )
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///mock-cache/share-card.png',
      expect.objectContaining({mimeType: 'image/png'})
    )
  })

  it('rejects without downloading when the OS has no share targets available', async () => {
    mockIsAvailableAsync.mockResolvedValue(false)

    await expect(
      downloadAndShareImage('https://whocards.cc/share-card/story/en/q-1.png')
    ).rejects.toThrow()
    expect(mockDownloadFileAsync).not.toHaveBeenCalled()
  })

  it('propagates a download failure (offline, 404, server error) to the caller', async () => {
    mockDownloadFileAsync.mockRejectedValue(new Error('Unable to download: 404'))

    await expect(
      downloadAndShareImage('https://whocards.cc/share-card/story/en/missing.png')
    ).rejects.toThrow('Unable to download: 404')
    expect(mockShareAsync).not.toHaveBeenCalled()
  })

  it('propagates a share-sheet failure to the caller', async () => {
    mockDownloadFileAsync.mockResolvedValue({uri: 'file:///mock-cache/share-card.png'})
    mockShareAsync.mockRejectedValue(new Error('share cancelled'))

    await expect(
      downloadAndShareImage('https://whocards.cc/share-card/story/en/q-1.png')
    ).rejects.toThrow('share cancelled')
  })
})
