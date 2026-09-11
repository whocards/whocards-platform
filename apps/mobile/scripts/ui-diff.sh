#!/usr/bin/env bash
# Before/after UI comparison for dependency upgrades (#295).
#
# An upgrade (Expo SDK, React Native, NativeWind…) is only safe if the app still
# renders the same pixels. This captures the store-screenshot flow on one ref,
# captures it again on another, and compares the two frame-for-frame.
#
#   pnpm -F mobile ui-diff capture <label>
#   pnpm -F mobile ui-diff compare <labelA> <labelB>
#
# THE BASELINE MUST BE CAPTURED ON THE PRE-UPGRADE REF. A baseline captured on
# the upgrade branch only describes the upgrade's own output and proves nothing.
# So the order is always: check out the pre-upgrade ref → install → build →
# `capture before` → check out the upgrade branch → install → build →
# `capture after` → `compare before after`.
#
# This script does not switch branches, install, or rebuild. Build and install
# each ref explicitly before its capture; separate worktrees keep their native
# projects and dependencies isolated.
#
# Captures live in apps/mobile/.ui-diff/<label>/ (gitignored), NOT in the tracked
# tree, so switching branches between the two captures can't clobber the first.
#
# Comparison is `shasum -a 256` per frame — identical hashes are pixel-identical
# output, no dependencies needed. If ImageMagick's `compare` happens to be
# installed, a diff PNG is written per differing frame too; it is optional and
# its absence is not an error.
#
# Requires Maestro, and Maestro requires a valid JAVA_HOME (a JDK) — if it dies
# with "JAVA_HOME is set to an invalid directory", run
# `export JAVA_HOME="$(/usr/libexec/java_home)"` first. See .maestro/README.md.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_ROOT=.ui-diff

usage() {
  cat >&2 <<'USAGE'
usage:
  pnpm -F mobile ui-diff capture <label>            capture the frames for one ref
  pnpm -F mobile ui-diff compare <labelA> <labelB>  compare two captured labels

  DEVICES="<device-id>:<name> ..." is passed through to the capture script;
  unset, it captures the default 6.5" iOS simulator set.
USAGE
  exit 2
}

# Relative paths (device/frame.png) of every capture under a label, sorted.
frames_of() {
  (cd "$OUT_ROOT/$1" && find . -name '*.png' | sed 's|^\./||' | sort)
}

