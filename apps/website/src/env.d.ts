/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference path="../.astro/icon.d.ts" />

interface ImportMetaEnv {
  /** Opt in to recording Answer events while running the dev server. Prod always records. */
  readonly PUBLIC_RECORD_ANSWERS?: string
}

interface Window {
  langsModal: HTMLDialogElement
  posthog?: import('posthog-js').PostHog
}

// // No @types packages exist for these modules; declare them to suppress ts(7016).
// declare module 'bidi-js' {
//   const bidiFactory: () => {
//     getEmbeddingLevels(text: string, dir?: 'ltr' | 'rtl'): unknown
//     getReorderedString(text: string, levels: unknown): string
//   }
//   export default bidiFactory
// }

// declare module 'wawoff2' {
//   export function decompress(buf: Uint8Array | Buffer): Promise<Uint8Array>
// }
