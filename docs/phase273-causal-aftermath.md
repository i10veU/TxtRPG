# Phase 273 — 사건 후속 효과 브리지

## 목적

해결된 사건의 인과를 후속 사건 생성에서 끝내지 않고, 다음 시뮬레이션 날짜에 지역 경제와 NPC 장기 목표가 변하도록 연결한다.

## 구현

- 사건 선택지에 선택적 `causalImpact` 메타데이터를 추가했다.
- `world.caseHistory`에 선택된 효과와 `causalAppliedDay`를 저장한다.
- 해결 당일에는 효과를 적용하지 않고 다음 날 한 번만 적용한다.
- 지역 교역로 신뢰도와 시장 재고를 범위 내에서 갱신한다.
- 조직 `goalPressure`를 기존 `[-2, 2]` 범위로 갱신하고 영향받은 NPC 목표를 즉시 재검토한다.
- 기존 Phase 271 세이브의 인과 메타데이터 누락을 허용한다.
- 기존 Worker/fallback 양쪽이 공유하는 `simulateCaseCausality` 경로를 유지한다.

## 범위와 호환성

기존 사건 선택의 즉시 Consequence는 변경하지 않는다. 후속 효과는 선언적이고 작게 유지하며, 기존 세이브에는 효과가 없었던 것으로 처리한다. 사건 후속 Trigger와 명령은 그대로 유지한다.

초기 적용 사건:

- `trade-route`: 경비대 배치, 노동자 보수, 대체 공급 계약
- `grain-warehouse`: 공식 장부 대조

## 검증

- `tests/phase273-causal-aftermath.js`
- 전체 비브라우저 Phase 회귀 테스트
- JavaScript syntax 검사
- 초기 지역 경제 위기 오탐 회귀 검사

브라우저 smoke 테스트는 저장소의 기존 Playwright 의존성이 제공될 때 실행한다.
