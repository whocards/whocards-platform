import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {readFile, stat, unlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {extname, join, normalize} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gzipSync} from 'node:zlib'

const MAX_LCP_MS = 2_500
const MAX_CLS = 0.1
const MIN_ACCESSIBILITY_SCORE = 0.82
const RUNS = Number.parseInt(process.env.LIGHTHOUSE_RUNS ?? '3', 10)
const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
let serverUrl

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
    const file = await resolveFile(new URL(request.url, serverUrl).pathname)
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

const medianOf = (values) => {
  const sortedValues = values.toSorted((a, b) => a - b)
  return sortedValues[Math.floor(sortedValues.length / 2)]
}

const runLighthouse = (index) =>
  new Promise((resolve, reject) => {
    const outputPath = join(tmpdir(), `whocards-mobile-lighthouse-${process.pid}-${index}.json`)
    const chromePathArgs = process.env.CHROME_PATH
      ? [`--chrome-path=${process.env.CHROME_PATH}`]
      : []
    const lighthouse = spawn(
      join(DIST, '../node_modules/.bin/lighthouse'),
      [
        serverUrl,
        ...chromePathArgs,
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

await new Promise((resolve, reject) => {
  const handleError = (error) => reject(error)
  server.once('error', handleError)
  server.listen(0, '127.0.0.1', () => {
    server.off('error', handleError)
    resolve()
  })
})

const address = server.address()
if (!address || typeof address === 'string') {
  server.close()
  throw new Error('Could not determine the Lighthouse server port')
}
serverUrl = `http://127.0.0.1:${address.port}/`

try {
  const reports = []
  for (let index = 0; index < RUNS; index += 1) reports.push(await runLighthouse(index))

  const samples = reports.map((report) => {
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
  const lcpMedianSample = samples.toSorted((a, b) => a.lcp - b.lcp)[
    Math.floor(samples.length / 2)
  ]
  const median = {
    accessibility: medianOf(samples.map((sample) => sample.accessibility)),
    cls: medianOf(samples.map((sample) => sample.cls)),
    lcp: lcpMedianSample.lcp,
    simulatedLcp: medianOf(samples.map((sample) => sample.simulatedLcp)),
    lcpElement: lcpMedianSample.lcpElement,
  }

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
