# 구독핀 API — Claude Code 로컬 연동

이 문서는 [구독핀 API 연동 문서](https://api.gudokpin.com/docs.md)만을 기준으로 Claude Code를 설정한다. 기존 GitHub Actions/Copilot 자동화는 변경하지 않는다.

## 규칙

- Anthropic 호환 Base URL: `https://api.gudokpin.com` — **끝에 `/v1`을 붙이지 않는다.** Claude Code SDK가 `/v1/messages` 경로를 추가한다.
- 키: 구독핀에서 발급한 `csk_` 키만 사용한다. OpenAI `sk-` 키는 사용하지 않는다.
- 모델은 `GET https://api.gudokpin.com/v1/models` 응답에 실제로 존재하는 ID만 사용한다.
- `stream: true`는 지원된다.
- 키를 저장소 파일, 커밋, 이슈, PR, 로그 또는 채팅에 넣지 않는다.

## 1. API 모델 카탈로그 확인

카탈로그는 변경될 수 있으므로 아래 목록을 고정 설정으로 간주하지 말고, 실행 전 현재 응답을 확인한다.

```bash
curl -fsS https://api.gudokpin.com/v1/models
```

2026-10-11 확인 응답에서 발견된 Claude 모델 ID:
- `claude-sonnet-5`
- `claude-sonnet-5-5`
- `claude-opus-5`
- `claude-opus-5-5`
- `claude-fable-5`
- `claude-fable-5.1`

기본값은 문서 예시에 있는 `claude-sonnet-5`다. 실행 시 모델이 카탈로그에 있는지 다시 확인한다.

## 2. macOS / Linux

저장소 루트에서 실행한다. 키는 현재 셸 환경에만 등록한다.

```bash
export GUDOKPIN_API_KEY='csk_여기에_실제_키'
# 선택: 현재 카탈로그에 있는 다른 Claude 모델 ID
export GUDOKPIN_CLAUDE_MODEL='claude-sonnet-5'

bash scripts/claude-gudokpin.sh
```

셸에 키를 직접 입력하면 셸 기록에 남을 수 있다. 가능한 경우 키를 안전하게 관리하는 로컬 비밀 저장소나 셸 외부에서 설정한 환경 변수를 사용한다. 스크립트는 키가 `csk_`로 시작하는지 확인하고, 공개 모델 카탈로그에서 선택한 모델의 존재를 검증한 뒤 Claude Code를 실행한다. 실제 키 값은 출력하지 않는다.

## 3. Windows PowerShell

Windows의 **환경 변수 설정 화면**에서 사용자 변수 `GUDOKPIN_API_KEY`에 구독핀 `csk_` 키를 등록한다. 키를 PowerShell 명령문에 직접 넣지 않는다. 설정 후 새 PowerShell 세션을 연다.

```powershell
$env:ANTHROPIC_BASE_URL = 'https://api.gudokpin.com'
$env:ANTHROPIC_AUTH_TOKEN = [Environment]::GetEnvironmentVariable('GUDOKPIN_API_KEY', 'User')
$env:ANTHROPIC_MODEL = 'claude-sonnet-5'
if (-not $env:ANTHROPIC_AUTH_TOKEN) { throw 'GUDOKPIN_API_KEY 사용자 환경 변수가 없습니다.' }
if (-not $env:ANTHROPIC_AUTH_TOKEN.StartsWith('csk_')) { throw '구독핀 csk_ 키만 사용할 수 있습니다.' }
claude
```

먼저 현재 카탈로그를 확인한다.

```powershell
(Invoke-RestMethod 'https://api.gudokpin.com/v1/models').data.id
```

모델 ID가 응답에 포함된 경우에만 사용한다.

## 4. 연결 확인 및 문제 해결

Claude Code를 실행한 뒤 간단한 요청으로 응답을 확인한다. Claude Code는 `POST /v1/messages`를 사용한다. 이때 `ANTHROPIC_BASE_URL`에는 `/v1`을 붙이지 않는다.

- `401`: 키가 누락·오류·폐기되었는지 확인한다.
- `402`: 구독핀 잔액을 확인한다.
- `403`: 고객 API 키인지 확인한다.
- `404` / `model_not_found`: 모델 ID가 현재 `/v1/models` 응답에 있는지 확인한다.
- 경로 오류: `ANTHROPIC_BASE_URL=https://api.gudokpin.com`인지 확인하고 끝의 `/v1`을 제거한다.

모델 목록 조회가 성공해도 인증된 Messages 요청까지 성공했다는 뜻은 아니다. 실제 인증 연결은 유효한 키로 Claude Code에서 요청해 확인한다.

## 5. 보안 및 TxtRPG 개발 절차

- `GUDOKPIN_API_KEY`는 로컬 환경 변수로만 관리한다. GitHub Actions Secret에 넣을 경우에도 이 로컬 Claude Code 연동과 별개로 취급한다.
- 키를 `.env`, `.claude/settings.json`, 소스 파일, 테스트 fixture 또는 문서에 저장하지 않는다.
- API 키를 명령행 인자나 URL에 넣지 않는다.
- 기존 V2 개발 계약, 테스트, 브라우저 검증 및 PR 검토 절차를 그대로 따른다.
- 이 연동은 게임 런타임에 API 호출을 추가하지 않는다. TxtRPG는 계속 오프라인 우선으로 유지된다.
- 기존 Copilot/GitHub Actions 워크플로를 수정하거나 대체하지 않는다.

## 공식 문서

- [구독핀 API 연동 문서](https://api.gudokpin.com/docs.md)
- [실시간 모델 카탈로그](https://api.gudokpin.com/v1/models)
