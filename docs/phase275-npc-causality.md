# Phase 275 — NPC 충돌 후속 사건

## 목적

해결된 `npc-dispute` 사건이 다음 날에도 인물 관계와 조직 목표에 영향을 주도록 사건 인과망을 확장한다.

## 구현

- 해결 기록이 있는 다음 날 `npc-dispute-aftershock` 후속 사건을 데이터 정의로 생성한다.
- 세린·마르타의 기록 대조, 마라·오렐의 작업 조정, 이브라힘의 현장 중재 선택을 기존 NPC 관계와 조직에 연결한다.
- 각 선택은 기존 `applyGoalPressure` 경로를 사용해 관련 조직 압력을 `[-2, 2]`로 제한하고 소속 NPC 목표를 즉시 재검토한다.
- 기존 사건 기록 중복 방지와 다른 후속 사건 동작은 유지한다.

## 검증

- `node tests/phase275-npc-causality.js`
- `node --check web/core/case-causality.js`
- `git diff --check`
