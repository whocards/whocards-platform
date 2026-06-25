#!/usr/bin/env bash
#
# Push the website's PUBLIC_POSTHOG_* env vars to Netlify via the Netlify CLI.
# These are client-exposed (PUBLIC_ prefix) and read by apps/website at build time
# (src/components/PostHog.astro). The managed reverse-proxy host lives here too —
# point PUBLIC_POSTHOG_HOST at your CNAME subdomain (e.g. https://e.whocards.cc) so
# events skip browser ad-blockers; see docs / issue #4 for the DNS setup.
#
# Web config lives in Netlify, not GitHub Actions — the mobile-only release workflows
# never consume these PostHog vars, and mobile submit creds live on EAS, not in CI.
#
# Nothing is hard-coded — values are read from your environment. The easy path is to
# source your local root .env first:
#   set -a; source .env; set +a
#   ./apps/website/scripts/set-web-env.sh
#
# Or pass them inline:
#   PUBLIC_POSTHOG_KEY=phc_xxx \
#   PUBLIC_POSTHOG_HOST=https://e.whocards.cc \
#   PUBLIC_POSTHOG_UI_HOST=https://eu.posthog.com \
#   ./apps/website/scripts/set-web-env.sh
#
# Auth/site: assumes the Netlify CLI is authenticated (`netlify login`, or a
# NETLIFY_AUTH_TOKEN in the environment) and the site is linked (`netlify link`), or
# set NETLIFY_SITE_ID to target a specific site.

set -euo pipefail

# --- preconditions ---------------------------------------------------------
command -v netlify >/dev/null 2>&1 || {
  echo "error: netlify CLI not found — install with: npm i -g netlify-cli" >&2
  exit 1
}
netlify status >/dev/null 2>&1 || {
  echo "error: Netlify CLI not authenticated/linked — run: netlify login && netlify link" >&2
  exit 1
}

: "${PUBLIC_POSTHOG_KEY:?set PUBLIC_POSTHOG_KEY — the PostHog project API key (phc_...)}"
PUBLIC_POSTHOG_HOST="${PUBLIC_POSTHOG_HOST:-https://eu.i.posthog.com}"
PUBLIC_POSTHOG_UI_HOST="${PUBLIC_POSTHOG_UI_HOST:-https://eu.posthog.com}"

# Optional explicit site target (else the linked site is used). Guarded array
# expansion keeps this safe under `set -u` on macOS's bash 3.2.
SITE_ARGS=()
[ -n "${NETLIFY_SITE_ID:-}" ] && SITE_ARGS=(--site "$NETLIFY_SITE_ID")

# --- push -------------------------------------------------------------------
echo "Pushing web PostHog env to Netlify ..."
netlify env:set PUBLIC_POSTHOG_KEY     "$PUBLIC_POSTHOG_KEY"     ${SITE_ARGS[@]+"${SITE_ARGS[@]}"}
netlify env:set PUBLIC_POSTHOG_HOST    "$PUBLIC_POSTHOG_HOST"    ${SITE_ARGS[@]+"${SITE_ARGS[@]}"}
netlify env:set PUBLIC_POSTHOG_UI_HOST "$PUBLIC_POSTHOG_UI_HOST" ${SITE_ARGS[@]+"${SITE_ARGS[@]}"}

# --- readout ----------------------------------------------------------------
echo
echo "Set on Netlify:"
echo "  PUBLIC_POSTHOG_KEY     = (hidden)"
echo "  PUBLIC_POSTHOG_HOST    = $PUBLIC_POSTHOG_HOST"
echo "  PUBLIC_POSTHOG_UI_HOST = $PUBLIC_POSTHOG_UI_HOST"
echo "Trigger a redeploy for the new values to take effect."
