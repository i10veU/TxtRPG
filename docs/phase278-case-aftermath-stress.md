# Phase 278 — 지연 사건 후폭풍 장기 검증

## 목적

일반 행동 루프에서 사건 해결 결과가 다음 날 후속 사건으로 이어지는지, Worker와 fallback이 같은 인과 상태를 유지하는지 장기 실행으로 검증한다.

## 검증

- `node tests/phase278-case-aftermath-stress.js`
- 곡물 창고 사건을 일반 `사건` 명령으로 해결한 뒤 다음 날 `grain-aftershock`가 한 번만 생성되는지 확인
- 후속 사건 해결과 `caseHistory` 기록을 확인
- 120일(360회 숙면) 동안 `caseHistory`, 로그, event history, rumor 배열의 상한을 확인
- 동일한 입력을 Worker와 fallback에 재생해 사건 상태, 인과 기록, 핵심 관계·신뢰 수치의 parity 확인
