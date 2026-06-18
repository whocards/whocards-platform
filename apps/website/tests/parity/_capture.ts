/**
 * Shared capture + diff helpers for the visual-parity suite.
 *
 * Used by:
 *   tests/parity/parity.spec.ts  (v1 — static routes via static-server)
 *   tests/parity-ssr/parity.ssr.spec.ts (v2 — SSR routes via astro dev)
 *
 * Underscore prefix keeps Playwright from treating this as a test file.
 */

import type {BrowserContext, Page, TestInfo} from '@playwright/test'
import {expect} from '@playwright/test'
import pixelmatch from 'pixelmatch'
import {PNG} from 'pngjs'

// ---------------------------------------------------------------------------
// Tolerance constants
// ---------------------------------------------------------------------------

/** Up to 2% of pixels may differ (asset-hash differences, font sub-pixel
 *  rendering, minor layout shifts are all acceptable noise). */
export const MAX_DIFF_PIXEL_RATIO = 0.02

/** Per-pixel color distance threshold (0–1). 0.1 catches meaningful differences
 *  while ignoring sub-pixel aliasing. */
export const PIXEL_THRESHOLD = 0.1

// ---------------------------------------------------------------------------
// Stabilisation helpers
// ---------------------------------------------------------------------------

/** Inject styles that freeze motion and hide dynamic UI on a page.
 *
 *  Also hides `<astro-dev-toolbar>` (injected by `astro dev`; harmless for
 *  the v1 static-server harness). */
export async function freezeMotion(page: Page) {
  await page.addStyleTag({
    content: [
      '* { animation: none !important; transition: none !important; caret-color: transparent !important; }',
      // GSAP drives the rotating hero words (.rotate) via inline styles on rAF, so
      // `animation: none` can't freeze them. Hide the region (layout preserved, so
      // no reflow) → identical on both origins. !important overrides the inline
      // visibility:visible that rotateText.ts sets.
      '.rotate, .rotate * { visibility: hidden !important; }',
      // Hide cookie/consent banners by common selectors (best-effort).
      '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"],',
      '[id*="banner"], [class*="banner"], [data-cookiebanner], #onetrust-banner-sdk { display: none !important; }',
      // Hide the Astro dev toolbar (injected by `astro dev`; not present in prod builds).
      'astro-dev-toolbar { display: none !important; }',
    ].join('\n'),
  })
}

/** Block analytics requests (PostHog and consent scripts). */
export async function blockAnalytics(page: Page) {
  await page.route(/posthog\.com|posthog/, (route) => route.abort())
  await page.route(/consent|cookiebot|cookiehub|cookielaw|gdpr/, (route) => route.abort())
}

/** Best-effort banner dismissal by common button labels. */
export async function dismissBanners(page: Page) {
  const dismissLabels = ['Accept', 'Accept all', 'I accept', 'OK', 'Close', 'Got it', 'Dismiss']
  for (const label of dismissLabels) {
    const btn = page.getByRole('button', {name: label, exact: false})
    if (await btn.isVisible({timeout: 300}).catch(() => false)) {
      await btn.click().catch(() => {})
      break
    }
  }
}

/** Navigate to a URL with full stabilisation. */
export async function stableGoto(page: Page, url: string) {
  await blockAnalytics(page)
  // Inject motion freeze before the page loads via initScript.
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent =
      '* { animation: none !important; transition: none !important; caret-color: transparent !important; }' +
      '.rotate, .rotate * { visibility: hidden !important; }' +
      'astro-dev-toolbar { display: none !important; }'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  })
  await page.goto(url, {waitUntil: 'domcontentloaded'})
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  // Apply freeze again post-load (catches late-mounting components).
  await freezeMotion(page)
  // Dismiss any visible cookie/interstitial banner.
  await dismissBanners(page)
  // Brief settle to let any remaining paint flush.
  await page.waitForTimeout(300)
}

// ---------------------------------------------------------------------------
// PNG normalisation (pad to equal dimensions before pixelmatch)
// ---------------------------------------------------------------------------

