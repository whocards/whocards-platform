/**
 * Tailwind v4 runs as a PostCSS plugin. Expo's Metro CSS pipeline picks this
 * file up when it transforms src/global.css, and NativeWind v5 compiles that
 * output into the native stylesheet (see metro.config.js).
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
