import {createElement} from 'react'

import {readTestEmailEnv} from '../src/env'
import {sendEmail} from '../src/resend'
import {
  AndroidTesterRecruitmentEmail,
  androidTesterRecruitmentSubject,
  androidTesterRecruitmentText,
} from '../src/templates/android-tester-recruitment'

const env = readTestEmailEnv()
const result = await sendEmail({
  apiKey: env.RESEND_API_KEY,
  from: env.RESEND_FROM_EMAIL,
  html: createElement(AndroidTesterRecruitmentEmail, {signupUrl: env.ANDROID_TESTER_SIGNUP_URL}),
  subject: `[TEST] ${androidTesterRecruitmentSubject}`,
  text: androidTesterRecruitmentText({signupUrl: env.ANDROID_TESTER_SIGNUP_URL}),
  to: env.EMAIL_TEST_RECIPIENT,
})

if (result.error) throw new Error(`Resend rejected the test email: ${result.error.message}`)
console.log(
  `Sent test email ${result.data?.id ?? '(no id returned)'} to ${env.EMAIL_TEST_RECIPIENT}`
)
