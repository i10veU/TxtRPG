# Phase 283 — persistence save-boundary normalization

## 목적

상태를 저장할 때도 현재 스키마로 정규화한 스냅샷만 영속화해 IndexedDB와 localStorage fallback이 같은 상태 의미를 유지하도록 한다.

## 구현

- `Storage.saveState()`가 저장 시점에 `Core.normalizeState()`를 한 번 호출한다.
- IndexedDB 레코드의 `schemaVersion` 메타데이터와 내부 `state`가 정규화된 상태에서 생성된다.
- IndexedDB를 사용할 수 없거나 쓰기에 실패하면 동일한 정규화 스냅샷을 localStorage에 저장한다.
- 정규화 과정에서 caller가 전달한 상태 객체를 변경하지 않는다.

## 검증

- `node tests/phase283-storage-save-normalization.js`
- `node tests/phase282-storage-normalization.js`
- `node --check web/storage/idb-storage.js`
- `git diff --check`
