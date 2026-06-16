import dotEnv from 'dotenv'
dotEnv.config()

const localhost = 'http://localhost:4321'

const hasProcess = typeof process !== undefined

export let SITE_URL: string = localhost

export const IS_PROD = hasProcess && !!process.env.NETLIFY

if (IS_PROD) {
  SITE_URL = (
    process.env.CONTEXT === 'production' ? process.env.URL : process.env.DEPLOY_PRIME_URL
  )!
}

if (!SITE_URL) {
  throw Error(`env vars messed up ${SITE_URL}`)
}
