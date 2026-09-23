# Phase 259 — Worker 세력 세계 시뮬레이션 동기화

## 문제

세력 세계 압력 계산기는 브라우저 메인 컨텍스트에서 로드되고 NPC 시뮬레이션이 존재할 때 호출되지만, Worker가 해당 스크립트를 import하지 않으면 실제 기본 실행 경로인 Worker에서는 세력 계산이 생략된다.

## 수정

Worker의 `importScripts`에 `core/faction-world.js`를 추가한다. 그러면 NPC 시뮬레이션 내부의 `simulateFactionWorld` 호출이 Worker에서도 동일하게 작동한다.

## 검증

`tests/phase259-worker-faction-parity.js`는 실제 Worker 스크립트를 Node VM으로 로드하고 INIT → ACTION 흐름을 실행한다.

두 세력이 -40 이하이고 긴장이 55 이상인 상태에서 `휴식`을 수행하면 Worker 내부에서 `factionSimulationDay`가 0으로 갱신되고 `factionConflict`가 활성화되며 시스템 로그가 남는지 확인한다.
