/// <reference types="react-native-css/types" />

/*
 * NativeWind v5 dropped the ambient `*.css` module declaration that v4's
 * generated `nativewind-env.d.ts` carried, and TypeScript errors (TS2882) on a
 * side-effect import it can't resolve. `src/global.css` is consumed by Metro
 * (and, in tests, by jest.global-setup.js) — it has no runtime exports, so an
 * empty module is the accurate type.
 */
declare module '*.css' {}
