import {mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {render, toPlainText} from '@react-email/render'
import {createElement} from 'react'

import {
  AndroidTesterRecruitmentEmail,
  androidTesterRecruitmentText,
} from '../src/templates/android-tester-recruitment'

const signupUrl = process.env.ANDROID_TESTER_SIGNUP_URL ?? 'https://whocards.cc/android-testers'
const outputDirectory = resolve('dist')
const html = await render(createElement(AndroidTesterRecruitmentEmail, {signupUrl}))
const text = androidTesterRecruitmentText({signupUrl})

await mkdir(outputDirectory, {recursive: true})
await Promise.all([
  writeFile(resolve(outputDirectory, 'android-tester-recruitment.html'), html),
  writeFile(resolve(outputDirectory, 'android-tester-recruitment.txt'), text),
  writeFile(
    resolve(outputDirectory, 'android-tester-recruitment.generated.txt'),
    toPlainText(html)
  ),
])

console.log(`Rendered Android tester recruitment email to ${outputDirectory}`)
