import {useCallback, useEffect, useState} from 'react'
import {Alert} from 'react-native'

import {getStoredInternal, setStoredInternal} from '@/lib/internal-store'
import {setInternalMarker} from '@/lib/observability'

/**
 * The hidden dev marker (issue #178): a long-press on the Library wordmark
 * (app/index.tsx) flips a persisted `is_internal` flag for this device,
 * registered as a PostHog super property so every future event — this
 * session and later ones — carries it. This is the manual counterpart to the
 * automatic simulator/emulator flag in observability.ts, for the 2 physical
 * dev phones that can't be auto-detected the same way.
 *
 * Deliberately not surfaced anywhere in Settings — a long-press with no
 * visible affordance is the whole point, so it can't be flipped by accident.
 * `Alert.alert` on toggle is the "clear visual confirmation" so the owner
 * always knows which state a phone is in.
 */
export const useInternalMarker = () => {
  const [internal, setInternal] = useState(false)

  useEffect(() => {
    void getStoredInternal().then((stored) => {
      setInternal(stored)
      if (stored) setInternalMarker(true)
    })
  }, [])

  const toggle = useCallback(() => {
    const next = !internal
    setInternal(next)
    void setStoredInternal(next)
    setInternalMarker(next)
    Alert.alert(
      next ? 'Internal marker: ON' : 'Internal marker: OFF',
      next
        ? "This device's future events are flagged is_internal in PostHog."
        : 'This device is flagging events as a normal player again.'
    )
  }, [internal])

  return {internal, toggle}
}
