# TxtRPG

대규모 오프라인 우선 텍스트 RPG 프로젝트.

## 현재 설계 방향

- 플레이어가 세계를 탐험하며 스스로 목표를 발견하는 구조
- NPC가 플레이어와 무관하게 일정·목표에 따라 행동하는 세계 시뮬레이션
- 사건을 Trigger → Event → Consequence 구조로 연결
- 지역·인물·조직·경제·아이템·역사를 서로 연결하는 설정망
- Microsoft Edge 로컬 환경을 기준으로 IndexedDB + Web Worker + Canvas 기반 확장
- 현재 `web/`에는 바로 실행 가능한 TXT RPG 코어 프로토타입을 유지하며 이후 오프라인 엔진으로 확장

## 릴리스 기록
- [Phase 1–205 통합 릴리스 인덱스](PHASES_1_205_RELEASE_INDEX.md)
- [Phase 206–220](docs/phase206-220-release.md)
- [Phase 221–235](docs/phase221-235-release.md)
- [Phase 236–250](docs/phase236-250-release.md)
- [Phase 1–205 파일 목록](docs/phase1-205-file-manifest.md)

## 문서

### 아키텍처
- [오프라인 Edge RPG 아키텍처](docs/architecture/offline-edge-architecture.md)

### 세계관
- [무명의 연대기 — 세계관 설계 원칙](docs/world/world-design-principles.md)
- [세계관 연구 적용 메모](docs/world/source-analysis.md)

## 실행

`web/index.html`을 Edge/Chromium 계열 브라우저에서 열면 현재 TXT RPG 프로토타입을 실행할 수 있습니다.

주요 입력 예시:
- `시장 조사`
- `기록관으로 이동`
- `세린과 대화`
- `사건목록`
- `사건분기 1`
- `사건분기 1 2`

## 다음 단계

1. 사건 분기 결과를 NPC·조직 관계와 연결
2. IndexedDB 저장 계층으로 확장
3. Web Worker 시뮬레이션 계층 분리
4. 사건·세계 상태를 데이터 파일로 분리
5. 장기 시뮬레이션 및 회귀 테스트 자동화

## 프로젝트 원칙

세계관 문서와 구현 문서를 분리하고, 설정은 데이터화하여 게임 엔진과 독립적으로 관리한다.

## Latest Development — Phase 236–250

Phase 221–235에서 정의한 분기형 사건망을 실제 실행 가능한 `web/` 코어에 반영했습니다. 세계 상태의 특정 조건이 사건을 생성하고, 사건마다 3개의 대응 경로와 위험도가 제공됩니다. 선택 결과는 결정론적 판정으로 처리되며 현금·곡물·치안·행정 신뢰·긴장도·발견 정보와 사건 상태에 반영됩니다.

- `web/index.html`: 실행 진입점
- `web/styles.css`: TXT RPG UI
- `web/game.js`: 시간·이동·NPC·조사·저장·분기 사건 코어
- Save Key: `anonymous_chronicles_save_v2`
- 상세 기록: [Phase 236–250](docs/phase236-250-release.md)
