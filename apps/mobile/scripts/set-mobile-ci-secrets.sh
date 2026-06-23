#!/usr/bin/env bash
#
# Push the mobile-release CI secrets to GitHub Actions via the `gh` CLI.
# These are consumed by .github/workflows/mobile-release.yml (see #12 / #27).
#
# Nothing sensitive is hard-coded here — values are read from your environment and
# from the .p8 file on disk. Run this locally when you have the App Store Connect
# API key handy (the same key `eas-cli credentials` set up).
#
# Usage:
#   APP_STORE_KEY_ID=ABC123XYZ \
#   APP_STORE_ISSUER_ID=00000000-0000-0000-0000-000000000000 \
#   APP_STORE_KEY_P8_PATH=/path/to/AuthKey_ABC123XYZ.p8 \
#   ./apps/mobile/scripts/set-mobile-ci-secrets.sh
#
# EXPO_TOKEN is assumed already set. The Play service-account JSON
# (PLAY_SERVICE_ACCOUNT_JSON) is pushed too, when the JSON is present on disk.
#
# This script does NOT enable the release pipeline: EAS_RELEASE_ENABLED stays false.

set -euo pipefail

REPO="${REPO:-whocards/whocards-platform}"

# --- preconditions ---------------------------------------------------------
command -v gh >/dev/null 2>&1 || { echo "error: gh CLI not found (https://cli.github.com)" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "error: not authenticated — run: gh auth login" >&2; exit 1; }

: "${APP_STORE_KEY_ID:?set APP_STORE_KEY_ID — the App Store Connect API key id}"
: "${APP_STORE_ISSUER_ID:?set APP_STORE_ISSUER_ID — the App Store Connect issuer id}"
: "${APP_STORE_KEY_P8_PATH:?set APP_STORE_KEY_P8_PATH — path to the AuthKey_*.p8 file}"
[ -f "$APP_STORE_KEY_P8_PATH" ] || { echo "error: .p8 not found at: $APP_STORE_KEY_P8_PATH" >&2; exit 1; }

# --- iOS submit secrets (#12) ----------------------------------------------
echo "Pushing iOS App Store Connect secrets to $REPO ..."
gh secret set APP_STORE_KEY_ID    --repo "$REPO" --body "$APP_STORE_KEY_ID"
gh secret set APP_STORE_ISSUER_ID --repo "$REPO" --body "$APP_STORE_ISSUER_ID"
gh secret set APP_STORE_KEY_P8    --repo "$REPO" < "$APP_STORE_KEY_P8_PATH"

# --- Android submit secret -------------------------------------------------
# The Play service-account JSON consumed by `eas submit -p android` (mobile-release.yml).
# Defaults to the gitignored credentials path; override with PLAY_SERVICE_ACCOUNT_JSON_PATH.
PLAY_SERVICE_ACCOUNT_JSON_PATH="${PLAY_SERVICE_ACCOUNT_JSON_PATH:-apps/mobile/credentials/android/google-play-service-account.json}"
if [ -f "$PLAY_SERVICE_ACCOUNT_JSON_PATH" ]; then
  echo "Pushing Play service-account secret to $REPO ..."
  gh secret set PLAY_SERVICE_ACCOUNT_JSON --repo "$REPO" < "$PLAY_SERVICE_ACCOUNT_JSON_PATH"
else
  echo "skip PLAY_SERVICE_ACCOUNT_JSON — no JSON at $PLAY_SERVICE_ACCOUNT_JSON_PATH"
  echo "  (set PLAY_SERVICE_ACCOUNT_JSON_PATH=/path/to/service-account.json to push it)"
fi

# --- safety readout (does not modify the gate) -----------------------------
echo
echo "iOS secrets set: APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, APP_STORE_KEY_P8."
echo "Release gate (unchanged — the pipeline stays inert until you flip this):"
echo "  EAS_RELEASE_ENABLED = $(gh variable get EAS_RELEASE_ENABLED --repo "$REPO" 2>/dev/null || echo '(unset → off)')"
