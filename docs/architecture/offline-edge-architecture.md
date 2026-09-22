# 오프라인 대규모 Text RPG 아키텍처

## 목표
Microsoft Edge(Chromium) 로컬 환경에서 수만~수십만 엔티티와 이벤트를 처리할 수 있는 오프라인 우선 텍스트 RPG 구조를 설계한다.

## 핵심 구성
- **IndexedDB**: 대용량 구조화 게임 데이터의 영속 저장
- **Web Worker**: 게임 상태 업데이트, 시뮬레이션, AI 처리
- **Canvas / OffscreenCanvas**: 텍스트 UI 렌더링과 필요 시 워커 오프로드
- **File API**: 세이브 데이터 내보내기/가져오기
- **Audio / Web Audio API**: BGM 및 효과음

## 역할 분리
### Main Thread
- 사용자 입력
- Canvas UI 렌더링
- 화면 상태 관리
- 필요 시 IndexedDB 접근
- Worker와의 메시지 통신

### Game Worker
- 게임 상태
- 시뮬레이션
- NPC AI
- 이벤트 처리
- 상태 변경 계산
- DB 저장 요청

### Database Layer
Object Store를 엔티티 유형별로 분리한다.
- Characters
- Items
- Events
- Quests
- 기타 월드 엔티티

각 스토어에는 `id`를 keyPath로 두고 조회 빈도가 높은 필드에 인덱스를 추가한다.

## 메시지 프로토콜
공통적으로 `{ type, payload }` 형식을 사용한다.

예시:
- INIT
- LOAD_REGION
- USER_ACTION
- TICK
- SAVE_ENTITY
- UPDATE
- ERROR

대규모 payload는 구조 복사 비용을 고려해 필요한 정보만 전송하고, 필요하면 requestId를 사용한다.

## 데이터 처리 전략
- 가능한 DB 쓰기는 bulk transaction으로 묶는다.
- 인덱스를 이용해 범위/조건 조회를 최적화한다.
- 현재 활성 지역과 최근 접근 데이터만 메모리에 캐시한다.
- LRU 방식으로 캐시를 관리한다.
- 세계 규모가 커지면 지역/챕터/시간 기준 파티셔닝을 적용한다.
- IndexedDB 버전을 이용한 migration을 설계한다.
- `navigator.storage.persist()`로 영속 저장을 요청할 수 있다.

## 렌더링 전략
텍스트 UI는 가상화(virtualization)를 적용한다.
- 현재 화면에 필요한 줄만 렌더링
- 긴 로그는 청크 단위로 관리
- `measureText()`를 이용한 줄바꿈
- 렌더링 부담이 커질 경우 OffscreenCanvas 검토

## 성능 검증
주요 지표:
- 입력 → 화면 반영 지연
- FPS / frame time
- JavaScript heap 사용량
- IndexedDB 평균 및 p99 지연
- 대량 entity load/save 시간

스트레스 테스트:
1. 10만 엔티티 초기 로드
2. 수백 줄 로그 스크롤
3. 대량 상태 저장
4. 대량 NPC 시뮬레이션
5. 다중 Worker 부하

## 참고
이 문서는 프로젝트 내부의 구현 방향을 고정하기 위한 설계 요약이다. 세부 근거와 예시 코드는 조사 보고서에 별도로 정리한다.
