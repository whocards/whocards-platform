import {z} from 'zod'
import countries from '~data/countries.json'

export const thankYouFormSchema = z.object({
  privacy: z
    .literal('on', {errorMap: () => ({message: 'Field is required'})})
    .pipe(z.preprocess((val) => !!val && val === 'on', z.boolean())),
  newsletter: z.preprocess((val) => !!val && val === 'on', z.boolean()).optional(),
})

export const countryString = z.string().transform((val, ctx) => {
  const country = countries.find((c) => c.name === val || c.code === val)
  if (!country) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A valid Country is required',
    })

    return z.NEVER
  }

  return country.code
})

// General support/contact form (used by /contact — the App Store support URL).
// Separate from cardRequestSchema so the two forms evolve independently.
export const contactMessageSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, {message: 'Name is required'})
    .max(100, {message: 'Name must be 100 characters or fewer'}),
  email: z
    .string()
    .trim()
    .email({message: 'A valid email is required'})
    .max(254, {message: 'Email must be 254 characters or fewer'}),
  message: z
    .string()
    .trim()
    .min(10, {message: 'Message must be at least 10 characters'})
    .max(2000, {message: 'Message must be 2000 characters or fewer'}),
  // Cloudflare Turnstile token — validated server-side.
  'cf-turnstile-response': z.string().optional().default(''),
})

export const cardRequestSchema = thankYouFormSchema.extend({
  name: z.string().min(2, {message: 'Field is required'}),
  email: z.string().email({message: 'A valid email is required'}),
  quantity: z.coerce.number().int().min(1, {message: 'At least 1 deck is required'}),
  organization: z.string().optional().default(''),
  phone: z.string().regex(/^[\d\s()+-.]+$/, {message: 'Invalid phone number'}),
  address: z.string().min(1, {message: 'Field is required'}),
  address2: z.string().optional().default(''),
  zip: z.string().min(1, {message: 'Field is required'}),
  city: z.string().min(1, {message: 'Field is required'}),
  region: z.string().optional().default(''),
  country: countryString,
  message: z.string().optional().default(''),
})
