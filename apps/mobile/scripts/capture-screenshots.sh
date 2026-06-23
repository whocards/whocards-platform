#!/usr/bin/env bash
# Capture store-listing screenshots across a device matrix with Maestro (#34).
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
# Note: Maestro needs a valid JAVA_HOME (a JDK). If `maestro` errors with
# "JAVA_HOME is set to an invalid directory", point it at an installed JDK first.
set -euo pipefail
cd "$(dirname "$0")/.."

FLOW=.maestro/screenshots/store-screens.yaml
: "${DEVICES:?set DEVICES='<device-id>:<name> ...' — see this script's header for examples}"

for entry in $DEVICES; do
  id="${entry%%:*}"
  name="${entry##*:}"
  if [[ -z "$id" || -z "$name" || "$id" == "$name" ]]; then
    echo "✗ bad DEVICES entry '$entry' — expected '<device-id>:<name>'" >&2
    exit 1
  fi
  echo "▶ capturing on $name ($id)"
  maestro --device "$id" test "$FLOW" -e "DEVICE=$name"
done

echo "✓ screenshots written to store-assets/<device>/"