# A label names a directory under .ui-diff and is interpolated into `rm -rf`, so
# it has to be an opaque name and nothing else. `../<other>` would resolve out of
# .ui-diff and delete somewhere real — a slip while pasting a ref name is enough,
# no attacker required.
validate_label() {
  local label="$1"
  if [[ ! "$label" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "✗ '$label' is not a usable label — use letters, numbers, '.', '_' and '-' only," >&2
    echo "  starting with a letter or number (e.g. 'before', 'rn-0.86.3')" >&2
    exit 2
  fi
}

require_label() {
  local label="$1"
  validate_label "$label"
  if [[ ! -d "$OUT_ROOT/$label" ]]; then
    echo "✗ no capture labelled '$label' — run 'pnpm -F mobile ui-diff capture $label' first" >&2
    echo "  captured so far: $(ls "$OUT_ROOT" 2>/dev/null | tr '\n' ' ')" >&2
    exit 1
  fi
  if [[ -z "$(frames_of "$label")" ]]; then
    echo "✗ capture '$label' has no frames — it did not complete; re-capture it" >&2
    exit 1
  fi
}

capture() {
  local label="${1:-}"
  [[ -n "$label" ]] || usage
  validate_label "$label"

  command -v maestro >/dev/null 2>&1 || {
    echo "✗ maestro is not on PATH — install it with:" >&2
    echo '    curl -fsSL "https://get.maestro.mobile.dev" | bash' >&2
    echo '  and make sure JAVA_HOME points at a JDK (export JAVA_HOME="$(/usr/libexec/java_home)").' >&2
    exit 1
  }

  local dest="$OUT_ROOT/$label"
  rm -rf "$dest"
  mkdir -p "$dest"

  # Everything the capture script writes from here on is this run's output. Its
  # own device resolution and App Store size checks are left to it — this only
  # needs to know which files came out, which a timestamp marker answers without
  # re-implementing any of that.
  local marker="$dest/.started"
  mkdir -p store-assets # so the find below has a tree to walk on a clean checkout
  : >"$marker"

  echo "▶ capturing '$label' via scripts/capture-screenshots.sh"
  bash scripts/capture-screenshots.sh

  local count=0 png rel
  while IFS= read -r png; do
    rel="${png#store-assets/}"
    mkdir -p "$dest/$(dirname "$rel")"
    cp "$png" "$dest/$rel"
    count=$((count + 1))
  done < <(find store-assets -name '*.png' -newer "$marker" | sort)
  rm -f "$marker"

  if [[ "$count" == 0 ]]; then
    echo "✗ the flow produced no frames — nothing was captured for '$label'" >&2
    echo "  (a Maestro run that fails mid-flow can still exit 0 on some commands; check its output above)" >&2
    rm -rf "$dest"
    exit 1
  fi

  echo "✓ $count frame(s) → $dest/"
  echo "  next: check out the other ref, install + rebuild, then 'pnpm -F mobile ui-diff capture <other-label>'"
}

# Dimensions of a PNG, via macOS's built-in sips. Only used to describe a diff,
# so a file sips can't read is reported as unknown rather than failing the run.
dims_of() {
  local dims
  dims="$(sips -g pixelWidth -g pixelHeight "$1" 2>/dev/null \
    | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{if (w && h) print w"x"h}')"
  echo "${dims:-unknown size}"
}

compare_labels() {
  local a="${1:-}" b="${2:-}"
  [[ -n "$a" && -n "$b" ]] || usage
  require_label "$a"
  require_label "$b"

  # Comparing different frame sets would silently compare nothing: report it.
  local only_a only_b
  only_a="$(comm -23 <(frames_of "$a") <(frames_of "$b"))"
  only_b="$(comm -13 <(frames_of "$a") <(frames_of "$b"))"
  if [[ -n "$only_a$only_b" ]]; then
    echo "✗ '$a' and '$b' captured different frame sets — they are not comparable" >&2
    [[ -n "$only_a" ]] && echo "  only in $a: $(echo "$only_a" | tr '\n' ' ')" >&2
    [[ -n "$only_b" ]] && echo "  only in $b: $(echo "$only_b" | tr '\n' ' ')" >&2
    echo "  re-capture both against the same DEVICES and the same flow." >&2
    exit 1
  fi

  # ImageMagick is a bonus, not a requirement: without it the hash comparison
  # still answers same/different, it just can't show WHERE.
  local magick=''
  if command -v compare >/dev/null 2>&1; then
    magick=compare
  elif command -v magick >/dev/null 2>&1; then
    magick='magick compare'
  fi

  local diff_dir="$OUT_ROOT/diff-$a-vs-$b"
  rm -rf "$diff_dir"

  local differed=0 total=0 rel sum_a sum_b
  while IFS= read -r rel; do
    total=$((total + 1))
    sum_a="$(shasum -a 256 "$OUT_ROOT/$a/$rel" | cut -d' ' -f1)"
    sum_b="$(shasum -a 256 "$OUT_ROOT/$b/$rel" | cut -d' ' -f1)"
    if [[ "$sum_a" == "$sum_b" ]]; then
      echo "  ✓ PASS $rel"
      continue
    fi
    differed=$((differed + 1))
    echo "  ✗ DIFF $rel  ($a $(dims_of "$OUT_ROOT/$a/$rel") → $b $(dims_of "$OUT_ROOT/$b/$rel"))"
    if [[ -n "$magick" ]]; then
      mkdir -p "$diff_dir/$(dirname "$rel")"
      # `compare` exits non-zero when images differ — which is the whole point here.
      $magick "$OUT_ROOT/$a/$rel" "$OUT_ROOT/$b/$rel" "$diff_dir/$rel" || true
      echo "         diff → $diff_dir/$rel"
    fi
  done < <(frames_of "$a")

  if [[ "$differed" == 0 ]]; then
    echo "✓ $total/$total frames pixel-identical between '$a' and '$b'"
    return 0
  fi

  echo "✗ $differed of $total frame(s) differ between '$a' and '$b'" >&2
  if [[ -z "$magick" ]]; then
    echo "  (ImageMagick isn't installed, so no diff images were written — 'brew install imagemagick' to get them)" >&2
  fi
  return 1
}

case "${1:-}" in
capture)
  shift
  capture "$@"
  ;;
compare)
  shift
  compare_labels "$@"
  ;;
*) usage ;;
esac
