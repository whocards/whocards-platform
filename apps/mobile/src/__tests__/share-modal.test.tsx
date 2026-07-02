/**
 * Component tests for src/components/share-modal.tsx
 *
 * Covers the acceptance criteria from issue #154:
 * - three rows render (link / story / post) when storyImageUrl/postImageUrl
 *   are supplied — the caller (play/[deck].tsx, pick-player.tsx) only supplies
 *   them for a Pool-backed deck (`isPoolBacked`); an inline-source deck (e.g.
 *   ai-at-work, hajnalig) omits them, since the Share Card endpoint resolves
 *   ids against the global Pool only — an inline deck's ids either 404 or
 *   (worse) collide with an unrelated Pool id and silently serve the wrong
 *   image (PR #159 review finding)
 * - the link row hands the unchanged message+url payload to the OS share sheet
 *   and never touches the network, for every deck
 * - an image row downloads-then-shares and reports completion via onShare
 * - an image download failure shows an inline message and leaves the sheet
 *   open and usable — the link row still works afterwards
 */
import React from 'react'
import {Share} from 'react-native'
import {act, fireEvent, render, screen} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

const mockDownloadAndShareImage = jest.fn()
jest.mock('@/lib/share-image', () => ({
  downloadAndShareImage: (...args: unknown[]) => mockDownloadAndShareImage(...args),
}))

import {ShareModal} from '../components/share-modal'

const PROPS = {
  questionText: 'What is your favorite memory?',
  shareUrl: 'https://whocards.cc/play?lang=en&q=q-1',
  storyImageUrl: 'https://whocards.cc/share-card/story/en/q-1.png',
  postImageUrl: 'https://whocards.cc/share-card/post/en/q-1.png',
}

describe('ShareModal', () => {
  let shareSpy: jest.SpyInstance

  beforeEach(() => {
    mockDownloadAndShareImage.mockReset()
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as never)
  })

  afterEach(() => {
    shareSpy.mockRestore()
  })

  it('renders all three rows when the caller supplies both image URLs (a Pool-backed deck)', () => {
    render(<ShareModal visible {...PROPS} onShare={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Share link')).toBeTruthy()
    expect(screen.getByText('Story image')).toBeTruthy()
    expect(screen.getByText('Post image')).toBeTruthy()
  })

  it('renders only the link row when the image URLs are omitted (an inline-source deck)', () => {
    render(
      <ShareModal
        visible
        questionText={PROPS.questionText}
        shareUrl={PROPS.shareUrl}
        onShare={() => {}}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Share link')).toBeTruthy()
    expect(screen.queryByText('Story image')).toBeNull()
    expect(screen.queryByText('Post image')).toBeNull()
  })

  it('renders only the link row when just one image URL is omitted', () => {
    render(
      <ShareModal
        visible
        questionText={PROPS.questionText}
        shareUrl={PROPS.shareUrl}
        storyImageUrl={PROPS.storyImageUrl}
        onShare={() => {}}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Share link')).toBeTruthy()
    expect(screen.getByText('Story image')).toBeTruthy()
    expect(screen.queryByText('Post image')).toBeNull()
  })

  it('shares the unchanged link payload and reports completion, without touching the network', async () => {
    const onShare = jest.fn()
    const onClose = jest.fn()
    render(<ShareModal visible {...PROPS} onShare={onShare} onClose={onClose} />)

    await act(async () => {
      fireEvent.press(screen.getByText('Share link'))
    })

    expect(shareSpy).toHaveBeenCalledWith({
      message: `${PROPS.questionText}\n\n${PROPS.shareUrl}`,
      url: PROPS.shareUrl,
    })
    expect(mockDownloadAndShareImage).not.toHaveBeenCalled()
    expect(onShare).toHaveBeenCalledWith('link')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not report completion when the link share sheet is dismissed', async () => {
    shareSpy.mockResolvedValue({action: Share.dismissedAction} as never)
    const onShare = jest.fn()
    const onClose = jest.fn()
    render(<ShareModal visible {...PROPS} onShare={onShare} onClose={onClose} />)

    await act(async () => {
      fireEvent.press(screen.getByText('Share link'))
    })

    expect(onShare).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('downloads and shares the story image, then reports completion', async () => {
    mockDownloadAndShareImage.mockResolvedValue(undefined)
    const onShare = jest.fn()
    const onClose = jest.fn()
    render(<ShareModal visible {...PROPS} onShare={onShare} onClose={onClose} />)

    await act(async () => {
      fireEvent.press(screen.getByText('Story image'))
    })

    expect(mockDownloadAndShareImage).toHaveBeenCalledWith(PROPS.storyImageUrl)
    expect(onShare).toHaveBeenCalledWith('story')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a graceful inline message on an image failure and keeps the sheet usable', async () => {
    mockDownloadAndShareImage.mockRejectedValue(new Error('network request failed'))
    const onShare = jest.fn()
    const onClose = jest.fn()
    render(<ShareModal visible {...PROPS} onShare={onShare} onClose={onClose} />)

    await act(async () => {
      fireEvent.press(screen.getByText('Post image'))
    })

    expect(onShare).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(/couldn't load the image/i)).toBeTruthy()

    // the link row must still work offline after an image failure
    await act(async () => {
      fireEvent.press(screen.getByText('Share link'))
    })
    expect(shareSpy).toHaveBeenCalled()
    expect(onShare).toHaveBeenCalledWith('link')
  })
})
