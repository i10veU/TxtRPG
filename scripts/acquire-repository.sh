#!/usr/bin/env bash
# Obtain a complete, SHA-verified TxtRPG working tree without GitHub Actions.
set -Eeuo pipefail
REPO_URL='https://github.com/i10veU/TxtRPG.git'
HEAD_REF='policy/independent-commit-verification'
HEAD_SHA="${EXPECTED_HEAD_SHA:?Set EXPECTED_HEAD_SHA to the exact PR head commit}"
BASE_REF='feature/v2-core'
BASE_SHA="${EXPECTED_BASE_SHA:?Set EXPECTED_BASE_SHA to the exact target branch commit}"
DEST="${1:-$PWD/TxtRPG-independent-qa}"
if [[ -e "$DEST" ]]; then echo "Refusing existing path: $DEST" >&2; exit 2; fi
command -v git >/dev/null || { echo 'git is required' >&2; exit 2; }
# Never interpret network or authentication failures as successful acquisition.
if ! git clone --no-checkout --filter=blob:none --branch "$HEAD_REF" --single-branch "$REPO_URL" "$DEST"; then
  echo 'GitHub clone failed; no verified repository was acquired.' >&2
  exit 3
fi
cd "$DEST"
# Fetch the base separately to verify the exact source baseline.
git fetch --no-tags origin "$BASE_REF"
git cat-file -e "$HEAD_SHA^{commit}"
git cat-file -e "$BASE_SHA^{commit}"
git checkout --detach "$HEAD_SHA"
[[ "$(git rev-parse HEAD)" == "$HEAD_SHA" ]] || { echo 'Head SHA mismatch' >&2; exit 4; }
[[ "$(git rev-parse FETCH_HEAD)" == "$BASE_SHA" ]] || { echo 'Base SHA mismatch: base moved, re-review required' >&2; exit 4; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Dirty working tree' >&2; exit 4; }
printf 'Verified repository checkout: %s\nHEAD: %s\nBASE: %s\nTREE: %s\n' "$PWD" "$HEAD_SHA" "$BASE_SHA" "$(git rev-parse 'HEAD^{tree}')"
printf 'Next: BASE_SHA=%s bash scripts/independent-verify.sh\n' "$BASE_SHA"
