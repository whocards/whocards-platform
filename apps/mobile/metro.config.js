// Learn more: https://docs.expo.dev/guides/monorepo/
const {getDefaultConfig} = require('expo/metro-config')
const {withNativeWind} = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// 1. Watch the whole monorepo so changes in packages/* hot-reload.
config.watchFolders = [workspaceRoot]
// 2. Resolve modules from the app first, then the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.disableHierarchicalLookup = true
// 3. Honour the "exports" field so @whocards/* resolve to their src entry points.
config.resolver.unstable_enablePackageExports = true

module.exports = withNativeWind(config, {input: './src/global.css'})
