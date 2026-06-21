# Mobile e2e (Maestro)

End-to-end flows for the Expo app, run with [Maestro](https://maestro.mobile.dev)
against a build installed on a booted simulator/device.

## Flows

- `rtl-alignment.yaml` — opens a deck, screenshots the default (English, LTR) card,
  switches to Hebrew, and screenshots the RTL card. Used to verify question-text
  alignment (Hebrew must read right-aligned). Screenshots land in
  `.maestro/artifacts/` (gitignored) for manual/visual inspection.

## Prerequisites (one-time)

- **Maestro CLI** — `curl -fsSL "https://get.maestro.mobile.dev" | bash` (needs a JDK).
- **CocoaPods** (iOS) — `brew install cocoapods`.

## Running

```bash
# 1. Build + install a self-contained Release build on a booted simulator
#    (Release embeds the JS bundle, so Metro isn't needed during the flow):
pnpm --filter mobile exec expo run:ios --configuration Release --device "iPhone 15 Pro"

# 2. Run the flows:
pnpm --filter mobile e2e
# or a single flow:
maestro test .maestro/rtl-alignment.yaml
```

## Notes

- Selectors use accessibility labels (e.g. `change language`, `exit deck`) because the
  bar buttons are `accessible` views that collapse their inner text — match the label,
  not the visible glyph.
- The player chrome auto-hides after 3s; flows tap the card center to re-reveal it
  immediately before tapping a control.
