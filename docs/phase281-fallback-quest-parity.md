# Phase 281 — fallback reset 목표 연쇄 parity

## 목적

Worker를 사용할 수 없는 로컬 실행에서도 초기화 직후 플레이어 사건 목표 연쇄가 Worker 경로와 동일하게 준비되도록 보장한다.

## 구현

- `AnonymousRPGApp.reset()`의 메인 스레드 fallback 경로가 사건 데이터 초기화 직후 `updatePlayerQuests()`를 호출한다.
- Worker/fallback reset parity 검증에 플레이어 목표 체인의 식별자와 단계 상태를 포함한다.
- 실제 앱 fallback reset을 VM으로 실행해 첫 행동 전 목표 체인 생성과 저장을 검증한다.

## 검증

- `node tests/phase281-fallback-quest-parity.js`
- `node tests/phase277-reset-parity.js`
- `node tests/phase280-quest-aftermath.js`
- 변경 JavaScript `node --check` 및 `git diff --check`
