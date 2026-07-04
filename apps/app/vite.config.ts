import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import netlify from '@netlify/vite-plugin-tanstack-start'
import {nitro} from 'nitro/vite'
import {defineConfig} from 'vite'

// WhoCards @ Work — the authenticated app (ADR-0008). Separate framework from
// apps/website (Astro); this one is TanStack Start (Vite + Nitro) deployed to its
// own dedicated Netlify site. Never touches apps/website's build.
export default defineConfig({
  server: {
    port: 3100,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src',
    }),
    viteReact(),
    nitro(),
    // Must come after tanstackStart()/nitro() — it swaps the Nitro output target to
    // Netlify Functions and gives full local emulation of the Netlify platform.
    netlify(),
  ],
})
