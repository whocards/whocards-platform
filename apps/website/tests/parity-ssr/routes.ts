// Route manifest for the SSR visual-parity suite (v2).
//
// Only SSR routes (prerender: false) are listed here. They are served by
// `astro dev` on :4321 — the static-server harness used in v1 cannot serve them.
//
// DEPLOYED_URL is re-exported from the v1 routes module so the default/override
// logic stays single-sourced (defaults to https://whocards.cc; overridable via env).
//
// Play routes use ?lang=&q= deep links for determinism:
//   • ?q=<id> forces the Play island to start at that question (no shuffle).
//   • ?lang=<code> forces the displayed language.
// This makes both origins render identically on load — a prerequisite for pixel-diff.
//
// Excluded routes (documented below):
//   /purchase — redirects via Stripe createSession; requires a live Stripe key.
//              Under the placeholder .env it throws and returns Astro.redirect('/'),
//              so it's non-renderable in this harness.
//   /thanks   — requires a valid `?session_id=` Stripe session; without it,
//              Astro.redirect('/') is returned immediately (no HTML to capture).

export {DEPLOYED_URL} from '../parity/routes'

export interface Route {
  path: string
  name?: string
  /** Optional CSS selector to waitFor before screenshotting (client:only islands). */
  waitForSelector?: string
}

// The Play island renders the question text inside an <h1> once hydrated.
// This is the most stable selector to wait on before screenshotting.
const PLAY_CARD_SELECTOR = 'h1.whitespace-pre-wrap'

export const routes: Route[] = [
  // /play — default library deck, English, question 1 (deterministic via ?q=)
  {
    path: '/play?lang=en&q=1',
    name: 'play (en, q=1)',
    waitForSelector: PLAY_CARD_SELECTOR,
  },

  // /play — RTL Hebrew, question 1 (tests bidi/RTL layout parity)
  {
    path: '/play?lang=he&q=1',
    name: 'play (he/RTL, q=1)',
    waitForSelector: PLAY_CARD_SELECTOR,
  },

  // /play — CJK Mandarin, question 1 (tests CJK font loading)
  {
    path: '/play?lang=zh&q=1',
    name: 'play (zh/CJK, q=1)',
    waitForSelector: PLAY_CARD_SELECTOR,
  },

  // /play — English, question 5 (second card; verifies deep links beyond q=1)
  {
    path: '/play?lang=en&q=5',
    name: 'play (en, q=5)',
    waitForSelector: PLAY_CARD_SELECTOR,
  },

  // /contact — SSR form page (deterministic; no Stripe dependency)
  {path: '/contact', name: 'contact'},

  // EXCLUDED:
  // /purchase — requires live Stripe key; createSession throws under placeholder .env →
  //             page redirects to / before rendering any HTML
  // /thanks   — requires valid Stripe session_id param; redirects to /contact without it
]
