# Phase 274 — 후속 사건의 조직 목표 압력 전파

## 목적

해결된 후속 사건의 결과가 지역 수치와 관계 점수에만 머물지 않고, 관련 조직의 `goalPressure`와 소속 NPC 목표에 즉시 반영되도록 사건 인과망을 확장한다.

## 구현

- `grain-aftershock`:
  - `publish`는 기록관 `+1`, 상인회 `-1` 압력을 적용한다.
  - `settle`은 상인회 `+1`, 기록관 `-1` 압력을 적용한다.
  - `trace`는 경비대 `+1` 압력을 적용한다.
- `faction-aftershock`:
  - `council`은 모든 조직에 `+1` 압력을 적용한다.
  - `enforce`는 경비대 `+1`, 노동자 조합 `-1` 압력을 적용한다.
  - `withdraw`는 모든 조직에 `-1` 압력을 적용한다.
- 압력 변경은 기존 `[-2, 2]` 범위로 제한한다.
- 변경된 조직에 속한 NPC 목표를 같은 선택 처리 중 즉시 재검토해 우선순위 상승·재개·중단을 반영한다.
- 기존 교역로 후속 사건의 결과와 사건 기록, 지역 경제 동작은 유지한다.

## 검증

- `node tests/phase274-case-causality-goal-impact.js`
- `node tests/phase273-case-causality-goal-impact.js`
- 변경 JavaScript 파일 `node --check`
- `git diff --check`
