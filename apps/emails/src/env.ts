import {z} from 'zod'

const emailEnvSchema = z.object({
  ANDROID_TESTER_SIGNUP_URL: z.url(),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
})

const testEmailEnvSchema = emailEnvSchema.extend({
  EMAIL_TEST_RECIPIENT: z.email(),
  EMAIL_TEST_SEND_CONFIRMED: z.literal('true'),
})

export type EmailEnv = z.infer<typeof emailEnvSchema>
export type TestEmailEnv = z.infer<typeof testEmailEnvSchema>

export function readEmailEnv(env: NodeJS.ProcessEnv = process.env): EmailEnv {
  return emailEnvSchema.parse(env)
}

export function readTestEmailEnv(env: NodeJS.ProcessEnv = process.env): TestEmailEnv {
  return testEmailEnvSchema.parse(env)
}
