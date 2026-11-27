import {Easing} from 'react-native-reanimated'

/**
 * Shared motion tokens for the mobile app (docs/DESIGN.md: keep interaction
 * transitions crisp and continuous, respecting Reduce Motion).
 *
 * Flip `DEV_SPEED` (e.g. `0.25`) to inspect every transition in slow motion on a
 * simulator or device; production always runs at 1×.
 */
const DEV_SPEED = 1

export const motionDuration = (ms: number, reduceMotion = false): number => {
  if (reduceMotion) return 0
  return __DEV__ ? Math.round(ms / DEV_SPEED) : ms
}

export const MOTION_DURATION = {
  /** Switching between Classic and Pick a Card: zero-fade GPU container & single-text morph. */
  gameMorph: 380,
  /** Continuous 0°→180° flip for Classic and Pick a Card reveal. */
  flip: 450,
  /** Full-travel slide off / slide back in both Classic and Pick a Card. */
  slide: 300,
  /** Adding/removing a second language or toggling Tabletop mode. */
  layoutSplit: 360,
  /** Reduce Motion instant/fade fallback. */
  fade: 200,
  /** Home → Play parting WHO|CARDS transition. */
  homeToPlay: 480,
} as const

export const MOTION_EASING = {
  /** Cushioned start and landing for transitions between two full resting states. */
  standard: Easing.inOut(Easing.cubic),
  /** Crisp settle for elements entering into place. */
  enter: Easing.out(Easing.cubic),
  /** Fast departure for elements leaving the screen. */
  exit: Easing.in(Easing.cubic),
} as const
