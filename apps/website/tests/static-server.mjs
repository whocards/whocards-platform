// Minimal zero-dependency static file server for serving the built `dist/`
// output during Playwright e2e runs.
//
// Why a custom server instead of `astro preview`?
//   The Netlify adapter (@astrojs/netlify) does NOT support `astro preview`
//   ("The @astrojs/netlify adapter does not support the preview command."),
//   and `astro dev` tries to start Netlify Dev, which requires network access
//   to api.netlify.com. Neither is viable for a hermetic CI run. The site is
//   built with `output: 'static'`, so the vast majority of routes are emitted
//   as plain HTML/asset files we can serve directly.
//
// Astro is configured with `build.format: 'file'` and `trailingSlash: 'never'`,
// so a request for `/en/question/1` maps to `dist/en/question/1.html` and `/`
// maps to `dist/index.html`.
//
// Note: SSR-only routes (e.g. `/contact`, `/api/*` which are `prerender = false`)
// are emitted as a Netlify function, not as static files, and are therefore NOT
// served here. Tests that need those are skipped (see tests/e2e/contact.spec.ts).

import {createServer} from 'node:http'
import {createReadStream, existsSync, statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, extname, join, normalize} from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
const port = Number(process.env.PORT) || 4321

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

if (!existsSync(distDir)) {
  console.error(`[static-server] dist directory not found at ${distDir}. Run the build first.`)
  process.exit(1)
}

/** Resolve a request pathname to a file inside dist, honoring Astro's `format: 'file'`. */
const resolveFile = (pathname) => {
  // Decode and strip query/hash, then normalize to prevent path traversal.
  let p = decodeURIComponent(pathname.split('?')[0].split('#')[0])
  const safe = normalize(p).replace(/^(\.\.[/\\])+/, '')
  let filePath = join(distDir, safe)

  if (!filePath.startsWith(distDir)) return null // traversal guard

  // Exact file hit (assets, *.html requested directly).
  if (existsSync(filePath) && statSync(filePath).isFile()) return filePath

  // Astro `format: 'file'` clean URL -> sibling <path>.html.
  // NOTE: a path like /en can be BOTH a directory (dist/en/) and a page
  // (dist/en.html). Prefer the .html sibling, matching Astro's emitted routes.
  if (!extname(filePath)) {
    const html = `${filePath}.html`
    if (existsSync(html) && statSync(html).isFile()) return html
  }

  // Directory (or root) -> index.html inside it.
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    const index = join(filePath, 'index.html')
    if (existsSync(index) && statSync(index).isFile()) return index
  }

  return null
}

const server = createServer((req, res) => {
  const filePath = resolveFile(req.url || '/')

  if (!filePath) {
    const notFound = join(distDir, '404.html')
    res.statusCode = 404
    if (existsSync(notFound)) {
      res.setHeader('Content-Type', mimeTypes['.html'])
      createReadStream(notFound).pipe(res)
    } else {
      res.end('Not Found')
    }
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', mimeTypes[extname(filePath)] || 'application/octet-stream')
  createReadStream(filePath).pipe(res)
})

server.listen(port, () => {
  console.log(`[static-server] serving ${distDir} on http://localhost:${port}`)
})
