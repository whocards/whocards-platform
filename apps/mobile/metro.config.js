// Learn more: https://docs.expo.dev/guides/monorepo/
const {getDefaultConfig} = require('expo/metro-config')
const {withNativewind} = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// 1. Watch the whole monorepo so changes in packages/* hot-reload.
config.watchFolders = [workspaceRoot]
// 2. Resolve modules from the app first, then the workspace root. Hierarchical
//    lookup stays ON: pnpm nests transitive deps (e.g. @expo/metro-runtime), so
//    disabling it would break their resolution.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// 3. Honour the "exports" field so @whocards/* resolve to their src entry points.
config.resolver.unstable_enablePackageExports = true

// 4. NativeWind v5: registers the CSS transformer and the resolver that swaps
//    `react-native` for `react-native-css/components`, which is what gives every
//    primitive its `className` prop. There is no `input` option any more —
//    src/global.css is imported as a normal module from src/app/_layout.tsx.
const nativewindConfig = withNativewind(config)
const EXPO_ASSET = /[\\/]node_modules[\\/]expo-asset[\\/]/

module.exports = {
  ...nativewindConfig,
  resolver: {
    ...nativewindConfig.resolver,
    // react-native-css's `react-native` stand-in has no AssetRegistry, which expo-asset 58 imports, so it gets the real one.
    resolveRequest: (context, moduleName, platform) =>
      moduleName === 'react-native' && EXPO_ASSET.test(context.originModulePath)
        ? context.resolveRequest(context, moduleName, platform)
        : nativewindConfig.resolver.resolveRequest(context, moduleName, platform),
  },
}
