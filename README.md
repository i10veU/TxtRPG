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
- [Phase 252 NPC 자율 시뮬레이션](docs/phase252-npc-simulation.md)
- [Phase 254 NPC 틱 중복 수정](docs/phase254-npc-tick-fix.md)
- [Phase 255 브라우저 런타임 스모크 테스트](docs/phase255-browser-smoke.md)
- [Phase 256 NPC 일정 효과/알림 주기 분리](docs/phase256-npc-routine-cadence.md)
- [Phase 257 NPC 사건 Trigger 연결](docs/phase257-npc-event-triggers.md)
- [Phase 257 세력 압력과 연쇄 사건](docs/phase257-faction-world.md)
- [Phase 260 동적 곡물 경제](docs/phase260-economy-world.md)
- [Phase 261 정보·소문 시스템](docs/phase261-information.md)
- [Phase 262 NPC 목표 상태](docs/phase262-npc-goals.md)
- [Phase 263 조직 자율 의사결정](docs/phase263-organizations.md)
- [Phase 264 조직 연계 NPC 목표 동역학](docs/phase264-goal-dynamics.md)
- [Phase 265 조직 협력·충돌 관계망](docs/phase265-organization-relations.md)
- [Phase 266 조직 충돌과 사건 연결](docs/phase266-organization-events.md)
- [Phase 267 사건 Consequence와 조직 피드백](docs/phase267-case-consequences.md)
- [Phase 1–205 파일 목록](docs/phase1-205-file-manifest.md)

## 문서

### 아키텍처

- [오프라인 Edge RPG 아키텍처](docs/architecture/offline-edge-architecture.md)

### 세계관

- [무명의 연대기 — 세계관 설계 원칙](docs/world/world-design-principles.md)
- [세계관 연구 적용 메모](docs/world/source-analysis.md)

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

- core/: 상태, 액션 해석, NPC/세력 시뮬레이션
- data/: 지역/NPC/사건 데이터
- storage/: IndexedDB 저장 계층
- worker/: 게임 시뮬레이션
- ui/: 렌더링/입력

기존 localStorage 세이브는 IndexedDB로 최초 1회 자동 마이그레이션하며 IndexedDB를 사용할 수 없는 환경에서는 기존 키를 fallback으로 사용합니다.

NPC는 플레이어의 행동과 함께 흐른 시간을 기준으로 30분 단위 자율 시뮬레이션을 수행하며, 현재 위치와 최근 행동을 UI에 표시한다.

NPC의 개인 목표는 goalState로 구조화되며 일정 진입에 따라 관련 행동의 진행도가 누적된다. 조직 압력이 목표 우선순위를 올리거나 목표를 중단시킬 수 있으며, 중단이 하루 이상 지속되면 다음 목표로 재계획한다. 목표 완료 후에도 짧은 목표 체인이 이어지며 완료·중단 이력이 저장된다.

조직은 하루에 한 번 현재 세계 상태를 평가해 독립적인 의사결정을 내린다. 상인회·경비대·기록관·농촌 대표단·여관망·노동자 조합의 결정은 시장 재고, 치안, 긴장, 행정 신뢰, 소문 압력 등에 직접 영향을 주며, 그 결과는 소속 NPC 목표의 goalPressure로도 전달된다. 조직 간 관계도 별도 상태로 계산되며 협력은 목표 압력을 높이고 충돌은 긴장을 높이면서 두 조직의 NPC 목표를 압박한다. 조직 충돌은 event signal과 소문으로 기록되고 기존 세력 충돌 사건 Trigger를 열어 플레이어 선택으로 이어진다. 사건 선택의 Consequence는 다시 조직 관계 점수와 goalPressure를 바꿔 다음 자율 행동에 피드백된다.

세력 세계 압력 계산은 NPC 시뮬레이션의 동일한 경로에서 하루 1회 수행되며 Worker와 fallback이 같은 결과를 사용한다.

NPC 일정의 생산·치안·소문 같은 효과는 활동 중인 30분 틱마다 유지하고, 일정 진입을 알리는 서술은 같은 활동에서 반복하지 않도록 분리되어 있다.

NPC 일정은 필요할 때 event signal을 생성하며, 이 신호는 기존 사건 Trigger와 연결되어 NPC의 자율 행동이 새로운 사건을 열 수 있다.

NPC event signal은 출처와 확인 횟수를 가진 소문으로도 저장되며, 여러 출처에서 같은 정황이 반복되면 정보 신뢰도가 상승한다. 플레이어는 `소문` 명령 또는 6번 정보 패널에서 이를 확인할 수 있다.

세력 관계는 곡물·치안·긴장·행정 신뢰·소문 압력에 따라 하루 단위로 변화하며, 적대 세력이 동시에 늘어나면 세력 충돌 사건이 생성된다. 충돌 사건의 선택은 다시 세력 관계와 세계 상태에 영향을 준다.

동적 경제는 현재 곡물을 첫 번째 거래 상품으로 사용한다. 공급·긴장·치안에 따라 가격이 변하고, 시장 재고와 플레이어의 구매·판매가 세계 상태와 상인회 관계에 반영된다.

브라우저 smoke test는 실제 Chromium에서 Worker 실행, IndexedDB 저장, 액션 처리, 페이지 새로고침 후 복원을 검증한다.

## 다음 단계

1. 조직 간 협력/충돌과 의사결정 경쟁 추가
2. NPC 목표를 개인 관계망·사건 Trigger와 연결
3. 경제를 곡물 외 지역 자원·상점·교역로로 확장
4. 사건 간 인과망을 후속 사건/지역 변화까지 연결
5. IndexedDB 엔티티 분리와 장기 시뮬레이션 스트레스 테스트

## 프로젝트 원칙

세계관 문서와 구현 문서를 분리하고, 설정은 데이터화하여 게임 엔진과 독립적으로 관리한다.
