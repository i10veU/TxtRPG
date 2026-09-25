# Phase 292 — world continuity and life-boundary model

## 목적

`world`, `life`, `timeline`, `history`, `knowledge` 경계를 구현 전에 명시적으로 모델링하고, 사망 이후 연속성 결정이 재로드에서 재추첨되지 않도록 저장 가능한 결정 구조를 추가한다.

## 구현

- `world.continuity` 스키마를 추가했다.
  - `identity`: world/universe/lineage 및 명시적 world-connection 경계
  - `life`: 현재 생의 식별자, 상태(active/ended), 시작·종료 절대 시간, 종료 사유
  - `timeline`: world 시작점과 continuity seed/결정 값
  - `history`: life 이벤트와 지속 consequence 기록
  - `knowledge`: direct/historical/social/indirect/forgotten 흔적 레코드
  - `nextLife`: 사망 이후 continuity outcome(같은 세계/같은 세계의 미래/다른 세계) 결정 슬롯
- continuity 결정은 deterministic hash로 1회 결정되며, 이미 결정된 값은 재요청해도 재추첨하지 않는다.
- 플레이어 HP가 0이 되는 기존 `lost` 경계에서 생 종료(`life-ended`)와 continuity 결정을 기록한다.
- 이 단계에서는 멀티월드 콘텐츠/이동/상호작용은 구현하지 않고, 미래 확장을 위한 데이터 경계만 도입했다.

## 검증

- `node tests/phase292-world-continuity-model.js`
- `node tests/phase284-game-loop.js`
- `node tests/phase285-terminal-persistence.js`
