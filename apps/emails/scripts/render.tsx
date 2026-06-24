import {mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {render, toPlainText} from '@react-email/render'
import {createElement} from 'react'

import {
  AndroidTesterRecruitmentEmail,
  androidTesterRecruitmentText,
} from '../src/templates/android-tester-recruitment'
import {
  AndroidTesterCheckInEmail,
  AndroidTesterCompletionEmail,
  AndroidTesterOnboardingEmail,
  androidTesterCheckInText,
  androidTesterCompletionText,
  androidTesterOnboardingText,
} from '../src/templates/android-tester-lifecycle'

const signupUrl = process.env.ANDROID_TESTER_SIGNUP_URL ?? 'https://whocards.cc/android-testers'
const groupUrl =
  process.env.ANDROID_TESTER_GROUP_URL ?? 'https://groups.google.com/g/whocards-testers'
const optInUrl =
  process.env.ANDROID_TESTER_OPT_IN_URL ??
  'https://play.google.com/apps/testing/com.whocards.mobile'
const feedbackUrl = process.env.ANDROID_TESTER_FEEDBACK_URL ?? 'https://whocards.cc/contact'
const outputDirectory = resolve('dist')
const recruitmentHtml = await render(createElement(AndroidTesterRecruitmentEmail, {signupUrl}))
const onboardingHtml = await render(
  createElement(AndroidTesterOnboardingEmail, {groupUrl, optInUrl, feedbackUrl})
)
const checkInHtml = await render(createElement(AndroidTesterCheckInEmail, {feedbackUrl}))
const completionHtml = await render(createElement(AndroidTesterCompletionEmail))

await mkdir(outputDirectory, {recursive: true})
await Promise.all([
  writeFile(resolve(outputDirectory, 'android-tester-recruitment.html'), recruitmentHtml),
  writeFile(
    resolve(outputDirectory, 'android-tester-recruitment.txt'),
    androidTesterRecruitmentText({signupUrl})
  ),
  writeFile(
    resolve(outputDirectory, 'android-tester-recruitment.generated.txt'),
    toPlainText(recruitmentHtml)
  ),
  writeFile(resolve(outputDirectory, 'android-tester-onboarding.html'), onboardingHtml),
  writeFile(
    resolve(outputDirectory, 'android-tester-onboarding.txt'),
    androidTesterOnboardingText({groupUrl, optInUrl, feedbackUrl})
  ),
  writeFile(resolve(outputDirectory, 'android-tester-day-7.html'), checkInHtml),
  writeFile(
    resolve(outputDirectory, 'android-tester-day-7.txt'),
    androidTesterCheckInText({feedbackUrl})
  ),
  writeFile(resolve(outputDirectory, 'android-tester-completion.html'), completionHtml),
  writeFile(
    resolve(outputDirectory, 'android-tester-completion.txt'),
    androidTesterCompletionText()
  ),
])

console.log(`Rendered Android tester lifecycle emails to ${outputDirectory}`)
