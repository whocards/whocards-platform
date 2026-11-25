import * as Application from 'expo-application'
import {Platform} from 'react-native'

import {getBaseUrl} from '@/lib/trpc'

/** The website's contact form, set to App feedback with this install's platform and version (issue #455). */
export const buildFeedbackUrl = (): string => {
  const params = new URLSearchParams({about: 'app-feedback', platform: Platform.OS})
  if (Application.nativeApplicationVersion) {
    params.set('version', Application.nativeApplicationVersion)
  }
  return `${getBaseUrl()}/contact?${params}`
}
