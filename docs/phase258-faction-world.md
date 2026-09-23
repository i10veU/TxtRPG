# Phase 258 — 세력 세계 압력 시뮬레이션 통합

## 목적

기존 `faction-world.js`는 브라우저에 로드되어 있었지만 실제 Worker 게임 루프에서 호출되지 않았다. 이 상태에서는 Worker와 메인 스레드 fallback의 세력 관계 계산 결과가 달라질 수 있다.

## 수정

첫째, 기본 상태에 `factionSimulationDay`와 `factionConflict` 상태를 명시한다.

둘째, 메인 스레드 fallback과 Worker가 NPC 시뮬레이션 직후 동일한 `simulateFactionWorld`를 호출한다.

셋째, 세력 세계 계산은 하루에 한 번만 수행한다. 같은 날짜에 여러 플레이어 행동이 발생해도 관계가 반복적으로 변하지 않는다.

넷째, 세력 두 곳 이상이 -40 이하이고 긴장이 55 이상이면 `factionConflict`를 활성화하고 시스템 로그 이벤트를 생성한다.

## 검증

`tests/phase258-faction-world.js`에서 하루 중 중복 실행 방지, 초기 관계 드리프트, 세력 충돌 이벤트를 검증한다.

기존 Chromium smoke test는 Worker가 실제 실행되는 브라우저 환경에서 `factionSimulationDay`가 갱신되는지도 확인한다.
