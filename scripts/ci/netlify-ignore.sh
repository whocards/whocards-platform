#!/bin/sh
# Netlify `ignore` command: exit 0 skips the build, anything else builds. Usage: netlify-ignore.sh <package>
# No previous build, or a retry / env-change redeploy of the same commit: always build.
[ -n "$CACHED_COMMIT_REF" ] && [ "$CACHED_COMMIT_REF" != "$COMMIT_REF" ] || exit 1
# Runs before install, so turbo comes from npx; keep the version in step with the root package.json.
exec npx -y turbo@2.11.10 query affected --packages "$1" --base "$CACHED_COMMIT_REF" --head "$COMMIT_REF" --exit-code
