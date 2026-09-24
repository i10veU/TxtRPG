# Phase 279 — 플레이어 목표 연쇄

## 목적

`목표추천`·`단서`·`퀘스트` 명령을 일회성 힌트에서 저장 가능한 사건 기반 목표 연쇄로 확장한다.

## 구현

- `world.playerQuests.chains`에 사건별 안정적인 체인/단계 ID를 저장한다.
- 열린 사건은 조사 단계와 해결 단계로 진행되며, 사건 해결 결과는 체인을 완료한다.
- 기존 저장 데이터에는 빈 목표 구조를 자동 보완하고 Worker/fallback 모두 같은 갱신 함수를 사용한다.
- 잠긴 사건은 목표 추천에 노출하지 않고, 열린 사건의 다음 단계만 실행 가능한 목표로 표시한다.

## 검증

- `node tests/phase279-player-quest-chains.js`
- 전체 비브라우저 회귀 테스트 및 JavaScript 문법 검사
- Phase 272/273/278 회귀와 Worker/fallback 재생 parity
