import {afterEach, describe, expect, it, vi} from 'vitest'

import {createWebRecorder} from './recorder'

const fakeMic = () => {
  const track = {stop: vi.fn<() => void>()}
  const stream = {getTracks: () => [track]}
  class FakeRecorder {
    static isTypeSupported = () => true
    mimeType = 'audio/webm'
    state = 'inactive'
    addEventListener() {}
    start() {
      this.state = 'recording'
    }
    // Never fires 'stop': the hang this guards against.
    stop() {}
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('navigator', {mediaDevices: {getUserMedia: async () => stream}})
  return track
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createWebRecorder', () => {
  it('frees the mic on stop even when the stop event never fires', async () => {
    const track = fakeMic()
    const recorder = createWebRecorder()
    await recorder.start()
    void recorder.stop()
    expect(track.stop).toHaveBeenCalled()
  })
})
