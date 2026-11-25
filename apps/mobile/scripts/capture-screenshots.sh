#!/usr/bin/env bash
# Capture store-listing screenshots across a device matrix with Maestro (#34, #111).
#
# Each device runs .maestro/screenshots/store-screens.yaml and writes its frames to
# store-assets/<name>/NN-*.png. The app must already be installed on each device
# (see .maestro/README.md for the build step).
#
# Usage:
#   DEVICES="<device>:<name> ..." pnpm -F mobile screenshots
#
# where <device> is a WhoCards device key from scripts/devices.mjs (pro, plus, duo) and
# <name> is the output folder. Each device is created, booted and (iOS) slimmed first.
#
# App Store submission needs a 6.5" Display set, so that is the DEFAULT: with no DEVICES
# it captures `WhoCards iPhone 14 Plus` (1284×2778) to `iphone-6.5`, size-checked:
#   pnpm -F mobile screenshots
# A full matrix (the folder name still drives the size check):
#   DEVICES="plus:iphone-6.5 pro:iphone-17-pro duo:duo" pnpm -F mobile screenshots
#
# Note: Maestro needs a valid JAVA_HOME (a JDK). If `maestro` errors with
# "JAVA_HOME is set to an invalid directory", point it at an installed JDK first.
set -euo pipefail
cd "$(dirname "$0")/.."

FLOW=.maestro/screenshots/store-screens.yaml
DEVICES="${DEVICES:-plus:iphone-6.5}"

# Apple-accepted portrait pixel sizes per known App Store slot folder name. A folder
# named for a slot is dimension-checked; any other name is captured without a check.
# Ref: App Store Connect "Screenshot specifications".
accepted_sizes_for() {
  case "$1" in
  iphone-6.5) echo "1242x2688 1284x2778" ;; # 11 Pro Max/XS Max · 14 Plus / 13·12 Pro Max
  iphone-6.7) echo "1290x2796" ;;           # 15/14 Pro Max
  iphone-6.9) echo "1320x2868" ;;           # 16 Pro Max
  ipad-12.9 | ipad-13) echo "2048x2732" ;;  # iPad Pro 12.9" / 13"
  *) echo "" ;;
  esac
}

mismatch=0

verify_sizes() {
  local name="$1"
  local accepted
  accepted="$(accepted_sizes_for "$name")"
  [[ -z "$accepted" ]] && return 0 # not a known slot — nothing to check

  local dir="store-assets/$name"
  local png dims ok a
  for png in "$dir"/*.png; do
    [[ -e "$png" ]] || continue
    dims="$(sips -g pixelWidth -g pixelHeight "$png" 2>/dev/null \
      | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w"x"h}')"
    ok=0
    for a in $accepted; do [[ "$dims" == "$a" ]] && ok=1; done
    if [[ "$ok" == 1 ]]; then
      echo "  ✓ $(basename "$png") $dims"
    else
      echo "  ✗ $(basename "$png") $dims — not an accepted $name size ($accepted)" >&2
      mismatch=1
    fi
  done
}

for entry in $DEVICES; do
  key="${entry%%:*}"
  name="${entry##*:}"
  if [[ -z "$key" || -z "$name" || "$key" == "$name" ]]; then
    echo "✗ bad DEVICES entry '$entry' — expected '<device>:<name>'" >&2
    exit 1
  fi
  id="$(node scripts/devices.mjs prepare "$key")"
  echo "▶ capturing on $name ($id)"
  app_id="cc.whocards.mobile"
  [[ "$key" == "duo" ]] && app_id="com.whocards.mobile"
  maestro --device "$id" test "$FLOW" -e "DEVICE=$name" -e "APP_ID=$app_id"
  verify_sizes "$name"
done

if [[ "$mismatch" == 1 ]]; then
  echo "✗ some captures are not an App Store-accepted size for their slot — see ✗ above" >&2
  exit 1
fi

echo "✓ screenshots written to store-assets/<device>/"
