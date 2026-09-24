# Phase 276 — 지역 사건과 장기 NPC 목표

## 목적

해결된 지역·경제 사건의 후속 선택이 조직 압력에 그치지 않고 NPC 개인 목표의 지속적인 진행으로 이어지도록 사건 인과망을 확장한다.

## 구현

- 곡물 창고·교역로 후속 사건 선택을 기존 `progressNPCGoal` 경로에 연결했다.
- 장기 공급 계약은 상인회·노동자 조합 소속 NPC의 시장·시설·화물 목표를 진행시킨다.
- 지역 생산자 직접 거래와 장부·공급 계약 조사는 농촌·기록관·부두 관련 목표를 진행시킨다.
- 공통 사건 데이터와 코어 경로를 사용해 Worker와 fallback에서 동일한 결과를 유지한다.

## 검증

- `node tests/phase276-regional-goal-causality.js`
- `node tests/phase275-npc-causality.js`
- `node tests/phase274-case-causality-goal-impact.js`
- `node --check web/core/case-causality.js`
- `git diff --check`
