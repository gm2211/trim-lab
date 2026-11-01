#!/usr/bin/env bash
# Update from the shared BYOS source; never patch generated output.
# Usage: scripts/sync-byos.sh [full-40-hex-commit-sha]
# The argument defaults to the commit already recorded in vendor/byos/REVISION; a branch or tag name is
# refused, so a sync is always pinned and reproducible.
# This script runs `npm ci` on the BYOS checkout (third-party code), so run it under the sandbox:
#   ~/.claude/bin/safe-run.sh -C <worktree> --net -- scripts/sync-byos.sh <full-sha>
# BYOS_REPO may point at a local clone for an offline/source integration check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECORDED="$(sed -n 's/^commit=//p' "$ROOT/vendor/byos/REVISION" 2>/dev/null | head -n1)"
REF="${1:-$RECORDED}"
if [[ ! "$REF" =~ ^[0-9a-f]{40}$ ]]; then
  echo "sync-byos: pass the full 40-hex commit SHA to pin (got '${REF:-nothing}'); branch names are refused." >&2
  exit 1
fi
REPO="${BYOS_REPO:-https://github.com/gm2211/byos.git}"
# Use credential helpers; URL userinfo, query data, and fragments must never enter process arguments.
if [[ "$REPO" =~ ^[A-Za-z][A-Za-z0-9+.-]*:// ]]; then
  authority="${REPO#*://}"
  authority="${authority%%/*}"
  if [[ "$authority" == *@* || "$REPO" == *\?* || "$REPO" == *\#* ]]; then
    echo "sync-byos: remove userinfo, query data, or fragments from repository URLs; use a credential helper." >&2
    exit 1
  fi
fi
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone --quiet --no-checkout "$REPO" "$WORK/byos"
git -C "$WORK/byos" fetch --quiet origin "$REF"
git -C "$WORK/byos" checkout --quiet --detach FETCH_HEAD
REVISION="$(git -C "$WORK/byos" rev-parse HEAD)"
if [[ "$REVISION" != "$REF" ]]; then
  echo "sync-byos: fetched $REVISION but pinned $REF." >&2
  exit 1
fi
# Locked tooling lives in BYOS. The consumer needs no npm build or GitHub access at runtime.
(cd "$WORK/byos" && npm ci --ignore-scripts --no-audit --no-fund)
node "$WORK/byos/scripts/vendor.mjs" --source "$WORK/byos" --ref "$REVISION" \
  --mode bundle --out "$ROOT/vendor/byos" --packages core,providers \
  --revision "$ROOT/vendor/byos/REVISION" --engine omit
