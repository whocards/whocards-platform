#!/bin/sh
# New worktree: reuse the main checkout's .env and install deps. Refuses a non-local DB_URL.
set -e
main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
[ -f .env ] || cp "$main/.env" .env
grep '^DB_URL=' .env | tail -n 1 | grep -qE '^DB_URL=postgres(ql)?://[^@]*@(localhost|127\.0\.0\.1)[:/]' || {
  echo "worktree setup: .env DB_URL is not a local database; refusing (prod lives in .env.prod)" >&2
  exit 1
}
pnpm install --frozen-lockfile
