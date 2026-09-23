# Phase 257 — NPC 행동과 사건 Trigger 연결

## 목적

NPC가 플레이어와 상관없이 수행한 행동이 세계의 정황을 만들고, 그 정황이 기존 사건 Trigger를 활성화하도록 연결한다.

## 구조

`NPC 일정 진입 → eventSignal 기록 → 기존 case trigger 평가 → 사건 open`

첫째, `world.eventSignals`는 발생한 세계 신호의 누적 횟수를 저장한다.

둘째, `world.eventHistory`는 최근 80개의 신호를 출처·시각·설명과 함께 보존한다.

셋째, NPC 일정 항목에 선택적으로 `signal`과 `signalText`를 정의한다. 현재 마라의 창고 장부 확인, 세린의 토지 기록 조사, 요나스의 야간 선박 감시가 사건 신호를 생성한다.

넷째, NPC 일정에 진입한 순간에만 신호가 한 번 기록된다. 같은 활동을 30분 더 수행해도 동일 신호가 중복 발생하지 않는다.

다섯째, 기존 사건 정의는 플레이어가 세운 flag뿐 아니라 동일한 의미의 NPC event signal도 Trigger로 사용할 수 있다. 따라서 기존 플레이어 조사 경로는 유지하면서 NPC 자율 행동 경로를 추가한다.

## 현재 연결

`warehouseSuspicion` → 「닫힌 창고의 곡물」

`recordInconsistency` → 「서로 다른 토지 기록」

`nightCargo` → 「시간표 밖의 배」

## 검증

`tests/phase257-npc-event-trigger.js`는 새 게임에서 NPC 시간을 13:30과 18:30까지 진행하고, event signal 기록·중복 방지·사건 자동 개방을 확인한다.
