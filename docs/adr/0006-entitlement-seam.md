# ADR-0006: Local entitlement seam before purchases exist

Date: 2026-07-02
Status: Accepted

## Context

CONTEXT.md defines Access tiers (`free` / `unlock` / `subscription`) and requires the play engine to stay access-blind, with "a separate entitlement layer" deciding what a player may open. ADR-0004 deferred the monetization decision to a future ADR. The first paid feature — the Pick a Card Game and the multi-language Display setting, both tier `unlock` — is now being built, but no purchase infrastructure (IAP, receipts, accounts) exists yet, and building it first would block shipping the features.

## Decision

Ship the features behind a **local entitlement stub** in the mobile app (`apps/mobile/src/lib/entitlements.ts`):

- `getEntitlement(tier: AccessTier): Promise<Entitlement>` is the only way UI asks "may this player use this?". The async signature is deliberate: a future IAP/receipt/account check replaces the body without touching call sites.
- In this phase the stub grants everything: `free` → `{granted: true, reason: 'free'}`, paid tiers → `{granted: true, reason: 'early_access'}`.
- UI labels `early_access` grants ("Included in early access") so players learn these are paid features before they are ever charged, and taking them paid later is a communicated transition, not a silent removal.
- The engine (`packages/decks`) never imports or references entitlements.

## Consequences

- New paid-tier features ship now and gather usage data before purchases exist.
- Every player using a paid feature during early access has been told it is a paid feature; the future paywall is expected, not a surprise. Existing early-access users may still warrant grandfathering — that is a product decision for the purchase ADR, and the `reason` field preserves the information needed to make it.
- The purchase implementation (store choice, receipts, restore, server validation) remains an open, separate ADR; this ADR only fixes the seam's shape and the early-access posture.
