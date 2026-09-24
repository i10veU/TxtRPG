# Phase 277 — Worker/fallback reset parity

## 목적

새 게임으로 초기화할 때 Worker와 메인 스레드 fallback이 지역 경제와 NPC 관계망을 동일하게 준비하도록 보장한다.

## 구현

- Worker `RESET` 경로에서 지역 경제를 초기화한다.
- Worker `RESET`과 메인 스레드 fallback `reset` 경로에서 NPC 관계망을 초기화한다.
- 기존 조직·목표·사건 초기화 순서는 유지한다.

## 검증

- `node tests/phase277-reset-parity.js`
- `node tests/phase259-worker-faction-parity.js`
- `node tests/phase276-regional-goal-causality.js`
- `node --check web/game.js`
- `node --check web/worker/game-worker.js`
- `git diff --check`

브라우저 smoke test는 reset 초기화 함수의 단위/VM parity 검증으로 대체했다.
