#!/usr/bin/env bash
# Offline runner for the existing TxtRPG Actions gates; no GitHub Actions required.
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo 'Refusing to verify a dirty tracked working tree' >&2; exit 2
fi
HEAD_SHA=$(git rev-parse HEAD)
TREE_SHA=$(git rev-parse 'HEAD^{tree}')
BASE_SHA=${BASE_SHA:-unknown}
EVIDENCE_DIR=${EVIDENCE_DIR:-"/tmp/txtrpg-verify-${HEAD_SHA:0:12}-$(date -u +%Y%m%dT%H%M%SZ)"}
mkdir -p "$EVIDENCE_DIR/logs"
EVIDENCE_DIR=$(cd "$EVIDENCE_DIR" && pwd)
export HEAD_SHA TREE_SHA BASE_SHA EVIDENCE_DIR
printf 'head=%s tree=%s evidence=%s\n' "$HEAD_SHA" "$TREE_SHA" "$EVIDENCE_DIR"
: > "$EVIDENCE_DIR/steps.tsv"
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
export STARTED_AT
SERVER_PID=''
finish() {
  local code=$?
  trap - EXIT
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  export EXIT_CODE="$code" FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  python3 - <<'PY'
import hashlib, json, os, pathlib, platform
p=pathlib.Path(os.environ['EVIDENCE_DIR'])
steps=[]
for line in (p/'steps.tsv').read_text().splitlines():
    label,code,command,filename=line.split('\t',3)
    raw=(p/'logs'/filename).read_bytes()
    steps.append(dict(name=label,command=command,exit_code=int(code),log='logs/'+filename,sha256=hashlib.sha256(raw).hexdigest()))
manifest=dict(schema_version=1,head_sha=os.environ['HEAD_SHA'],tree_sha=os.environ['TREE_SHA'],base_sha=os.environ['BASE_SHA'],started_at=os.environ['STARTED_AT'],finished_at=os.environ['FINISHED_AT'],exit_code=int(os.environ['EXIT_CODE']),environment=dict(os=platform.platform(),python=platform.python_version()),steps=steps)
(p/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
PY
  echo "Evidence: $EVIDENCE_DIR/manifest.json (exit=$code)"
  exit "$code"
}
trap finish EXIT
run_step() {
  local label=$1 command=$2 filename=$3 code=0
  echo "RUN $label"
  bash -lc "$command" >"$EVIDENCE_DIR/logs/$filename" 2>&1 || code=$?
  printf '%s\t%s\t%s\t%s\n' "$label" "$code" "$command" "$filename" >> "$EVIDENCE_DIR/steps.tsv"
  tail -n 4 "$EVIDENCE_DIR/logs/$filename" || true
  if [[ "$code" -ne 0 ]]; then echo "FAIL $label (exit=$code)" >&2; return "$code"; fi
}
run_step node-version 'node --version' 01-node.log
run_step syntax "find web -name '*.js' -print0 | xargs -0 -r -n1 node --check" 02-syntax.log
run_step v2-node 'node tests/v2/run.js' 03-v2-node.log
run_step v1-node 'for f in tests/phase251-engineization.js tests/phase254-npc-tick.js tests/phase256-npc-routine-cadence.js tests/phase257-npc-event-trigger.js tests/phase257-faction-world.js tests/phase259-worker-faction-parity.js tests/phase260-economy.js tests/phase261-information.js tests/phase262-npc-goals.js tests/phase263-organizations.js tests/phase264-goal-dynamics.js tests/phase265-organization-relations.js tests/phase266-organization-events.js tests/phase267-case-consequences.js tests/phase268-economic-pressure.js tests/phase269-npc-relations.js tests/phase271-regional-economy-regression.js tests/phase271-case-causality.js; do node "$f" || exit; done' 04-v1-node.log
run_step browser-deps 'test -x node_modules/.bin/playwright && command -v python3 && command -v curl' 05-browser-deps.log
python3 tests/support/static-server.py 4173 web >"$EVIDENCE_DIR/logs/http.log" 2>&1 & SERVER_PID=$!
run_step server-ready 'for i in $(seq 1 50); do curl -fsS -o /dev/null http://127.0.0.1:4173/ && exit 0; sleep 0.2; done; exit 1' 06-server.log
run_step v1-browser 'node_modules/.bin/playwright test tests/phase255-browser.spec.js --retries=2 --reporter=line' 07-v1-browser.log
run_step v2-browser 'node_modules/.bin/playwright test --config tests/v2-browser.config.js' 08-v2-browser.log
if [[ "$(git rev-parse HEAD)" != "$HEAD_SHA" || "$(git rev-parse 'HEAD^{tree}')" != "$TREE_SHA" ]]; then
  echo 'Commit changed during validation' >&2; exit 3
fi
echo 'All local gates passed; independent QA and merge-tree verification still required.'
