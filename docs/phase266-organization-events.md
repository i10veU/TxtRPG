# Phase 266 — 조직 충돌과 사건 Trigger 연결

## 목표

조직 관계망의 충돌이 세계 로그에만 남지 않고 실제 플레이 가능한 사건과 정보로 이어지도록 연결했다.

## 변경

조직 간 충돌이 발생하면 `organizationConflict:<pair>` event signal을 기록한다. 기존 event signal 파이프라인을 그대로 사용하기 때문에 충돌 출처, 발생 시각, 횟수를 장기 상태로 보존할 수 있다.

동시에 해당 신호는 기존 소문 시스템에 기록되어 플레이어가 `소문` 명령으로 간접적인 정보를 확인할 수 있다.

충돌 신호가 있으면 기존 `faction-conflict` 사건 Trigger가 이를 감지하여 즉시 사건을 개방한다. 따라서 NPC와 조직의 자율 행동이 플레이어의 사건 목록으로 진입하는 경로가 완성된다.

## 흐름

조직 의사결정 → 조직 협력/충돌 → event signal → 소문 → 사건 Trigger → 플레이어 선택 → 세계 상태 변화

## 검증

`tests/phase266-organization-events.js`에서 충돌 이벤트, 소문 생성, `faction-conflict` 사건 개방, 정규화 후 이벤트/소문 보존을 검증한다.

## 다음 단계

Phase 267에서는 사건 선택의 결과가 특정 조직 관계 점수와 goalPressure에 직접 반영되도록 연결한다.