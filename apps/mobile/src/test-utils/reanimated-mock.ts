/**
 * A settled, synchronous stand-in for react-native-reanimated.
 *
 * Two reasons the real package can't be used here:
 *   1. Its native Worklets module isn't available under plain jest-expo —
 *      importing it (even via `jest.requireActual` to spread the official jest
 *      mock's exports) throws "Native part of Worklets doesn't seem to be
 *      initialized". settings-modal.test.tsx and player-bar.test.tsx each carry
 *      their own local workaround for the same thing; this is the shared one.
 *   2. A UI snapshot has to be taken of a settled screen. Every animation here
 *      jumps straight to its end value and fires its completion callback
 *      synchronously, so a `render()` with its effects flushed is already at the
 *      final frame — no fake timers, no frame-by-frame flakiness.
 *
 * Use it as:
 *
 *   jest.mock('react-native-reanimated', () =>
 *     require('@/test-utils/reanimated-mock').reanimatedMock()
 *   )
 */
import {useEffect, useReducer, useState} from 'react'
import {Text, View} from 'react-native'

/**
 * Every mounted `useAnimatedStyle`, so a shared-value write can re-render it.
 *
 * Real reanimated applies an animated style on the UI thread without React
 * re-rendering at all, which is exactly what a JS-side snapshot cannot see: the
 * tree would keep whatever value the style had on first render, and a screen
 * whose entrance animates opacity 0 → 1 would snapshot as invisible. Since every
 * animation here is already settled, re-rendering on write puts the FINAL value
 * in the tree — the state a player actually looks at.
 */
const subscribers = new Set<() => void>()

type SharedValueMock<T> = {
  get: () => T
  set: (next: T) => void
  value: T
}

/** A shared value, supporting both the `.get()`/`.set()` and legacy `.value` forms. */
const sharedValue = <T>(initial: T): SharedValueMock<T> => {
  let current = initial
  const write = (next: T) => {
    if (Object.is(next, current)) return
    current = next
    for (const notify of subscribers) notify()
  }
  return {
    get: () => current,
    set: write,
    get value() {
      return current
    },
    set value(next: T) {
      write(next)
    },
  }
}

/**
 * One shared value per mounted component, not one per render. The real hook is
 * ref-backed; a fresh object each render would silently reset every animation to
 * its initial value on the very re-render a write triggers — and, with a write in
 * an effect, spin forever.
 */
const useSharedValue = <T>(initial: T): SharedValueMock<T> => {
  // `useState`'s lazy initialiser rather than a ref: same once-per-mount value,
  // without reading a ref during render.
  const [value] = useState(() => sharedValue(initial))
  return value
}

/** `useAnimatedStyle`, re-evaluated whenever any shared value is written. */
const useAnimatedStyle = (factory: () => Record<string, unknown>) => {
  const [, rerender] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    subscribers.add(rerender)
    return () => {
      subscribers.delete(rerender)
    }
  }, [])
  return factory()
}

/**
 * Jump straight to the end value and report completion, for every animation helper.
 *
 * Ordering note: real Reanimated commits the value and then runs the callback,
 * whereas here the callback runs first — the commit is the caller's own
 * `sharedValue.set(withTiming(...))`, which cannot happen until this returns.
 * That is only observable to a callback that reads the value it is being
 * written into, and no call site does: all five (settings-modal goToPage /
 * goBack, play/[deck]'s two swipe commits, pick-player putDown) only
 * `runOnJS` an unrelated state setter or dispatcher. Deferring the callback to
 * a microtask to fix the order would buy nothing and would make these tests
 * depend on when `act()` happens to flush, so the order stays as it is.
 */
const settle = <T>(toValue: T, _config?: unknown, callback?: (finished: boolean) => void): T => {
  callback?.(true)
  return toValue
}

/**
 * Clamped piecewise-linear interpolation. The real `interpolate` extrapolates
 * by default, but every call site in this app passes a value already inside its
 * input range, where clamping and extrapolating agree.
 */
const interpolate = (value: number, input: number[], output: number[]): number => {
  const last = input.length - 1
  if (value <= input[0]) return output[0]
  if (value >= input[last]) return output[last]
  for (let i = 1; i <= last; i++) {
    if (value > input[i]) continue
    const span = input[i] - input[i - 1]
    const ratio = span === 0 ? 0 : (value - input[i - 1]) / span
    return output[i - 1] + ratio * (output[i] - output[i - 1])
  }
  return output[last]
}

/**
 * The module shape to hand back from a `jest.mock` factory.
 *
 * `__esModule: true` matters: without it Babel's CJS interop resolves
 * `import Animated from 'react-native-reanimated'` to this whole object rather
 * than its `default`, and `Animated.View` silently becomes `undefined`.
 * `Animated.View` / `Animated.Text` are the plain RN hosts, so whatever style
 * the animated style resolves to lands on the element verbatim.
 *
 * `createAnimatedComponent`, `useEvent` and `isSharedValue` are here for
 * react-native-gesture-handler rather than for the app: gesture-handler wraps
 * its own `GestureDetector` host with `createAnimatedComponent` at import time,
 * and `GestureDetector` calls `useEvent` on every render to build the handler it
 * hands to the native side. Neither has any JS-visible rendering effect, so a
 * no-op handler is enough to let the real `PressableScale` and the Share
 * sheet's drag handle mount.
 */
export const reanimatedMock = () => ({
  __esModule: true,
  default: {
    View,
    Text,
    createAnimatedComponent: <T>(Component: T): T => Component,
  },
  useSharedValue,
  // The gesture event handler never fires in these tests — nothing here
  // simulates a native gesture — so it only has to exist.
  useEvent: () => () => {},
  isSharedValue: (value: unknown): boolean =>
    typeof value === 'object' && value !== null && 'value' in value,
  useAnimatedStyle,
  // No snapshot here is about the reduced-motion branch; `false` is the app's
  // default path, and it is the branch that actually runs the animations.
  useReducedMotion: () => false,
  withTiming: settle,
  withSpring: settle,
  // The delay is irrelevant once the animation it wraps is already at its end.
  withDelay: <T>(_delay: number, animation: T): T => animation,
  runOnJS:
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R =>
      fn(...args),
  interpolate,
})
