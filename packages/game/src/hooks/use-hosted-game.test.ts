import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {PlayerState} from '../schemas'
import type {GameClient, GamePlatform} from './client'
import {flush, renderHook} from './render-hook.test-utils'
import {deferred, playerState, speakingState, trpcError} from './state.test-utils'
import type {HostedGameOptions} from './use-hosted-game'
import {useHostedGame} from './use-hosted-game'

const makeClient = () => ({
  join: vi.fn<GameClient['join']>(),
  state: vi.fn<GameClient['state']>(),
  pair: vi.fn<GameClient['pair']>(),
  turn: vi.fn<GameClient['turn']>(),
  response: vi.fn<GameClient['response']>(),
  feedback: vi.fn<GameClient['feedback']>(),
})

const makePlatform = () => {
  let listener: ((foreground: boolean) => void) | null = null
  let foreground = true
  const platform: GamePlatform = {
    isForeground: () => foreground,
    onForegroundChange: (callback) => {
      listener = callback
      return () => {
        listener = null
      }
    },
  }
  const setForeground = (next: boolean) => {
    foreground = next
    listener?.(next)
  }
  return {platform, setForeground}
}

const setup = async (extra: Partial<HostedGameOptions> = {}) => {
  const client = makeClient()
  client.state.mockResolvedValue(playerState())
  const {platform, setForeground} = makePlatform()
  const options: HostedGameOptions = {client, platform, joined: true, pollMs: 4000, ...extra}
  const hook = await renderHook(useHostedGame, options)
  return {client, setForeground, hook}
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
})
afterEach(() => vi.useRealTimers())

describe('useHostedGame', () => {
  it('loads on mount and takes the server clock offset', async () => {
    const {client, hook} = await setup()
    client.state.mockResolvedValue(playerState({serverNow: 5000}))
    expect(hook.current.loading).toBe(true)
    await flush()
    expect(client.state).toHaveBeenCalledTimes(1)
    expect(hook.current.loading).toBe(false)
    expect(hook.current.offsetMs).toBe(4000)
    await hook.unmount()
  })

  it('stays idle until a token exists', async () => {
    const {client, hook} = await setup({joined: false})
    await flush(20_000)
    expect(client.state).not.toHaveBeenCalled()
    expect(hook.current.loading).toBe(false)
    await hook.unmount()
  })

  it('keeps polling while the player speaks and stops once the game ends', async () => {
    const {client, hook} = await setup()
    await flush()
    client.state.mockResolvedValue(speakingState())
    await flush(4000)
    expect(hook.current.state?.phase).toBe('speaking')
    await flush(4000)
    expect(client.state).toHaveBeenCalledTimes(3)

    client.state.mockResolvedValue(playerState({game: {...playerState().game, status: 'ended'}}))
    await flush(4000)
    await flush(20_000)
    expect(client.state).toHaveBeenCalledTimes(4)
    await hook.unmount()
  })

  it('stops in the background and refreshes on return', async () => {
    const {client, hook, setForeground} = await setup()
    await flush()
    await flush(() => setForeground(false))
    await flush(20_000)
    expect(client.state).toHaveBeenCalledTimes(1)
    await flush(() => setForeground(true))
    expect(client.state).toHaveBeenCalledTimes(2)
    await hook.unmount()
  })

  it('takes state from a mutation and drops an older poll reply', async () => {
    const {client, hook} = await setup()
    await flush()
    const slow = deferred<PlayerState>()
    client.state.mockReturnValue(slow.promise)
    await flush(4000)

    client.pair.mockResolvedValue(playerState({phase: 'ready'}))
    let failure: unknown = 'pending'
    await flush(async () => {
      failure = await hook.current.act((c) => c.pair({partnerCode: 'XYZ9'}))
    })
    expect(failure).toBeNull()
    expect(hook.current.state?.phase).toBe('ready')

    await flush(() => slow.resolve(playerState({phase: 'unpaired'})))
    expect(hook.current.state?.phase).toBe('ready')
    await hook.unmount()
  })

  it('returns the refusal and resyncs', async () => {
    const {client, hook} = await setup()
    await flush()
    client.pair.mockRejectedValue(trpcError({code: 'CONFLICT', refusal: 'met_before'}))
    let refusal: unknown = null
    await flush(async () => {
      refusal = (await hook.current.act((c) => c.pair({partnerCode: 'XYZ9'})))?.refusal
    })
    expect(refusal).toBe('met_before')
    expect(client.state).toHaveBeenCalledTimes(2)
    await hook.unmount()
  })

  it('drops state and reports a stale token', async () => {
    const onUnauthorized = vi.fn<() => void>()
    const {client, hook} = await setup({onUnauthorized})
    client.state.mockRejectedValue(trpcError({code: 'UNAUTHORIZED', refusal: null}))
    await flush()
    expect(hook.current.state).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledOnce()
    await hook.unmount()
  })
})
