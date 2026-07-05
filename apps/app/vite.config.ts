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
// Pinned to vite 7 (not the newer 8.x the upstream TanStack Start example
// uses) and no @tailwindcss/vite: apps/website already pins its own vite 7 +
// @tailwindcss/vite; a second, differently-versioned vite anywhere in the
// workspace let pnpm cross-resolve website's peer dependency onto it, breaking
// website's typecheck as a side effect of this app existing at all — see
// src/styles/app.css's header comment for the full story. `resolve.tsconfigPaths`
// is a vite-8-only built-in, hence the vite-tsconfig-paths plugin below instead.
export default defineConfig({
  server: {
    port: 3100,
  },
  plugins: [
    tsconfigPaths(),
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