/**
 * Decode a raw PNG buffer into a {data, width, height} struct.
 * pngjs .sync.read() is used to avoid async overhead in the test loop.
 */
export function decodePng(buffer: Buffer): PNG {
  return PNG.sync.read(buffer)
}

/**
 * Pad both images to maxWidth × maxHeight, filling extra space with white.
 * pixelmatch requires equal dimensions.
 */
export function normalizeDimensions(
  a: PNG,
  b: PNG
): {imgA: Buffer; imgB: Buffer; w: number; h: number} {
  const w = Math.max(a.width, b.width)
  const h = Math.max(a.height, b.height)

  const pad = (src: PNG): Buffer => {
    if (src.width === w && src.height === h) return src.data

    const out = Buffer.alloc(w * h * 4, 255) // fill white (RGBA)
    for (let row = 0; row < src.height; row++) {
      const srcOffset = row * src.width * 4
      const dstOffset = row * w * 4
      src.data.copy(out, dstOffset, srcOffset, srcOffset + src.width * 4)
    }
    return out
  }

  return {imgA: pad(a), imgB: pad(b), w, h}
}

// ---------------------------------------------------------------------------
// Main dual-capture + diff helper
// ---------------------------------------------------------------------------

export interface CaptureAndDiffArgs {
  page: Page
  context: BrowserContext
  testInfo: TestInfo
  deployedUrl: string
  localUrl: string
  label: string
  /** Optional: wait for this selector before screenshotting (e.g. for client:only islands). */
  waitForSelector?: string
}

/**
 * Capture screenshots from both origins, pixel-diff them, attach all three
 * images to the test report, and soft-assert the diff ratio is within tolerance.
 *
 * Identical logic to the original parity.spec.ts inline implementation;
 * extracted here so both v1 (static) and v2 (SSR) specs can share it.
 */
export async function captureAndDiff({
  page,
  context,
  testInfo,
  deployedUrl,
  localUrl,
  label,
  waitForSelector,
}: CaptureAndDiffArgs): Promise<void> {
  // Open a second browser context page for the deployed origin.
  const deployedPage = await context.newPage()

  // Capture deployed screenshot.
  await stableGoto(deployedPage, deployedUrl)
  if (waitForSelector) {
    await deployedPage.waitForSelector(waitForSelector, {timeout: 15_000}).catch(() => {})
  }
  const deployedBuffer = await deployedPage.screenshot({fullPage: true})
  await deployedPage.close()

  // Capture local screenshot.
  await stableGoto(page, localUrl)
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, {timeout: 15_000}).catch(() => {})
  }
  const localBuffer = await page.screenshot({fullPage: true})

  // Decode PNGs.
  const deployedPng = decodePng(deployedBuffer)
  const localPng = decodePng(localBuffer)

  // Normalise to equal canvas size.
  const {imgA, imgB, w, h} = normalizeDimensions(deployedPng, localPng)

  // Run pixel diff.
  const diffPng = new PNG({width: w, height: h})
  const diffPixels = pixelmatch(imgA, imgB, diffPng.data, w, h, {
    threshold: PIXEL_THRESHOLD,
    includeAA: false,
  })
  const diffBuffer = PNG.sync.write(diffPng)
  const totalPixels = w * h
  const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0

  // Attach all three images BEFORE asserting so the report always has them,
  // even when the test fails.
  await testInfo.attach(`deployed — ${label}`, {body: deployedBuffer, contentType: 'image/png'})
  await testInfo.attach(`local — ${label}`, {body: localBuffer, contentType: 'image/png'})
  await testInfo.attach(`diff — ${label}`, {body: diffBuffer, contentType: 'image/png'})

  // Use soft assertion so one failing route doesn't abort the rest.
  expect
    .soft(diffRatio, `diff ratio for "${label}": ${(diffRatio * 100).toFixed(2)}%`)
    .toBeLessThanOrEqual(MAX_DIFF_PIXEL_RATIO)
}
