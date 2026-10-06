#!/usr/bin/env bash
# Update from the shared BYOS source; never patch generated output.
# Usage: scripts/sync-byos.sh [commit-or-ref] (default: main)
# BYOS_REPO may point at a local clone for an offline/source integration check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="${1:-main}"
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
# Locked tooling lives in BYOS. The consumer needs no npm build or GitHub access at runtime.
(cd "$WORK/byos" && npm ci --ignore-scripts --no-audit --no-fund)
node "$WORK/byos/scripts/vendor.mjs" --source "$WORK/byos" --ref "$REVISION" \
  --mode bundle --out "$ROOT/vendor/byos" --packages core,providers --engine omit
