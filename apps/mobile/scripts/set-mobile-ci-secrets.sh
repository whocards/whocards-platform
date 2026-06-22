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
# EXPO_TOKEN is assumed already set. Android (PLAY_SERVICE_ACCOUNT_JSON) is deferred
# to #27 — see the commented block below.
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

# --- Android submit secret (#27 — deferred) --------------------------------
# Uncomment once a Play service-account JSON exists:
#   : "${PLAY_SERVICE_ACCOUNT_JSON_PATH:?set PLAY_SERVICE_ACCOUNT_JSON_PATH}"
#   gh secret set PLAY_SERVICE_ACCOUNT_JSON --repo "$REPO" < "$PLAY_SERVICE_ACCOUNT_JSON_PATH"

# --- safety readout (does not modify the gates) ----------------------------
echo
echo "Secrets set: APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, APP_STORE_KEY_P8."
echo "Release gates (unchanged — the pipeline stays inert until you flip these):"
echo "  EAS_RELEASE_ENABLED   = $(gh variable get EAS_RELEASE_ENABLED   --repo "$REPO" 2>/dev/null || echo '(unset → off)')"
echo "  MOBILE_ANDROID_ENABLED = $(gh variable get MOBILE_ANDROID_ENABLED --repo "$REPO" 2>/dev/null || echo '(unset → off)')"
