import {createElement} from 'react'
import type {ReactTestRenderer} from 'react-test-renderer'
import {act, create} from 'react-test-renderer'
import {vi} from 'vitest'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

export type RenderedHook<P, R> = {
  readonly current: R
  rerender: (props: P) => Promise<void>
  unmount: () => Promise<void>
}

export const renderHook = async <P, R>(
  hook: (props: P) => R,
  props: P
): Promise<RenderedHook<P, R>> => {
  let latest: {value: R} | null = null
  const Probe = ({p}: {p: P}) => {
    latest = {value: hook(p)}
    return null
  }
  let root: ReactTestRenderer | null = null
  await act(async () => {
    root = create(createElement(Probe, {p: props}))
  })
  return {
    get current() {
      if (!latest) throw new Error('hook never rendered')
      return latest.value
    },
    rerender: (p) =>
      act(async () => {
        root?.update(createElement(Probe, {p}))
      }),
    unmount: () =>
      act(async () => {
        root?.unmount()
      }),
  }
}

/** Inside act: runs `step` (or advances fake time by it), then settles what is pending. */
export const flush = (step: number | (() => unknown) = 0) =>
  act(async () => {
    if (typeof step === 'function') await step()
    await vi.advanceTimersByTimeAsync(typeof step === 'number' ? step : 0)
  })
