import {describe, expect, it, vi} from 'vitest'

import {formatClock} from './format'
import {qrPath} from './qr'
import {pickMimeType} from './recorder'
import {frameSize} from './scanner'
import {createTokenStore} from './token-store'
import {createWebTranscriber} from './transcriber'
import type {WakeLockHost} from './wake-lock'
import {createWakeLock} from './wake-lock'

describe('pickMimeType', () => {
  it('prefers opus in webm', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus')
  })

  it('falls back to mp4 on Safari', () => {
    expect(pickMimeType((type) => type.startsWith('audio/mp4'))).toBe('audio/mp4;codecs=mp4a.40.2')
  })

  it('lets the browser choose when nothing matches', () => {
    expect(pickMimeType(() => false)).toBe('')
  })
})

describe('frameSize', () => {
  it('shrinks large frames and keeps the aspect ratio', () => {
    expect(frameSize(1920, 1080)).toEqual({width: 640, height: 360})
    expect(frameSize(480, 640)).toEqual({width: 480, height: 640})
  })
})

const fakeHost = (request: WakeLockHost['request']) => {
  let onChange: (() => void) | null = null
  let visible = true
  const host: WakeLockHost = {
    request,
    isVisible: () => visible,
    onVisibilityChange: (callback) => {
      onChange = callback
      return () => {
        onChange = null
      }
    },
  }
  const show = (next: boolean) => {
    visible = next
    onChange?.()
  }
  return {host, show, listening: () => onChange !== null}
}

describe('createWakeLock', () => {
  it('re-acquires when the tab comes back, until released', async () => {
    const release = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const request = vi
      .fn<() => Promise<{release: () => Promise<void>}>>()
      .mockResolvedValue({release})
    const {host, show, listening} = fakeHost(request)
    const lock = createWakeLock(host)

    expect(await lock.acquire()).toBe(true)
    show(false)
    show(true)
    expect(request).toHaveBeenCalledTimes(2)

    await lock.release()
    expect(release).toHaveBeenCalledOnce()
    expect(listening()).toBe(false)
  })

  it('reports a refused or missing wake lock', async () => {
    const refused = createWakeLock(fakeHost(() => Promise.reject(new Error('NotAllowed'))).host)
    expect(await refused.acquire()).toBe(false)
    expect(await createWakeLock(fakeHost(null).host).acquire()).toBe(false)
  })
})

describe('createWebTranscriber', () => {
  const recording = {
    audio: new Blob(['x'], {type: 'audio/webm'}),
    mimeType: 'audio/webm',
    durationMs: 1,
  }

  it('posts the audio with the token and parses the transcript', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({text: 'hi', language: 'en', model: 'fake'}))
    const transcriber = createWebTranscriber(() => 'tok', fetcher)

    expect(await transcriber.transcribe(recording, 'en')).toEqual({
      text: 'hi',
      language: 'en',
      model: 'fake',
    })
    const body = fetcher.mock.calls[0]?.[1]?.body
    expect(body).toBeInstanceOf(FormData)
    expect(body instanceof FormData && body.get('token')).toBe('tok')
  })

  it('surfaces the server message on failure', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({error: 'No live round'}, {status: 409}))
    await expect(
      createWebTranscriber(() => 'tok', fetcher).transcribe(recording, 'en')
    ).rejects.toThrow('No live round')
  })
})

const memoryStorage = (): Storage => {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

describe('createTokenStore', () => {
  it('keys tokens by game code and remembers the last game', () => {
    const store = createTokenStore(memoryStorage())
    store.set('abcd', 'tok')
    expect(store.get('ABCD')).toBe('tok')
    expect(store.get('WXYZ')).toBeNull()
    expect(store.lastCode()).toBe('ABCD')
    store.clear('ABCD')
    expect(store.get('ABCD')).toBeNull()
  })

  it('degrades to no storage when it throws', () => {
    const broken = memoryStorage()
    broken.getItem = () => {
      throw new Error('SecurityError')
    }
    expect(createTokenStore(broken).get('ABCD')).toBeNull()
  })
})

describe('records choice', () => {
  it('defaults to not recording and remembers the choice per game', () => {
    const store = createTokenStore(memoryStorage())
    expect(store.records('ABCD')).toBe(false)
    store.setRecords('abcd', true)
    expect(store.records('ABCD')).toBe(true)
    expect(store.records('WXYZ')).toBe(false)
  })
})

describe('formatClock', () => {
  it('rounds up to whole seconds', () => {
    expect(formatClock(90_000)).toBe('1:30')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('qrPath', () => {
  it('draws a square code with a quiet border', () => {
    const {size, d} = qrPath('ABC234')
    expect(size).toBeGreaterThanOrEqual(25)
    expect(d).toMatch(/^M\d+ \d+h1v1h-1z/)
    expect(d).not.toContain('M0 0')
  })
})
