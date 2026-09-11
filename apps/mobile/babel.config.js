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
    // `react-native-css/components`. On device the Metro resolver does that swap
    // (see metro.config.js), and it does it broadly: for every origin module it
    // resolves, node_modules included, and for `react-native-safe-area-context`
    // and deep `react-native/Libraries/**` imports as well as bare
    // `react-native`. Only react-native-css's own files and react-native's index
    // itself are exempt.
    // The safe-area adapter wraps SafeAreaProvider to expose CSS inset variables;
    // it re-exports SafeAreaView without adding className support. Pass native
    // styles to SafeAreaView, and keep its Jest mock equally unstyled.
    //
    // Jest has no Metro, so there the rewrite has to happen in Babel, which is a
    // narrower tool: it only rewrites `react-native` and `react-native/<Module>`
    // specifiers, never safe-area-context. It is also unscoped by default, and
    // rewriting react-native's own internals deadlocks the jest-expo Image mock
    // (react-native's LogBox imports Image, which would resolve back into the
    // half-initialised mock). So the preset is limited to src/ — deliberately
    // less than Metro rewrites, but enough for the `className` props under test.
    overrides: isTest ? [{test: path.join(__dirname, 'src'), presets: ['nativewind/babel']}] : [],
  }
}
