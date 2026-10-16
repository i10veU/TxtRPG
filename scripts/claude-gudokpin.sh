#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GUDOKPIN_API_KEY:-}" ]]; then
  echo "GUDOKPIN_API_KEY 환경 변수를 설정하세요. 키는 csk_로 시작해야 합니다." >&2
  exit 2
fi

case "$GUDOKPIN_API_KEY" in
  csk_*) ;;
  *)
    echo "잘못된 키 접두사입니다. 구독핀 csk_ 키만 사용할 수 있습니다." >&2
    exit 2
    ;;
esac

command -v curl >/dev/null 2>&1 || { echo "curl이 필요합니다." >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3이 필요합니다." >&2; exit 2; }
command -v claude >/dev/null 2>&1 || { echo "Claude Code CLI(claude)를 찾을 수 없습니다." >&2; exit 2; }

model="${GUDOKPIN_CLAUDE_MODEL:-claude-sonnet-5}"
models_json="$(curl --fail --silent --show-error https://api.gudokpin.com/v1/models)"

if ! printf '%s' "$models_json" | python3 -c '
import json
import sys

model_id = sys.argv[1]
try:
    payload = json.load(sys.stdin)
    available = {item["id"] for item in payload["data"]}
except (ValueError, KeyError, TypeError) as exc:
    print(f"모델 카탈로그 응답을 해석할 수 없습니다: {exc}", file=sys.stderr)
    raise SystemExit(2)

if model_id not in available:
    print(f"선택한 모델이 현재 카탈로그에 없습니다: {model_id}", file=sys.stderr)
    print("GET https://api.gudokpin.com/v1/models 응답의 모델 ID를 사용하세요.", file=sys.stderr)
    raise SystemExit(1)
' "$model"; then
  exit 1
fi

# Claude Code SDK가 /v1/messages 경로를 추가하므로 Base URL에는 /v1을 붙이지 않는다.
export ANTHROPIC_BASE_URL="https://api.gudokpin.com"
export ANTHROPIC_AUTH_TOKEN="$GUDOKPIN_API_KEY"
export ANTHROPIC_MODEL="$model"

exec claude "$@"
