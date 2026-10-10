import type {WakeLock} from '@whocards/game'

type Sentinel = {release: () => Promise<void>}

export type WakeLockHost = {
  request: (() => Promise<Sentinel>) | null
  isVisible: () => boolean
  onVisibilityChange: (callback: () => void) => () => void
}

export const browserWakeLockHost = (): WakeLockHost => ({
  request: 'wakeLock' in navigator ? () => navigator.wakeLock.request('screen') : null,
  isVisible: () => document.visibilityState === 'visible',
  onVisibilityChange: (callback) => {
    document.addEventListener('visibilitychange', callback)
    return () => document.removeEventListener('visibilitychange', callback)
  },
})

/** Screen wake lock that comes back after the tab returns, until released. */
export const createWakeLock = (host: WakeLockHost = browserWakeLockHost()): WakeLock => {
  let sentinel: Sentinel | null = null
  let unsubscribe: (() => void) | null = null

  const request = async (): Promise<boolean> => {
    if (!host.request) return false
    try {
      sentinel = await host.request()
      return true
    } catch {
      return false
    }
  }

  return {
    async acquire() {
      // The browser drops the lock whenever the tab is hidden.
      unsubscribe ??= host.onVisibilityChange(() => {
        if (host.isVisible()) void request()
      })
      return request()
    },
    async release() {
      unsubscribe?.()
      unsubscribe = null
      const held = sentinel
      sentinel = null
      await held?.release().catch(() => undefined)
    },
  }
}
