import {resendSchema} from '@whocards/env/resend'
import {z} from 'zod'

const testEmailEnvSchema = z.object({
  ...resendSchema,
  ANDROID_TESTER_SIGNUP_URL: z.url(),
  EMAIL_TEST_RECIPIENT: z.email(),
  EMAIL_TEST_SEND_CONFIRMED: z.literal('true'),
})

export type TestEmailEnv = z.infer<typeof testEmailEnvSchema>

export function readTestEmailEnv(env: NodeJS.ProcessEnv = process.env): TestEmailEnv {
  return testEmailEnvSchema.parse(env)
}
