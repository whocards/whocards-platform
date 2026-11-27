/** ShareModal: its rows, what each share reports, and when the sheet closes (the native sheet is stood in by test-utils/expo-ui-mock). */
import React from 'react'
import {AppState, Platform, Share} from 'react-native'
import {EVENTS} from '@whocards/observability/events'
import {act, fireEvent, render, screen} from '@testing-library/react-native'
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

const setPlatform = (os: 'ios' | 'android') =>
  Object.defineProperty(Platform, 'OS', {configurable: true, value: os})

describe('ShareModal', () => {
  let shareSpy: jest.SpyInstance
  const originalOS = Platform.OS

  beforeEach(() => {
    setPlatform('ios')
    mockDownloadAndShareImage.mockReset()
    shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({action: 'sharedAction', activityType: undefined})
  })

  afterEach(() => {
    shareSpy.mockRestore()
    Object.defineProperty(Platform, 'OS', {configurable: true, value: originalOS})
  })

  it('renders all three rows when the caller supplies both image URLs (a Pool-backed deck)', async () => {
    await render(<ShareModal visible {...PROPS} onShareEvent={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Share link')).toBeTruthy()
    expect(screen.getByText('Story image')).toBeTruthy()
    expect(screen.getByText('Post image')).toBeTruthy()
  })

  it('sends an ask with the typed name in the link only, never in the event (issue #434)', async () => {
    const onShareEvent = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={onShareEvent} onClose={() => {}} />)

    await fireEvent.press(screen.getByText('Ask someone'))
    await fireEvent.changeText(screen.getByLabelText('Your name (optional)'), 'Avi')
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Send ask'))
    })

    const {message} = shareSpy.mock.calls[0][0]
    expect(message).toContain(PROPS.questionText)
    expect(message).toContain(`${PROPS.shareUrl}&ask=1&from=Avi`)
    expect(onShareEvent.mock.calls).toEqual([[EVENTS.ASK_SENT, 'ask']])
  })

  it('does not count an ask the player cancels on iOS', async () => {
    shareSpy.mockResolvedValue({action: Share.dismissedAction})
    const onShareEvent = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={onShareEvent} onClose={() => {}} />)
    await fireEvent.press(screen.getByText('Ask someone'))
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Send ask'))
    })
    expect(onShareEvent).not.toHaveBeenCalled()
  })

  it('renders only the link row when the image URLs are omitted (an inline-source deck)', async () => {
    await render(
      <ShareModal
        visible
        questionText={PROPS.questionText}
        shareUrl={PROPS.shareUrl}
        onShareEvent={() => {}}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Share link')).toBeTruthy()
    expect(screen.queryByText('Story image')).toBeNull()
    expect(screen.queryByText('Post image')).toBeNull()
  })

  it('renders only the link row when just one image URL is omitted', async () => {
    await render(
      <ShareModal
        visible
        questionText={PROPS.questionText}
        shareUrl={PROPS.shareUrl}
        storyImageUrl={PROPS.storyImageUrl}
        onShareEvent={() => {}}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Share link')).toBeTruthy()
    expect(screen.getByText('Story image')).toBeTruthy()
    expect(screen.queryByText('Post image')).toBeNull()
  })

  it('shares the unchanged link payload, reports open then completion (iOS), and closes', async () => {
    const onShareEvent = jest.fn()
    const onClose = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={onShareEvent} onClose={onClose} />)

    await act(async () => {
      await fireEvent.press(screen.getByText('Share link'))
    })

    expect(shareSpy).toHaveBeenCalledWith({
      message: `${PROPS.questionText}\n\n${PROPS.shareUrl}`,
      url: PROPS.shareUrl,
    })
    expect(mockDownloadAndShareImage).not.toHaveBeenCalled()
    expect(onShareEvent.mock.calls).toEqual([
      [EVENTS.SHARE_SHEET_OPENED, 'link'],
      [EVENTS.SHARE_COMPLETED, 'link'],
    ])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reports only the opened sheet when the link share sheet is explicitly cancelled (iOS)', async () => {
    shareSpy.mockResolvedValue({action: Share.dismissedAction})
    const onShareEvent = jest.fn()
    const onClose = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={onShareEvent} onClose={onClose} />)

    await act(async () => {
      await fireEvent.press(screen.getByText('Share link'))
    })

    expect(onShareEvent.mock.calls).toEqual([[EVENTS.SHARE_SHEET_OPENED, 'link']])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Android's Share.share resolves `sharedAction` the instant the chooser opens.
  it('reports only the opened chooser for an Android link share, never completion, and closes once the app is back', async () => {
    setPlatform('android')
    const onShareEvent = jest.fn()
    const onClose = jest.fn()
    const appState = jest.spyOn(AppState, 'addEventListener')
    await render(<ShareModal visible {...PROPS} onShareEvent={onShareEvent} onClose={onClose} />)

    await act(async () => {
      await fireEvent.press(screen.getByText('Share link'))
    })

    expect(onShareEvent.mock.calls).toEqual([[EVENTS.SHARE_SHEET_OPENED, 'link']])
    // Share.share resolved as the chooser opened: closing now is the stuck-touch race (issue #192).
    expect(onClose).not.toHaveBeenCalled()
    const onChange = appState.mock.calls.at(-1)?.[1]
    await act(() => onChange?.('background'))
    expect(onClose).not.toHaveBeenCalled()
    await act(() => onChange?.('active'))
    expect(onClose).toHaveBeenCalledTimes(1)
    appState.mockRestore()
  })

  it.each(['ios', 'android'] as const)(
    'reports only the opened sheet for an image share on %s, never completion',
    async (os) => {
      setPlatform(os)
      mockDownloadAndShareImage.mockResolvedValue(undefined)
      const onShareEvent = jest.fn()
      await render(<ShareModal visible {...PROPS} onShareEvent={onShareEvent} onClose={() => {}} />)

      await act(async () => {
        await fireEvent.press(screen.getByText('Story image'))
      })

      expect(onShareEvent.mock.calls).toEqual([[EVENTS.SHARE_SHEET_OPENED, 'story']])
    }
  )

  it('downloads and shares the story image, reports the opened sheet, and closes', async () => {
    mockDownloadAndShareImage.mockResolvedValue(undefined)
    const onShareEvent = jest.fn()
    const onClose = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={onShareEvent} onClose={onClose} />)

    await act(async () => {
      await fireEvent.press(screen.getByText('Story image'))
    })

    expect(mockDownloadAndShareImage).toHaveBeenCalledWith(PROPS.storyImageUrl)
    expect(onShareEvent).toHaveBeenCalledWith(EVENTS.SHARE_SHEET_OPENED, 'story')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clears a stale error when the sheet is closed and reopened (issue #236)', async () => {
    mockDownloadAndShareImage.mockRejectedValue(new Error('network request failed'))
    const props = {...PROPS, onShareEvent: () => {}, onClose: () => {}}
    const {rerender} = await render(<ShareModal visible {...props} />)
    await act(async () => {
      await fireEvent.press(screen.getByText('Post image'))
    })
    expect(screen.getByText(/couldn't load the image/i)).toBeTruthy()

    await rerender(<ShareModal visible={false} {...props} />)
    await rerender(<ShareModal visible {...props} />)
    expect(screen.queryByText(/couldn't load the image/i)).toBeNull()
  })

  it('shows a graceful inline message on an image failure and keeps the sheet usable', async () => {
    mockDownloadAndShareImage.mockRejectedValue(new Error('network request failed'))
    const onShareEvent = jest.fn()
    const onClose = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={onShareEvent} onClose={onClose} />)

    await act(async () => {
      await fireEvent.press(screen.getByText('Post image'))
    })

    expect(onShareEvent).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(/couldn't load the image/i)).toBeTruthy()

    // the link row must still work offline after an image failure
    await act(async () => {
      await fireEvent.press(screen.getByText('Share link'))
    })
    expect(shareSpy).toHaveBeenCalled()
    expect(onShareEvent).toHaveBeenCalledWith(EVENTS.SHARE_COMPLETED, 'link')
  })

  it('dismisses when the dimmed backdrop is tapped', async () => {
    const onClose = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={() => {}} onClose={onClose} />)

    await fireEvent.press(screen.getByLabelText('dismiss'))

    expect(onClose).toHaveBeenCalled()
  })

  it('does not dismiss when the sheet content itself is tapped', async () => {
    const onClose = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={() => {}} onClose={onClose} />)

    // The title sits on the sheet's own whitespace, not on a row or the close
    // button — it must not fall through to the backdrop's dismiss handler.
    await fireEvent.press(screen.getByText('Share'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes while the Android chooser is up', async () => {
    setPlatform('android')
    shareSpy.mockReturnValue(new Promise(() => {}))
    const onClose = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={() => {}} onClose={onClose} />)

    await fireEvent.press(screen.getByText('Share link'))
    await fireEvent.press(screen.getByLabelText('dismiss'))
    expect(onClose).toHaveBeenCalled()
  })

  it('dismisses via the explicit close button', async () => {
    const onClose = jest.fn()
    await render(<ShareModal visible {...PROPS} onShareEvent={() => {}} onClose={onClose} />)

    await fireEvent.press(screen.getByLabelText('close'))

    expect(onClose).toHaveBeenCalled()
  })
})
