import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {readFile, stat, unlink} from 'node:fs/promises'
import {extname, join, normalize} from 'node:path'
import {gzipSync} from 'node:zlib'

const PORT = 4173
const MAX_LCP_MS = 2_500
const MAX_CLS = 0.1
const MIN_ACCESSIBILITY_SCORE = 0.82
const RUNS = Number.parseInt(process.env.LIGHTHOUSE_RUNS ?? '3', 10)
const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DIST = new URL('../dist/', import.meta.url).pathname

const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

const resolveFile = async (pathname) => {
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, '')
  const candidate = join(DIST, safePath === '/' ? 'index.html' : safePath)
  try {
    if ((await stat(candidate)).isFile()) return candidate
  } catch {}
  return `${candidate}.html`
}

const serveRequest = async (request, response) => {
  try {
    const file = await resolveFile(new URL(request.url, `http://127.0.0.1:${PORT}`).pathname)
    const body = await readFile(file)
    const shouldCompress = /gzip/.test(request.headers['accept-encoding'] ?? '')
    const headers = {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': mimeTypes[extname(file)] ?? 'application/octet-stream',
    }
    if (shouldCompress) headers['Content-Encoding'] = 'gzip'
    response.writeHead(200, headers)
    response.end(shouldCompress ? gzipSync(body) : body)
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
}

const server = createServer((request, response) => void serveRequest(request, response))

const readReport = async (outputPath) => {
  const report = JSON.parse(await readFile(outputPath, 'utf8'))
  await unlink(outputPath)
  return report
}

const runLighthouse = (index) =>
  new Promise((resolve, reject) => {
    const outputPath = `/tmp/whocards-mobile-lighthouse-${process.pid}-${index}.json`
    const lighthouse = spawn(
      join(DIST, '../node_modules/.bin/lighthouse'),
      [
        `http://127.0.0.1:${PORT}/`,
        `--chrome-path=${CHROME_PATH}`,
        '--chrome-flags=--headless=new --no-sandbox',
        '--throttling-method=devtools',
        '--only-categories=performance,accessibility',
        '--output=json',
        `--output-path=${outputPath}`,
        '--quiet',
      ],
      {stdio: 'inherit'},
    )
    lighthouse.on('error', reject)
    lighthouse.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`Lighthouse exited with code ${code}`))
      void readReport(outputPath).then(resolve, reject)
    })
  })

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

try {
  const reports = []
  for (let index = 0; index < RUNS; index += 1) reports.push(await runLighthouse(index))

  const samples = reports
    .map((report) => {
      const metrics = report.audits.metrics.details.items[0]
      return {
        accessibility: report.categories.accessibility.score,
        cls: metrics.observedCumulativeLayoutShift,
        lcp: metrics.observedLargestContentfulPaint,
        simulatedLcp: report.audits['largest-contentful-paint'].numericValue,
        lcpElement: report.audits['lcp-breakdown-insight']?.details?.items?.find(
          (item) => item.type === 'node',
        )?.snippet,
      }
    })
    .toSorted((a, b) => a.lcp - b.lcp)
  const median = samples[Math.floor(samples.length / 2)]

  console.log(JSON.stringify({median, samples}, null, 2))

  if (median.lcp > MAX_LCP_MS) throw new Error(`Mobile LCP ${median.lcp}ms exceeds ${MAX_LCP_MS}ms`)
  if (median.cls > MAX_CLS) throw new Error(`CLS ${median.cls} exceeds ${MAX_CLS}`)
  if (median.accessibility < MIN_ACCESSIBILITY_SCORE) {
    throw new Error(
      `Accessibility ${median.accessibility} regressed below ${MIN_ACCESSIBILITY_SCORE}`,
    )
  }
} finally {
  server.close()
}
