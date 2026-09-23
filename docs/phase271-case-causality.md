# Phase 271 — 사건 인과망과 후속 사건

## 목적

해결된 사건을 독립적인 콘텐츠로 끝내지 않고, 선택 결과가 하루 이상의 시간 지연을 거쳐 후속 사건의 Trigger가 되도록 연결한다.

## 구현

- `web/core/case-causality.js` 추가
- 해결/실패 사건을 `world.caseHistory`에 기록
- 사건 ID, 선택 ID, 상태, 해결 일자/시각, 결과 요약을 저장
- 기존 사건 정의를 유지하면서 후속 사건 정의를 동적으로 확장
- `grain-warehouse` → `grain-aftershock`
- `trade-route` → `trade-route-aftershock`
- `faction-conflict` → `faction-aftershock`
- 후속 사건은 원 사건 해결 다음 날부터 Trigger 가능
- `연쇄사건`, `사건연쇄`, `인과관계` 명령으로 최근 사건 인과 기록 확인
- STATUS UI에 연쇄 사건 패널과 `8` 단축키 추가
- Worker와 fallback 경로 모두 동일한 causality simulation을 실행

## 설계 의도

사건의 Consequence는 즉시 수치만 바꾸는 것이 아니라 이후 세계의 선택지를 바꿔야 한다. 따라서 이번 단계에서는 별도의 복잡한 그래프 엔진을 도입하지 않고, 기존 `caseDefinitions`, `eventSignals`, `world` 상태를 재사용하는 지연 Trigger 계층을 추가했다.

예:

`창고 사건 선택 → 시장/기록관 관계 변화 → 다음 날 후속 사건 생성 → 플레이어 재개입 → 추가 세계 변화`

## 저장 호환성

기존 Save에 `caseHistory`가 없으면 빈 배열로 초기화한다. 기존 사건/세이브 스키마를 제거하거나 재작성하지 않는다.

## 검증

- JavaScript syntax 검사
- Phase 271 사건 인과 회귀 테스트
- 기존 회귀 테스트 전체 재실행
- Worker/fallback 동작 경로 확인
- 브라우저 smoke test
- 장기 시간 진행에서 후속 사건의 중복 생성 여부 확인

## 명령

- `연쇄사건`
- `사건연쇄`
- `인과관계`
- `8` — Causality UI panel
