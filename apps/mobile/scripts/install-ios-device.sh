#!/usr/bin/env bash
# Builds a Release WhoCards from this checkout and installs it on a cabled iPhone.
# No Metro, no EAS: the JS bundle is embedded, signed with the team's development cert.
#
#   pnpm -F mobile ios:device                  # first paired iPhone, root .env.prod
#   IOS_DEVICE=<udid> pnpm -F mobile ios:device
#   ENV= pnpm -F mobile ios:device             # root .env instead of .env.prod
#
# The phone must be unlocked, in Developer Mode, and trust this Mac. If signing fails
# with "login details rejected", sign in again in Xcode → Settings → Accounts.
set -euo pipefail
cd "$(dirname "$0")/.."

export ENV="${ENV-prod}"
TEAM_ID=6RTC67K8CW # eas.json appleTeamId

if [[ -z "${IOS_DEVICE:-}" ]]; then
  devices=$(mktemp)
  xcrun devicectl list devices --json-output "$devices" >/dev/null
  IOS_DEVICE=$(node -e '
    const {devices} = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result
    const phone = devices.find(
      (d) => d.hardwareProperties?.reality === "physical" && d.hardwareProperties?.platform === "iOS"
    )
    console.log(phone?.hardwareProperties.udid ?? "")
  ' "$devices")
  rm "$devices"
fi
if [[ -z "$IOS_DEVICE" ]]; then
  echo "No iPhone found. Plug it in, unlock it, and tap Trust." >&2
  exit 1
fi

# Always prebuild: a stale ios/ from before a native change builds the old app.
CI=1 pnpm with-env expo prebuild -p ios --pnpm
# Precompiled Expo modules link the prebuilt React.framework; a from-source React pod builds an app that crashes on launch.
if ! grep -q "React-Core-prebuilt" ios/Podfile.lock; then
  echo "Pods resolved React Native from source. Run: CI=1 pnpm with-env expo prebuild -p ios --pnpm --clean" >&2
  exit 1
fi

build() {
  pnpm with-env xcodebuild -workspace ios/WhoCards.xcworkspace -scheme WhoCards \
    -configuration Release -sdk iphoneos -destination "id=$IOS_DEVICE" \
    -derivedDataPath ios/build -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
    DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic build
}
# One retry: a fresh build can lose the ReactCodegen race (see pre-release-check.mjs).
build || build

xcrun devicectl device install app --device "$IOS_DEVICE" \
  ios/build/Build/Products/Release-iphoneos/WhoCards.app
echo "Installed on $IOS_DEVICE."
