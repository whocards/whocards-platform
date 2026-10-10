import {useCallback, useEffect, useRef, useState} from 'react'

import {clockOffset} from '../rules/timer'
import type {JoinInput, PlayerState} from '../schemas'
import type {GameClient, GamePlatform} from './client'
import type {GameError} from './errors'
import {gameErrorOf} from './errors'
import {after} from './timers'

export const DEFAULT_POLL_MS = 4000

export type GameSession = {
  state: PlayerState | null
  /** Add to the device clock to get server time. */
  offsetMs: number
  /** True until the first state arrives or fails. */
  loading: boolean
  /** Last failed refresh; cleared by the next good one. */
  error: GameError | null
  join: (input: JoinInput) => Promise<GameError | null>
  refresh: () => Promise<void>
  /** Runs a mutation and takes its returned state; refusals trigger a resync. */
  act: (call: (client: GameClient) => Promise<PlayerState>) => Promise<GameError | null>
}

export type HostedGameOptions = {
  client: GameClient
  platform: GamePlatform
  /** A token is stored for this game. */
  joined: boolean
  onUnauthorized?: () => void
  pollMs?: number
  now?: () => number
}

/** Polls until the game ends, mid-turn too, so a round or game the host ends reaches the phone. */
export const shouldPoll = (state: PlayerState | null): boolean =>
  state === null || state.game.status !== 'ended'

export const useHostedGame = ({
  client,
  platform,
  joined,
  onUnauthorized,
  pollMs = DEFAULT_POLL_MS,
  now = Date.now,
}: HostedGameOptions): GameSession => {
  const [state, setState] = useState<PlayerState | null>(null)
  const [offsetMs, setOffsetMs] = useState(0)
  const [loading, setLoading] = useState(joined)
  const [error, setError] = useState<GameError | null>(null)
  const [inFlight, setInFlight] = useState(0)
  const [foreground, setForeground] = useState(() => platform.isForeground())

  // Replies can land out of order; only the newest request may write state.
  const sent = useRef(0)
  const applied = useRef(0)
  const bestRoundTrip = useRef(Number.POSITIVE_INFINITY)
  const unauthorized = useRef(onUnauthorized)
  useEffect(() => {
    unauthorized.current = onUnauthorized
  }, [onUnauthorized])

  const request = useCallback(
    async (call: () => Promise<PlayerState>): Promise<GameError | null> => {
      const seq = ++sent.current
      const sentAt = now()
      try {
        const next = await call()
        const receivedAt = now()
        if (seq <= applied.current) return null
        applied.current = seq
        if (receivedAt - sentAt <= bestRoundTrip.current) {
          bestRoundTrip.current = receivedAt - sentAt
          setOffsetMs(clockOffset({serverNow: next.serverNow, sentAt, receivedAt}))
        }
        setState(next)
        setError(null)
        return null
      } catch (caught) {
        const failure = gameErrorOf(caught)
        if (failure.unauthorized) {
          applied.current = seq
          setState(null)
          unauthorized.current?.()
        }
        return failure
      } finally {
        setLoading(false)
      }
    },
    [now]
  )

  const refresh = useCallback(async () => {
    const failure = await request(() => client.state())
    if (failure) setError(failure)
  }, [client, request])

  const mutate = useCallback(
    async (call: () => Promise<PlayerState>) => {
      setInFlight((n) => n + 1)
      const failure = await request(call)
      setInFlight((n) => n - 1)
      return failure
    },
    [request]
  )

  const act = useCallback(
    async (call: (c: GameClient) => Promise<PlayerState>) => {
      const failure = await mutate(() => call(client))
      if (failure?.refusal) void refresh()
      return failure
    },
    [client, mutate, refresh]
  )

  const join = useCallback((input: JoinInput) => mutate(() => client.join(input)), [client, mutate])

  useEffect(
    () =>
      platform.onForegroundChange((isForeground) => {
        setForeground(isForeground)
        if (isForeground && joined) void refresh()
      }),
    [platform, joined, refresh]
  )

  const polling = joined && foreground && inFlight === 0 && shouldPoll(state)
  // The first load rides the poll loop with no delay.
  const firstDelay = state === null ? 0 : pollMs

  useEffect(() => {
    if (!polling) return undefined
    let alive = true
    let cancel = after(firstDelay, function tick() {
      void refresh().finally(() => {
        if (alive) cancel = after(pollMs, tick)
      })
    })
    return () => {
      alive = false
      cancel()
    }
  }, [polling, firstDelay, pollMs, refresh])

  return {state, offsetMs, loading, error, join, refresh, act}
}
