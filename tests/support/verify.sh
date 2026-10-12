#!/usr/bin/env bash
# One command for what CI checks (docs/v2/DEVELOPMENT_ACCELERATION.md §3). Run from anywhere in the repository.
#   tests/support/verify.sh quick            syntax, V2 Node (parallel), V1 Node                       ~25 s
#   tests/support/verify.sh browser [filter] V1 browser smoke + V2 browser specs (only those matching filter)  ~3 min
#   tests/support/verify.sh full             quick, then browser (the default)
# The V1 commands are read from the workflow, so this cannot drift from CI. The V1 steps themselves are not changed
# (DEVELOPMENT_RULES §17). Starts the static server on 4173 when nothing answers there, and stops it afterwards.
# PW_CHROMIUM_PATH: a Chromium for Playwright to launch; found under /opt/pw-browsers when unset and present there.
set -u
cd "$(dirname "$0")/../.." || exit 2
mode=${1:-full}
filter=${2:-}
workflow=.github/workflows/phase251-check.yml
status=0
summary=()

note() { summary+=("$1"); echo "== $1"; }

quick() {
  if find web -name '*.js' -print0 | xargs -0 -n1 node --check; then note "syntax: ok"; else note "syntax: FAIL"; status=1; fi
  local out
  out=$(node tests/v2/run.js 2>&1); local rc=$?
  echo "$out" | grep -E "^FAIL" || true
  note "$(echo "$out" | tail -1)"
  [ $rc -eq 0 ] || status=1
  local pass=0 fail=0 cmd
  while read -r cmd; do
    if $cmd >/dev/null 2>&1; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL $cmd"; fi
  done < <(grep -oE 'node tests/phase[0-9a-z-]+\.js' "$workflow")
  note "V1 Node: $pass passed, $fail failed"
  [ $fail -eq 0 ] || status=1
}

browser() {
  if [ -z "${PW_CHROMIUM_PATH:-}" ]; then
    local c
    c=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | tail -1)
    [ -n "$c" ] && export PW_CHROMIUM_PATH="$c"
  fi
  local server=""
  if ! curl -fsS -o /dev/null http://127.0.0.1:4173/ 2>/dev/null; then
    python3 tests/support/static-server.py 4173 web >/dev/null 2>&1 &
    server=$!
    for _ in $(seq 1 50); do curl -fsS -o /dev/null http://127.0.0.1:4173/ 2>/dev/null && break; sleep 0.2; done
  fi
  local tmp out
  tmp=$(mktemp -d)
  # V1 smoke exactly as its CI step runs it (--retries=2); a config only to point at a local Chromium
  if [ -z "$filter" ]; then
    if [ -n "${PW_CHROMIUM_PATH:-}" ]; then
      printf 'module.exports = { testDir: %s, use: { launchOptions: { executablePath: %s } } };\n' \
        "$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$PWD/tests")" \
        "$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$PW_CHROMIUM_PATH")" > "$tmp/v1.config.js"
      out=$(npx playwright test tests/phase255-browser.spec.js --retries=2 --reporter=line --config "$tmp/v1.config.js" 2>&1)
    else
      out=$(npx playwright test tests/phase255-browser.spec.js --retries=2 --reporter=line 2>&1)
    fi
    [ $? -eq 0 ] || status=1
    note "V1 browser: $(echo "$out" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -E '^ +[0-9]+ (passed|failed|flaky)' | tr -s ' ' | paste -sd, -)"
  fi
  out=$(npx playwright test --config tests/v2-browser.config.js ${filter:+"$filter"} 2>&1)
  local rc=$?
  echo "$out" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -vE '^\[[0-9]+/[0-9]+\]' | grep -vE '^\s*$' | tail -40 | grep -E '✘|Error|failed|›' | head -40 || true
  note "V2 browser${filter:+ ($filter)}: $(echo "$out" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -E '^ +[0-9]+ (passed|failed|flaky|skipped)' | tr -s ' ' | paste -sd, -)"
  [ $rc -eq 0 ] || status=1
  rm -rf "$tmp"
  [ -n "$server" ] && kill "$server" 2>/dev/null
}

case "$mode" in
  quick) quick ;;
  browser) browser ;;
  full) quick; browser ;;
  *) echo "usage: $0 [quick|browser [filter]|full]"; exit 2 ;;
esac

echo
echo "summary ($(git rev-parse --short HEAD 2>/dev/null)$(git diff --quiet 2>/dev/null || echo ', with uncommitted changes')):"
printf '  %s\n' "${summary[@]}"
[ $status -eq 0 ] && echo "verify: ok" || echo "verify: FAILED"
exit $status
