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
        return !pathname.endsWith('/images') && !langRoutes.has(pathname)
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
  adapter: netlify({
    // `/api/print.pdf` (#38) is `prerender = false` (a real Netlify function),
    // so the font/logo files it reads at request time via `process.cwd()`
    // (see src/server/print/render.ts) must be force-bundled — the SSR
    // bundler otherwise only picks up statically-imported assets.
    includeFiles: [
      './public/fonts/aptly_regular.woff2',
      './public/fonts/golos_text.woff2',
      // Hebrew/Mandarin/Japanese script fonts (#41) — regular weight only,
      // the print PDF never uses bold. ~2.7MB added to the function bundle;
      // pdf-lib's `embedFont(..., {subset: true})` (see render.ts) still
      // subsets the *output* PDF down to only the glyphs each deck actually
      // uses, so this only affects the deployed function size, not download size.
      './public/fonts/noto-sans-hebrew_regular.woff2',
      './public/fonts/noto-sans-chinese_regular.woff2',
      './public/fonts/noto-sans-japanese_regular.woff2',
      './src/icons/logo-plain.svg',
    ],
  }),
  redirects: {
    '/preorder': '/contact',
    '/gift': '/contact',
  },
})
