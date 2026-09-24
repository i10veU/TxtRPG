# Phase 284 — game loop tutorial and end states

## 목적

첫 세션에서 플레이어가 기존 사건·목표 루프를 발견할 수 있도록 최소 안내 흐름을 제공하고, 플레이 가능한 상태와 결말 상태를 명시한다.

## 구현

- `world.tutorial`을 정규화해 시장 조사 → 기록관 이동 → 목표/사건 확인의 진행 단계를 저장한다.
- 첫 플레이어 사건 연쇄가 완료되면 `world.gameStatus`를 `won`으로 전환한다.
- HP가 0이 되면 `lost`로 전환하고, 결말 이후 입력은 시간을 진행하지 않는다.
- Worker와 fallback이 같은 `Core.resolveAction` 및 campaign progress 경로를 사용한다.
- 기존 IndexedDB/localStorage 저장 경계는 새 필드를 기존 정규화 경로로 보존한다.

## 검증

- `node tests/phase284-game-loop.js`
- `node tests/phase280-quest-aftermath.js`
- `node tests/phase281-fallback-quest-parity.js`
- `node tests/phase282-storage-normalization.js`
- `node tests/phase283-storage-save-normalization.js`
- `find web tests -type f -name '*.js' -print0 | xargs -0 -n1 node --check`
- `git diff --check`

브라우저 smoke test는 로컬 Playwright 패키지가 없어 실행하지 못했다. 기존 브라우저 검증 환경에서 Phase 284를 재실행해야 한다.
