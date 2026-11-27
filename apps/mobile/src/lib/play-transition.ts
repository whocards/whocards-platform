import type {GameId} from '@whocards/decks'

export type LogoRect = {x: number; y: number; width: number; height: number}

export type PlayQAnchor = {
  /** Distance from right edge of window to the "?" right edge (matches UnifiedPlayer). */
  right: number
  /** Distance from bottom edge of window to the "?" bottom edge (matches UnifiedPlayer). */
  bottom: number
  /** Resting opacity on Play (0.28 in Classic, 1 on open Card). */
  opacity: number
  /** Resting scale on Play (1.08 in Classic, 1 on open Card). */
  scale: number
}

export type PlayTransitionEvent = {
  id: number
  direction: 'enter' | 'exit'
  /**
   * 'qmark': Classic or open Card — "?" flies between Home logo's "?" and the corner "?",
   *          while Home's clipped gradient WHO and CARDS part apart (enter) or close back (exit).
   * 'deck':  Face-down Pick a Card Deck — full WHO?CARDS logo flies and color-morphs between
   *          Home's center logo and CardBack's bottom-right wordmark.
   */
  kind: 'qmark' | 'deck'
  logoRect: LogoRect
  /** Optional exact anchor measured by UnifiedPlayer (used on Exit for 0px handoff). */
  playQAnchor?: PlayQAnchor
  /** Optional measured bottom bar height from UnifiedPlayer so Deck coords match to the pixel. */
  bottomBarH?: number
}

export type HomeReturnEvent = {
  kind: 'qmark' | 'deck'
  duration: number
}

type Listener = (event: PlayTransitionEvent | null) => void
type ReturnHomeListener = (animated?: HomeReturnEvent) => void

let seq = 0
let active: PlayTransitionEvent | null = null
let pendingPlayEntrance = false
let pendingTargetGame: GameId | null = null
let rememberedHomeLogoRect: LogoRect | null = null
let rememberedBottomBarH: number | null = null
const listeners = new Set<Listener>()
const returnHomeListeners = new Set<ReturnHomeListener>()

const emit = (next: PlayTransitionEvent | null) => {
  active = next
  for (const listener of listeners) listener(next)
}

/** Remember the measured bottom bar height from UnifiedPlayer for pixel-exact handoffs. */
export const setMeasuredPlayerBarHeight = (height: number) => {
  if (height > 0) rememberedBottomBarH = height
}

export const getMeasuredPlayerBarHeight = (): number | null => rememberedBottomBarH

/**
 * Starts the 5B Home → Play transition overlay (flying "?" into Classic or full
 * "WHO?CARDS" logo onto Pick a Card's CardBack with color morph).
 */
export const startPlayTransition = (targetGame: GameId, logoRect: LogoRect) => {
  pendingPlayEntrance = true
  pendingTargetGame = targetGame
  rememberedHomeLogoRect = logoRect
  emit({
    id: ++seq,
    direction: 'enter',
    kind: targetGame === 'pick' ? 'deck' : 'qmark',
    logoRect,
    bottomBarH: rememberedBottomBarH ?? undefined,
  })
}

/**
 * Starts the symmetric Play → Home Exit transition: "?" (from Classic or open Card)
 * or full "WHO?CARDS" (from face-down Deck) glides cleanly back into Home's logo
 * while Home closes back together around it.
 */
export const startExitTransition = ({
  kind,
  fallbackLogoRect,
  playQAnchor,
  bottomBarH,
}: {
  kind: 'qmark' | 'deck'
  fallbackLogoRect: LogoRect
  playQAnchor?: PlayQAnchor
  bottomBarH?: number
}) => {
  pendingPlayEntrance = false
  pendingTargetGame = null
  const logoRect = rememberedHomeLogoRect ?? fallbackLogoRect
  emit({
    id: ++seq,
    direction: 'exit',
    kind,
    logoRect,
    playQAnchor,
    bottomBarH: bottomBarH ?? rememberedBottomBarH ?? undefined,
  })
}

export const clearPlayTransition = (id?: number) => {
  if (id !== undefined && active?.id !== id) return
  emit(null)
}

export const subscribePlayTransition = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Returns the target Game if Play was just launched from Home (avoids a 1-frame empty flash). */
export const peekPendingTargetGame = (): GameId | null => pendingTargetGame

/** Returns true once when Play mounts directly from Home's 5B parting transition. */
export const consumePendingPlayEntrance = (): boolean => {
  if (!pendingPlayEntrance) return false
  pendingPlayEntrance = false
  pendingTargetGame = null
  return true
}

/**
 * Notifies Home that Play has exited.
 * - Pass `animated` during the graceful Exit button transition so Home closes back cleanly.
 * - Omit `animated` on instant/gesture/Reduce-Motion unmount to reset Home immediately.
 */
export const notifyReturnedHome = (animated?: HomeReturnEvent) => {
  pendingPlayEntrance = false
  pendingTargetGame = null
  if (!animated) emit(null)
  for (const listener of returnHomeListeners) listener(animated)
}

export const subscribeReturnedHome = (listener: ReturnHomeListener) => {
  returnHomeListeners.add(listener)
  return () => {
    returnHomeListeners.delete(listener)
  }
}
