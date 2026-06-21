module.exports = function (api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', {jsxImportSource: 'nativewind'}], 'nativewind/babel'],
    plugins: [
      // Mirror app.json experiments.reactCompiler: true so the jest transform
      // uses the same compiler as Metro (and the behaviour matches the running app).
      'babel-plugin-react-compiler',
    ],
  }
}
