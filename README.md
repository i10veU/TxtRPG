# TxtRPG

대규모 오프라인 우선 텍스트 RPG 프로젝트.

## 현재 설계 방향

- 플레이어가 세계를 탐험하며 스스로 목표를 발견하는 구조
- NPC가 플레이어와 무관하게 일정·목표에 따라 행동하는 세계 시뮬레이션
- 사건을 Trigger → Event → Consequence 구조로 연결
- 지역·인물·조직·경제·아이템·역사를 서로 연결하는 설정망
- Microsoft Edge 로컬 환경을 기준으로 IndexedDB + Web Worker + Canvas 기반 구현
- 대규모 데이터는 청크 로딩, 가상화, 캐시, bulk transaction으로 관리

## 문서

### 아키텍처
- [오프라인 Edge RPG 아키텍처](docs/architecture/offline-edge-architecture.md)

### 세계관
- [무명의 연대기 — 세계관 설계 원칙](docs/world/world-design-principles.md)
- [세계관 연구 적용 메모](docs/world/source-analysis.md)

## 다음 단계

1. 핵심 게임 루프 확정
2. 월드 상태 모델 및 이벤트 시스템 정의
3. 데이터 스키마(JSON → IndexedDB) 확정
4. NPC 자율 행동 시스템 구현
5. 텍스트 UI / 입력 시스템 구현
6. 저장·복구 및 스트레스 테스트

## 프로젝트 원칙

세계관 문서와 구현 문서를 분리하고, 설정은 데이터화하여 게임 엔진과 독립적으로 관리한다.
