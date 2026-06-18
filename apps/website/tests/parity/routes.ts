// Route manifest for the visual-parity suite.
//
// Only statically-emitted routes are listed here. They are served by
// tests/static-server.mjs (the local target) which only serves dist/ files.
//
// SSR routes (prerender:false) are OUT of v1 scope:
//   /play, /[language]/play, /contact, /purchase, /thanks
// See README.md for the follow-up plan.
//
// DEPLOYED_URL defaults to the canonical production domain. Override via env:
//   DEPLOYED_URL=https://staging.whocards.cc pnpm -F website test:parity
// If DEPLOYED_URL is explicitly empty, the suite test.skip()s.

export const DEPLOYED_URL = process.env.DEPLOYED_URL ?? 'https://whocards.cc'

export interface Route {
  path: string
  name?: string
}

// v1 static routes — confirmed against smoke.spec.ts staticRoutes + dist/ output.
// Redirects (gift → /, preorder → /) are excluded: they emit no static HTML.
// purchase/thanks/contact/play are prerender:false (Netlify function).
export const routes: Route[] = [
  // Marketing — default locale
  {path: '/', name: 'home'},
  {path: '/mission', name: 'mission'},
  {path: '/ai-at-work', name: 'ai-at-work'},
  {path: '/print', name: 'print'},
  {path: '/images', name: 'images'},
  {path: '/legal/pp', name: 'privacy-policy'},

  // i18n cross-section — home pages (RTL + CJK stress test)
  {path: '/en', name: 'home (en)'},
  {path: '/he', name: 'home (he/RTL)'},
  {path: '/zh', name: 'home (zh/CJK)'},

  // Localised images page (checks i18n content rendering)
  {path: '/en/images', name: 'images (en)'},

  // Event landing (statically pre-rendered, deterministic content)
  {path: '/events/hajnalig', name: 'event: hajnalig'},
  // NB: /events/hajnalig/play is statically served but its client engine SHUFFLES
  // the questions, so it is non-deterministic (self-diff ~4%). Like /play it needs
  // masking/seeding — deferred to the play-screen follow-up (see README.md).

  // 404 page (statically emitted as dist/404.html)
  {path: '/404', name: '404'},
]
