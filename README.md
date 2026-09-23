# TxtRPG

대규모 오프라인 우선 텍스트 RPG 프로젝트.

## 현재 설계 방향

- 플레이어가 세계를 탐험하며 스스로 목표를 발견하는 구조
- NPC가 플레이어와 무관하게 일정·목표에 따라 행동하는 세계 시뮬레이션
- 사건을 Trigger → Event → Consequence 구조로 연결
- 지역·인물·조직·경제·아이템·역사를 서로 연결하는 설정망
- Microsoft Edge 로컬 환경을 기준으로 IndexedDB + Web Worker + Canvas 기반 확장
- 현재 web/에는 바로 실행 가능한 TXT RPG 코어를 유지하며 이후 오프라인 엔진으로 확장

## 릴리스 기록

- [Phase 1–205 통합 릴리스 인덱스](PHASES_1_205_RELEASE_INDEX.md)
- [Phase 206–220](docs/phase206-220-release.md)
- [Phase 221–235](docs/phase221-235-release.md)
- [Phase 236–250](docs/phase236-250-release.md)
- [Phase 251 엔진화](docs/phase251-engineization.md)

## 실행

web/index.html을 Edge/Chromium 계열 브라우저에서 열면 현재 TXT RPG 프로토타입을 실행할 수 있습니다.

주요 입력 예시:
- 시장 조사
- 기록관으로 이동
- 세린과 대화
- 사건목록
- 사건분기 1
- 사건분기 1 2

## 현재 엔진 구조

web/ 아래에서 상태, 데이터, 입력, 렌더링, 저장, Worker를 분리하여 유지합니다.

- core/: 상태 및 액션 해석
- data/: 지역/NPC/사건 데이터
- storage/: IndexedDB 저장 계층
- worker/: 게임 시뮬레이션
- ui/: 렌더링/입력

기존 localStorage 세이브는 IndexedDB로 최초 1회 자동 마이그레이션하며 IndexedDB를 사용할 수 없는 환경에서는 기존 키를 fallback으로 사용합니다.

## 다음 단계

1. Worker 기반 NPC 자율 틱 구현
2. NPC 일정/목표/관계 데이터화
3. 동적 경제·조직 시스템 재통합
4. 사건 간 인과망 확장
5. 대규모 데이터 저장/장기 시뮬레이션 회귀 테스트
