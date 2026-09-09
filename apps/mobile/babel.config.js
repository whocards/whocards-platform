const path = require('node:path')

module.exports = function (api) {
  // Calling api.env() registers env-keyed caching (so we must NOT also call
  // api.cache(true), which would throw "Caching has already been configured").
  const isTest = api.env('test')
  return {
    presets: ['babel-preset-expo'],
    // In Metro builds, babel-preset-expo already injects babel-plugin-react-compiler
    // (it reads app.json experiments.reactCompiler via the Metro caller), so adding it
    // here too would run the compiler twice. Jest has no Metro caller, so the preset
    // can't inject it — add it explicitly for the test transform only.
    plugins: isTest ? ['babel-plugin-react-compiler'] : [],
    // NativeWind v5 makes `className` work by swapping `react-native` for
    // `react-native-css/components`. On device that swap is done by the Metro
    // resolver (see metro.config.js), which only rewrites the app's own modules.
    // Jest has no Metro, so there the rewrite has to happen in Babel — but the
    // Babel transform also runs over react-native's own internals, and rewriting
    // *those* deadlocks the jest-expo Image mock (react-native's LogBox imports
    // Image, which would resolve back into the half-initialised mock). Scoping
    // the preset to src/ keeps the rewrite where Metro would have applied it.
    overrides: isTest ? [{test: path.join(__dirname, 'src'), presets: ['nativewind/babel']}] : [],
  }
}
