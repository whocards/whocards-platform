import {mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {render, toPlainText} from '@react-email/render'
import {createElement} from 'react'

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

const signupUrl = process.env.ANDROID_TESTER_SIGNUP_URL ?? 'https://whocards.cc/android-testers'
// TODO: replace with real store URLs before the launch blast is sent.
const appStoreUrl =
  process.env.APP_STORE_URL ??
  'https://apps.apple.com/app/whocards/idTODO?utm_source=email&utm_medium=launch_blast&utm_campaign=launch'
const playStoreUrl =
  process.env.PLAY_STORE_URL ??
  'https://play.google.com/store/apps/details?id=cc.whocards.appTODO&utm_source=email&utm_medium=launch_blast&utm_campaign=launch'

const outputDirectory = resolve('dist')
await mkdir(outputDirectory, {recursive: true})

// --- Android tester recruitment ---
const androidHtml = await render(createElement(AndroidTesterRecruitmentEmail, {signupUrl}))
const androidText = androidTesterRecruitmentText({signupUrl})

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
