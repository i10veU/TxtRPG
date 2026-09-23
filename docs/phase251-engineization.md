# Phase 251 — 엔진화 전환

## 목표

기존 web/game.js의 단일 파일 프로토타입을 실제 엔진 구조로 분리하고, 현재 플레이 루프를 유지하면서 저장 계층과 Worker 경계를 확보한다.

## 구현

- 게임 상태와 시간 로직을 web/core/game-state.js로 분리
- 명령 해석을 web/core/action-resolver.js로 분리
- 지역/NPC/사건 정의를 web/data/로 분리
- IndexedDB 저장 계층을 web/storage/idb-storage.js로 추가
- Web Worker 실행 계층을 web/worker/game-worker.js로 추가
- 렌더링과 입력을 web/ui/로 분리
- 기존 localStorage 키 anonymous_chronicles_save_v2를 최초 로드 시 IndexedDB로 자동 마이그레이션
- IndexedDB 사용 불가 시 localStorage fallback 유지
- 기존 이동/조사/대화/사건분기 명령을 유지
- Worker 오류 발생 시 메인 스레드 호환 모드로 전환

## 런타임 구조

Main Thread
- 입력
- 렌더링
- IndexedDB 저장
- Worker 메시지 통신

Game Worker
- 게임 상태
- 시간 진행
- 이동/조사/대화
- 사건 생성/분기/판정

입력 -> Main Thread -> postMessage -> Game Worker -> Game State / Action / Event Logic -> postMessage -> Main Thread -> IndexedDB / UI

## 의도적으로 다음 단계로 미룬 부분

이번 단계에서는 NPC가 실제로 독립 행동하는 자율 틱, 동적 경제, 조직 시뮬레이션, 대규모 데이터 청크 로딩을 추가하지 않았다.

현재 코어를 먼저 Worker 경계와 영속 저장 계층으로 안정화한 뒤, 다음 단계에서 NPC 시뮬레이션을 Worker tick으로 추가하는 것이 회귀 위험이 낮다.

## 다음 검증 단위

1. JavaScript 문법 검사
2. Worker 스크립트 로드 및 메시지 왕복 검사
3. IndexedDB 저장/복구 검사
4. 기존 localStorage 세이브 마이그레이션 검사
5. 사건 분기 회귀 검사
6. 300회 이상 장기 행동 검사
7. NPC 자율 틱의 Worker 통합
