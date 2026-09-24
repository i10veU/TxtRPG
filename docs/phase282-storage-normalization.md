# Phase 282 — persistence-boundary state normalization

## 목적

IndexedDB와 기존 localStorage 경로에서 불완전하거나 이전 스키마인 세이브를 불러올 때도 현재 엔진 상태로 정규화하고, 정규화된 결과를 저장해 이후 로드가 동일한 구조를 사용하도록 보장한다.

## 구현

- `Storage.loadState()`가 IndexedDB 저장, localStorage 마이그레이션, localStorage fallback 모두 `Core.normalizeState()`를 통과시킨다.
- IndexedDB에서 legacy 상태가 발견되면 정규화된 상태를 한 번 다시 저장한다.
- localStorage 마이그레이션 및 fallback 경로도 정규화된 상태를 보존한다.
- IndexedDB, 마이그레이션, fallback 세 경로를 검증하는 회귀 테스트를 추가했다.

## 검증

- `node tests/phase282-storage-normalization.js`
- 전체 비브라우저 회귀 테스트
- 변경 JavaScript `node --check` 및 `git diff --check`
