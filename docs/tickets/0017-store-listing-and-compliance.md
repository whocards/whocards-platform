# Store listing + compliance (assets, privacy policy, App Privacy / Data Safety)

**Tags:** mobile, release, compliance, store
**Surfaces:** mobile (`apps/mobile`), website (`/legal/pp`)
**Status:** open (not started). Raised 2026-06-21. Per [ADR-0005](../adr/0005-mobile-release-pipeline.md) · runbook [docs/RELEASE.md](../RELEASE.md).

## Context

Before promoting from beta to public, both stores need listing content and accurate
data-collection disclosures. A Privacy Policy already exists at `whocards.cc/legal/pp` but
predates the app and must be reviewed for the app's data.

## Goal

Both store listings are complete and the privacy disclosures match what the app actually collects.

## Approach

1. **Privacy Policy** (`apps/website`, `/legal/pp`): disclose the app's data — the **Device id**,
   the **Answer record** (deck/question/language/time), and **PostHog analytics** (#0004).
2. **Apple App Privacy** + **Google Play Data Safety** forms filled to match (device id +
   usage/analytics; declare no cross-app tracking unless a tracking SDK is added → then ATT +
   `NSUserTrackingUsageDescription`).
3. **Listing assets**: name, subtitle, description, keywords, category, screenshots per required
   device size, support URL (`hello@whocards.cc`).
4. **Permissions**: confirm the build requests only what's used (network, haptics); add usage
   strings only if a dep introduces a new permission.

## Acceptance

- Privacy policy covers the app; store privacy forms submitted and consistent with it.
- Listings complete enough to pass review and promote to public.

## Notes / out of scope

- Observability itself is #0004 (PostHog); this ticket only discloses it.

## References

- ADR-0005, docs/RELEASE.md (Phase 3), `apps/website` `/legal/pp`, ticket 0004
