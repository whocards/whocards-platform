import mdx from '@astrojs/mdx'
import netlify from '@astrojs/netlify'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import icon from 'astro-icon'
import robotsTxt from 'astro-robots-txt'
import {defineConfig, passthroughImageService} from 'astro/config'
import {SITE_URL as site} from './src/constants/env'

// https://astro.build/config
export default defineConfig({
  site,
  build: {
    format: 'file',
  },
  // Disable the dev toolbar only when explicitly requested (the visual-parity SSR
  // harness sets this so `astro dev` screenshots don't capture the toolbar). Normal
  // `pnpm dev` keeps it. https://docs.astro.build/en/guides/dev-toolbar/#per-project
  devToolbar: {
    enabled: process.env.DISABLE_DEV_TOOLBAR !== 'true',
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
    sitemap(),
    robotsTxt(),
    react(),
    icon({
      include: {
        mdi: ['twitter', 'linkedin', 'instagram', 'github', 'email'],
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
