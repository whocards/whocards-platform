#!/usr/bin/env bash
# Capture store-listing screenshots across a device matrix with Maestro (#34, #111).
#
# Each device runs .maestro/screenshots/store-screens.yaml and writes its frames to
# store-assets/<name>/NN-*.png. The app must already be installed on each device
# (see .maestro/README.md for the build step).
#
# Usage:
#   DEVICES="<device-id>:<name> ..." pnpm -F mobile screenshots
#
# where <device-id> is an iOS simulator UDID or an Android adb serial (e.g. emulator-5554),
# and <name> is the output folder. Example (the two latest iPhones + the Pixel):
#   DEVICES="42FBA25B-...:iphone-17-pro-max CE068174-...:iphone-17-pro emulator-5554:pixel-3a" \
#     pnpm -F mobile screenshots
#
# App Store submission needs a 6.5" Display set (see .maestro/README.md). Name the
# folder for the slot (e.g. `iphone-6.5`) and this script verifies the captured PNGs
# match an Apple-accepted size for that slot, so a wrong-sized capture is caught here
# instead of being rejected at upload:
#   DEVICES="<iphone-14-plus-udid>:iphone-6.5" pnpm -F mobile screenshots
#
# Note: Maestro needs a valid JAVA_HOME (a JDK). If `maestro` errors with
# "JAVA_HOME is set to an invalid directory", point it at an installed JDK first.
set -euo pipefail
cd "$(dirname "$0")/.."

FLOW=.maestro/screenshots/store-screens.yaml
: "${DEVICES:?set DEVICES to <device-id>:<name> pairs — see the header of this script for examples}"

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
  id="${entry%%:*}"
  name="${entry##*:}"
  if [[ -z "$id" || -z "$name" || "$id" == "$name" ]]; then
    echo "✗ bad DEVICES entry '$entry' — expected '<device-id>:<name>'" >&2
    exit 1
  fi
  echo "▶ capturing on $name ($id)"
  maestro --device "$id" test "$FLOW" -e "DEVICE=$name"
  verify_sizes "$name"
done

if [[ "$mismatch" == 1 ]]; then
  echo "✗ some captures are not an App Store-accepted size for their slot — see ✗ above" >&2
  exit 1
fi

echo "✓ screenshots written to store-assets/<device>/"
