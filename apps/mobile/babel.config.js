module.exports = function (api) {
  // Calling api.env() registers env-keyed caching (so we must NOT also call
  // api.cache(true), which would throw "Caching has already been configured").
  const isTest = api.env('test')
  return {
    presets: [['babel-preset-expo', {jsxImportSource: 'nativewind'}], 'nativewind/babel'],
    // In Metro builds, babel-preset-expo already injects babel-plugin-react-compiler
    // (it reads app.json experiments.reactCompiler via the Metro caller), so adding it
    // here too would run the compiler twice. Jest has no Metro caller, so the preset
    // can't inject it — add it explicitly for the test transform only.
    plugins: isTest ? ['babel-plugin-react-compiler'] : [],
  }
}
