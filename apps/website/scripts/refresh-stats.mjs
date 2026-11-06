#!/usr/bin/env node
// Trigger a /stats snapshot rebuild by hand (the same call the hourly Netlify function makes).
//
// Usage:
//   pnpm --filter website stats:refresh                       # against https://whocards.cc
//   pnpm --filter website stats:refresh -- http://localhost:4321
//
// Reads STATS_REFRESH_SECRET from the root .env (via with-env).

const base = process.argv[2] ?? 'https://whocards.cc'
const secret = process.env.STATS_REFRESH_SECRET
if (!secret) {
  console.error('STATS_REFRESH_SECRET is not set')
  process.exit(1)
}

const url = new URL('/api/stats/refresh', base)
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error(`Refusing to send the refresh secret over ${url.protocol} to ${url.hostname}`)
  process.exit(1)
}

const response = await fetch(url, {
  method: 'POST',
  headers: {authorization: `Bearer ${secret}`},
  redirect: 'error',
})
const body = await response.text()
console.log(`${response.status} ${body}`)
process.exit(response.ok ? 0 : 1)
