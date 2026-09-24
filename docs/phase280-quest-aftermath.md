# Phase 280 — 사건 후폭풍 목표 연쇄

## 목적

Phase 279의 2단계 사건 목표를 기존 사건 인과망의 후속 사건까지 이어지는 저장 가능한 목표 연쇄로 확장한다.

## 구현

- 곡물 창고, 교역로, 세력 충돌, NPC 충돌 사건의 목표 체인에 `후속 사건 확인`과 `후속 사건 해결` 단계를 추가했다.
- 기존 2단계 세이브는 갱신 시 후속 단계를 중복 없이 자동 보완한다.
- 원 사건이 해결 또는 실패해도 후속 사건이 끝날 때까지 원 목표 체인은 완료되지 않는다.
- 후속 사건이 실제로 열린 뒤에만 확인 단계가 완료되어 `목표추천`이 다음 해결 단계로 이동한다.
- 사건 인과 기록은 `resolveCase()`의 실제 결과 텍스트를 보존한다.
- NPC 충돌 후속 사건도 인과 패널에 표시한다.

## 검증

- `node tests/phase280-quest-aftermath.js`
- `node tests/phase279-player-quest-chains.js`
- `node tests/phase271-case-causality.js`
- `node tests/phase275-npc-causality.js`
- `node tests/phase278-case-aftermath-stress.js`
- 변경 JavaScript `node --check` 및 `git diff --check`
