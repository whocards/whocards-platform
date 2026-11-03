#!/bin/sh
# New worktree: reuse the main checkout's .env and install deps. Refuses a non-local DB_URL.
set -e
main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
[ -f .env ] || cp "$main/.env" .env
# The effective value: an exported DB_URL beats .env, and the last line in .env wins.
url=${DB_URL:-$(grep '^DB_URL=' .env | tail -n 1 | cut -d= -f2-)}
case $url in
  *,* | *host=* | *hostaddr=*) ok= ;;
  *) ok=$(printf '%s' "$url" | grep -E '^postgres(ql)?://[^@/]*@(localhost|127\.0\.0\.1)(:[0-9]+)?/' || true) ;;
esac
[ -n "$ok" ] || {
  echo "worktree setup: DB_URL is not a local database; refusing (prod lives in .env.prod)" >&2
  exit 1
}
pnpm install --frozen-lockfile
