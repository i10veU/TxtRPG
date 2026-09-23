# Phase 259 — Worker 세력 세계 시뮬레이션 동기화

## 문제

세력 세계 압력 계산은 `npc-simulation.js`에서 선택적으로 `simulateFactionWorld`를 호출하지만 Worker에는 `faction-world.js`가 로드되지 않았다. 브라우저 fallback에서는 계산되지만 실제 기본 Worker 실행에서는 동일 상태 변화가 생략될 수 있었다.

## 수정

Worker의 `importScripts`에 `core/faction-world.js`를 추가했다. 따라서 NPC 시뮬레이션의 동일한 호출 경로가 Worker에서도 세력 관계와 충돌 사건을 계산한다.

## 검증

`tests/phase259-worker-faction-parity.js`는 실제 Worker 스크립트를 Node VM에 로드하고 INIT → ACTION 흐름을 실행한다.

세력 관계가 충돌 조건에 있고 긴장이 높은 상태에서 `휴식`을 실행하면 Worker 내부에서 `factionSimulationDay`가 갱신되고 `factionConflict`가 활성화되며 시스템 로그가 생성되는지 확인한다.

기존 Chromium browser smoke test에도 Worker 경로의 `factionSimulationDay`를 확인한다.
