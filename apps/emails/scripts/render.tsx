import {mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {render, toPlainText} from '@react-email/render'
import {createElement} from 'react'

import {
  AndroidTesterCheckInEmail,
  AndroidTesterCompletionEmail,
  AndroidTesterOnboardingEmail,
  androidTesterCheckInText,
  androidTesterCompletionText,
  androidTesterOnboardingText,
} from '../src/templates/android-tester-lifecycle'
import {
  AndroidTesterRecruitmentEmail,
  androidTesterRecruitmentText,
} from '../src/templates/android-tester-recruitment'
import {
  AppLaunchAnnouncementEmail,
  appLaunchAnnouncementText,
} from '../src/templates/app-launch-announcement'
import {BetaValidatedEmail, betaValidatedText} from '../src/templates/buildup-beta-validated'
import {WaitlistLiveEmail, waitlistLiveText} from '../src/templates/buildup-waitlist-live'

// Non-production placeholders so a preview rendered without env never embeds a
// real (or real-looking, not-yet-live) tester link. Set the ANDROID_TESTER_*
// env vars to render against the verified URLs before sending.
const signupUrl = process.env.ANDROID_TESTER_SIGNUP_URL ?? 'https://example.com/android-testers'
const groupUrl =
  process.env.ANDROID_TESTER_GROUP_URL ?? 'https://groups.google.com/g/example-testers'
const optInUrl =
  process.env.ANDROID_TESTER_OPT_IN_URL ?? 'https://play.google.com/apps/testing/example.package'
const feedbackUrl = process.env.ANDROID_TESTER_FEEDBACK_URL ?? 'https://example.com/feedback'

// Store URLs have no fallback: this script produces the HTML that gets sent as
// the launch blast, so a missing env var must fail the render rather than
// silently shipping a stale/placeholder CTA (#128). Use `email:dev` (which
// renders PreviewProps) to iterate on copy without setting these.
const appStoreUrl = process.env.APP_STORE_URL
const playStoreUrl = process.env.PLAY_STORE_URL
if (!appStoreUrl || !playStoreUrl) {
  throw new Error(
    'APP_STORE_URL and PLAY_STORE_URL must both be set to render the launch-blast email. ' +
      'These intentionally have no built-in fallback — set them in the environment before ' +
      'running `pnpm email:render`. Use `pnpm email:dev` to preview the template instead.'
  )
}

const outputDirectory = resolve('dist')
await mkdir(outputDirectory, {recursive: true})

// --- Android tester recruitment ---
const androidHtml = await render(createElement(AndroidTesterRecruitmentEmail, {signupUrl}))
const androidText = androidTesterRecruitmentText({signupUrl})

// --- Android tester lifecycle (#115) ---
const onboardingHtml = await render(
  createElement(AndroidTesterOnboardingEmail, {groupUrl, optInUrl, feedbackUrl})
)
const checkInHtml = await render(createElement(AndroidTesterCheckInEmail, {feedbackUrl}))
const completionHtml = await render(createElement(AndroidTesterCompletionEmail))

// --- App launch announcement ---
const launchHtml = await render(
  createElement(AppLaunchAnnouncementEmail, {appStoreUrl, playStoreUrl})
)
const launchText = appLaunchAnnouncementText({
  appStoreUrl,
  playStoreUrl,
  greeting: 'Hi there,',
})

// --- Pre-launch buildup (#96) ---
const waitlistLiveHtml = await render(createElement(WaitlistLiveEmail, {greeting: 'Hi there,'}))
const waitlistLiveTxt = waitlistLiveText({
  appUrl: 'https://whocards.cc/app?utm_source=email&utm_medium=buildup&utm_campaign=launch',
  greeting: 'Hi there,',
})
const betaValidatedHtml = await render(createElement(BetaValidatedEmail, {greeting: 'Hi there,'}))
const betaValidatedTxt = betaValidatedText({
  playUrl: 'https://whocards.cc/play?utm_source=email&utm_medium=buildup&utm_campaign=launch',
  greeting: 'Hi there,',
})

await Promise.all([
  writeFile(resolve(outputDirectory, 'android-tester-recruitment.html'), androidHtml),
  writeFile(resolve(outputDirectory, 'android-tester-recruitment.txt'), androidText),
  writeFile(
    resolve(outputDirectory, 'android-tester-recruitment.generated.txt'),
    toPlainText(androidHtml)
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
  writeFile(resolve(outputDirectory, 'app-launch-announcement.html'), launchHtml),
  writeFile(resolve(outputDirectory, 'app-launch-announcement.txt'), launchText),
  writeFile(
    resolve(outputDirectory, 'app-launch-announcement.generated.txt'),
    toPlainText(launchHtml)
  ),
  writeFile(resolve(outputDirectory, 'buildup-waitlist-live.html'), waitlistLiveHtml),
  writeFile(resolve(outputDirectory, 'buildup-waitlist-live.txt'), waitlistLiveTxt),
  writeFile(resolve(outputDirectory, 'buildup-beta-validated.html'), betaValidatedHtml),
  writeFile(resolve(outputDirectory, 'buildup-beta-validated.txt'), betaValidatedTxt),
])

console.log(`Rendered emails to ${outputDirectory}`)
