import * as Application from 'expo-application'
import * as StoreReview from 'expo-store-review'
import {useCallback, useRef} from 'react'
import {Platform} from 'react-native'
import {EVENTS, track} from '@whocards/observability/events'

import {getReviewState, isReviewEligible, markReviewAttempted} from '@/lib/app-review'

/**
 * In-app review: check eligibility and fire the native OS prompt. Called after
 * play (on exit or background), never mid-card or on launch. Fails silently;
 * emits app_review_eligible and app_review_requested via track(). An in-flight
 * ref dedupes concurrent calls (AppState background + exit can both fire) so
 * two callers can't pass the eligibility check before the first persists.
 */
export const useReviewPrompt = () => {
  const inFlightRef = useRef(false)

  return useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const appVersion = Application.nativeApplicationVersion ?? '0'
      const state = await getReviewState()
      if (!isReviewEligible(state, appVersion)) return

      track({
        name: EVENTS.APP_REVIEW_ELIGIBLE,
        props: {
          app_version: appVersion,
          card_count: state.cardCount,
          session_count: state.sessionCount,
        },
      })

      const available = await StoreReview.isAvailableAsync()
      if (!available) return
      const hasAction = await StoreReview.hasAction()
      if (!hasAction) return

      // Persist before calling so a background/crash after this point doesn't
      // allow a second attempt on the same version.
      await markReviewAttempted(appVersion)

      track({
        name: EVENTS.APP_REVIEW_REQUESTED,
        props: {app_version: appVersion, platform: Platform.OS},
      })

      await StoreReview.requestReview()
    } catch {
      // Fail silently — store review is best-effort.
    } finally {
      inFlightRef.current = false
    }
  }, [])
}
