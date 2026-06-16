/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference path="../.astro/icon.d.ts" />

interface Window {
  langsModal: HTMLDialogElement
  posthog?: import('posthog-js').PostHog
}
