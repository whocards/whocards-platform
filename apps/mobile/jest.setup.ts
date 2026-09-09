// @testing-library/react-native 13+ automatically extends jest matchers
// when you import from it in a test — no explicit extend-expect import needed.

// Gesture handler needs its jest shims loaded before any component under test
// that imports react-native-gesture-handler.
import 'react-native-gesture-handler/jestSetup'

import {readFileSync} from 'node:fs'
import {StyleCollection} from 'react-native-css/native'

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- globalSetup is CJS-only, so its one exported constant has to be require()d and re-typed here.
const {STYLESHEET_PATH} = require('./jest.global-setup.js') as {STYLESHEET_PATH: string}

/**
 * Load the compiled global.css (see jest.global-setup.js) into the same style
 * registry the Metro bundler writes into on device, so `className` resolves in
 * tests exactly as it does in the app. Without this every className is inert
 * and components render unstyled — which is precisely the failure mode the
 * styling tests are there to catch.
 */
const stylesheet: unknown = JSON.parse(readFileSync(STYLESHEET_PATH, 'utf8'))

beforeEach(() => {
  StyleCollection.styles.clear()
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON round-trip of the compiler's own output.
  StyleCollection.inject(stylesheet as Parameters<typeof StyleCollection.inject>[0])
})
