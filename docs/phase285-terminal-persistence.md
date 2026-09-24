# Phase 285 — terminal-state persistence regression

## 목적

튜토리얼/결말 루프의 `won`·`lost` 상태가 저장 경계를 통과한 뒤에도 결말 상태와 입력 차단을 유지하는지 검증한다.

## 검증 범위

- IndexedDB 저장 후 재로드
- IndexedDB를 사용할 수 없는 localStorage fallback 저장·재로드
- IndexedDB 쓰기 실패 시 localStorage fallback 기록과 IndexedDB 재로드
- 복원된 `won`·`lost` 상태에서 `휴식` 입력이 시간을 진행하지 않는지 확인
- 저장 정규화가 tutorial, player quest chain, terminal status를 보존하고 caller state를 변형하지 않는지 확인

## 검증 명령

- `node tests/phase285-terminal-persistence.js`
- `node tests/phase284-game-loop.js`
- `node tests/phase282-storage-normalization.js`
- `node tests/phase283-storage-save-normalization.js`
