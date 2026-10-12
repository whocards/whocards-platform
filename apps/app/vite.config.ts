import tailwindcss from '@tailwindcss/vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import netlify from '@netlify/vite-plugin-tanstack-start'
import {nitro} from 'nitro/vite'
import {defineConfig} from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// WhoCards @ Work — the authenticated app (ADR-0008). Separate framework from
// apps/website (Astro); this one is TanStack Start (Vite + Nitro) deployed to its
// own dedicated Netlify site. Never touches apps/website's build.
//
// Stays on vite 7 like apps/website: a second vite major breaks website's peer-dep resolution.
export default defineConfig({
  server: {
    port: 3100,
  },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src',
    }),
    viteReact(),
    nitro(),
    // Must come after tanstackStart()/nitro() — it swaps the Nitro output target to
    // Netlify Functions and gives full local emulation of the Netlify platform.
    // No edge functions here, and their dev emulation boots Deno, which crashes `vite dev`.
    netlify({dev: {edgeFunctions: {enabled: false}}}),
  ],
})
