#!/usr/bin/env bash
# Run on an internet-connected machine, then transfer the bundle into the QA sandbox.
set -Eeuo pipefail
REMOTE="${TXTRPG_REMOTE:-https://github.com/i10veU/TxtRPG.git}"
OUT="${1:-$PWD/TxtRPG.bundle}"
[[ ! -e "$OUT" ]] || { echo "Output exists: $OUT" >&2; exit 2; }
OUT_DIR=$(dirname "$OUT")
mkdir -p "$OUT_DIR"
OUT="$(cd "$OUT_DIR" && pwd)/$(basename "$OUT")"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git clone --quiet --mirror "$REMOTE" "$TMP/repository.git"
git -C "$TMP/repository.git" show-ref --verify --quiet refs/heads/feature/v2-core || { echo 'Missing base branch' >&2; exit 3; }
git -C "$TMP/repository.git" show-ref --verify --quiet refs/heads/policy/independent-commit-verification || { echo 'Missing PR branch' >&2; exit 3; }
git -C "$TMP/repository.git" bundle create "$OUT" --all
git bundle verify "$OUT"
printf 'Bundle SHA256: '
sha256sum "$OUT"
printf 'Base: '
git -C "$TMP/repository.git" rev-parse refs/heads/feature/v2-core
printf 'PR head: '
git -C "$TMP/repository.git" rev-parse refs/heads/policy/independent-commit-verification
echo "Transfer $OUT to the independent QA environment; do not modify it after hashing."
