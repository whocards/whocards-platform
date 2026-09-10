const fs = require('node:fs')
const path = require('node:path')

/**
 * Compiles the app's real src/global.css once, before the suite runs, and caches
 * the result for jest.setup.ts to inject into every test.
 *
 * The entry point is jest.global.css rather than src/global.css itself: that
 * wrapper is the shipped entry plus one extra `@source` for src/__tests__,
 * whose assertion-only class names the shipped stylesheet deliberately excludes.
 *
 * This is the exact pipeline Metro runs on device (react-native-css's Metro
 * transformer: PostCSS/Tailwind → `compile()` → `StyleCollection.inject()`), so
 * the styles the tests assert on are the styles the app ships — including the
 * `@theme` block generated from @whocards/tokens. A test that renders a
 * component and reads back a resolved colour is therefore also a check that the
 * whole CSS pipeline still works, which is the part of a NativeWind upgrade
 * that CI otherwise can't see.
 */
const STYLESHEET_PATH = path.join(__dirname, 'node_modules/.cache/whocards/global-css.json')

module.exports = async () => {
  // Required lazily: these are build-time-only deps, and globalSetup runs
  // outside the jest module registry.
  const postcss = require('postcss')
  const tailwindcss = require('@tailwindcss/postcss')
  const {compile} = require('react-native-css/compiler')

  const input = path.join(__dirname, 'jest.global.css')
  const {css} = await postcss([tailwindcss()]).process(fs.readFileSync(input, 'utf8'), {
    from: input,
  })
  const stylesheet = compile(css, {filename: input, projectRoot: __dirname}).stylesheet()

  fs.mkdirSync(path.dirname(STYLESHEET_PATH), {recursive: true})
  fs.writeFileSync(STYLESHEET_PATH, JSON.stringify(stylesheet))
}

module.exports.STYLESHEET_PATH = STYLESHEET_PATH
