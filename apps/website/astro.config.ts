import mdx from '@astrojs/mdx'
import netlify from '@astrojs/netlify'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import icon from 'astro-icon'
import robotsTxt from 'astro-robots-txt'
import {defineConfig, passthroughImageService} from 'astro/config'
import {SITE_URL as site} from './src/constants/env'
import languages from './src/data/languages.json'

// `/[language]` routes are 301 redirects to `/` (see src/pages/[language]/index.astro),
// so keep them — and the noindexed image-preview pages — out of the sitemap.
const langRoutes = new Set(Object.keys(languages).map((lang) => `/${lang}`))

// https://astro.build/config
export default defineConfig({
  site,
  build: {
    format: 'file',
  },
  image: {
    service: passthroughImageService(),
  },
  vite: {
    // Single source of truth: load env from the monorepo root .env (relative to this
    // project root) so import.meta.env / @t3-oss reads the same root .env as the
    // dotenv-cli `with-env` scripts. See docs/RELEASE.md / the env-consolidation work.
    envDir: '../../',
    plugins: [tailwindcss()],
    ssr: {
      // @whocards/* workspace packages are exported as source (.ts), so Vite must
      // transpile them for SSR/build rather than externalising them as node deps.
      noExternal: [/^@whocards\//],
    },
  },
  trailingSlash: 'never',
  integrations: [
    mdx(),
    // Keep noindexed utility pages (/images, /[language]/images) out of the
    // sitemap so we don't advertise pages we ask crawlers not to index.
    sitemap({
      filter: (page) => {
        const {pathname} = new URL(page)
        // /dev/* (e.g. the Question Lab) is a dev-only tool gated to 404 in
        // production — astro-sitemap otherwise lists every SSR route
        // regardless of the runtime DEV gate, so exclude it explicitly.
        return (
          !pathname.endsWith('/images') && !langRoutes.has(pathname) && !pathname.startsWith('/dev')
        )
      },
    }),
    robotsTxt(),
    react(),
    icon({
      include: {
        mdi: [
          'twitter',
          'linkedin',
          'instagram',
          'github',
          'email',
          'arrow-up',
          'apple',
          'google-play',
        ],
        'fa-solid': ['clone', 'external-link-alt'],
        ic: [
          'outline-arrow-back',
          'outline-arrow-forward',
          'baseline-email',
          'twotone-share',
          'round-close',
        ],
        ri: ['facebook-fill'],
        zondicons: ['checkmark'],
        'entypo-social': ['facebook'],
      },
    }),
  ],
  output: 'static',
  adapter: netlify(),
  redirects: {
    '/preorder': '/contact',
    '/gift': '/contact',
  },
})
