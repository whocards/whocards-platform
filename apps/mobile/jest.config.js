/** @type {import('jest-expo').JestExpoConfig} */
module.exports = {
  preset: 'jest-expo',
  // Extend the jest-expo preset's transformIgnorePatterns. The preset already
  // handles react-native, @react-native, expo, and pnpm symlinks. We add the
  // extra packages our app uses that also ship ES modules.
  // Note: transformIgnorePatterns is an ARRAY — all patterns are tested and
  // a module is ignored if ANY pattern matches. We replace the whole array to
  // ensure the pnpm-aware leading pattern stays consistent.
  transformIgnorePatterns: [
    '/node_modules/(?!(' +
      '\\.pnpm' +
      '|react-native' +
      '|@react-native(-community)?' +
      '|expo(-.*)?/?' +
      '|@expo(-.*)?/?' +
      '|@unimodules/?' +
      '|nativewind' +
      '|react-native-css-interop' +
      '|react-native-gesture-handler' +
      '|react-native-safe-area-context' +
      '|react-native-screens' +
      '|react-native-worklets' +
      '|@react-native-async-storage' +
      '|@whocards' +
      '))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Resolve the @/* path alias declared in tsconfig.json.
    '^@/(.*)$': '<rootDir>/src/$1',
    // Point Reanimated to its official jest mock so no worklet/JSI is needed.
    '^react-native-reanimated$': '<rootDir>/node_modules/react-native-reanimated/mock',
  },
}
