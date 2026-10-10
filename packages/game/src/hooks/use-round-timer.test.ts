import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {flush, renderHook} from './render-hook.test-utils'
import {roundView, turnView} from './state.test-utils'
import type {RoundTimerOptions} from './use-round-timer'
import {timerView, useRoundTimer} from './use-round-timer'

describe('timerView', () => {
  it('times an open turn from the round settings', () => {
    const view = timerView(roundView(), turnView({startedAt: 1000}), 31_000)
    expect(view.turn).toEqual({phase: 'talking', remainingMs: 30_000, untilDeadlineMs: 60_000})
  })

  it('has no turn clock once the turn is finished or there is no round', () => {
    expect(timerView(roundView(), turnView({finishedAt: 5}), 10).turn).toBeNull()
    expect(timerView(null, turnView(), 10).turn).toBeNull()
  })

  it('counts the round down only while it is live', () => {
    expect(timerView(roundView({endsAt: 60_000}), null, 15_000).roundRemainingMs).toBe(45_000)
    expect(timerView(roundView({status: 'done', endsAt: 60_000}), null, 0).roundRemainingMs).toBe(
      null
    )
  })
})

describe('useRoundTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => vi.useRealTimers())

  it('ticks on server time while the round is live', async () => {
    const options: RoundTimerOptions = {
      round: roundView(),
      turn: turnView({startedAt: 0}),
      offsetMs: 2000,
      tickMs: 500,
    }
    const hook = await renderHook(useRoundTimer, options)
    expect(hook.current.now).toBe(2000)
    expect(hook.current.turn?.remainingMs).toBe(58_000)

    await flush(1000)
    expect(hook.current.now).toBe(3000)
    expect(hook.current.turn?.remainingMs).toBe(57_000)
    await hook.unmount()
  })

  it('does not tick between rounds', async () => {
    const hook = await renderHook(useRoundTimer, {
      round: roundView({status: 'done'}),
      turn: null,
      offsetMs: 0,
    })
    expect(vi.getTimerCount()).toBe(0)
    await hook.unmount()
  })
})
