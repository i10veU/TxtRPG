# Phase 275 — 사건 인과망 통합 경계 검증

## 목적

Phase 271–274에서 구현한 후속 사건과 조직 목표 압력이 실제 사건 해결 경로와 저장 복원 경계에서도 유지되는지 검증한다.

## 구현

- `Data.resolveCase`의 인과 래퍼가 실제 결과 텍스트를 `caseHistory`에 기록한다.
- `normalizeState`가 `caseHistory`를 검증·정리하고 `caseCausalityDay`를 안전한 정수로 복원한다.
- 기존 Worker와 fallback의 일일 `simulateCaseCausality` 호출 및 중복 방지 동작을 회귀 테스트로 고정한다.

## 검증

- `node tests/phase275-case-causality-integration.js`
- `node tests/phase271-case-causality.js`
- `node tests/phase272-goal-discovery.js`
- `node tests/phase273-case-causality-goal-impact.js`
- `node tests/phase274-case-causality-goal-impact.js`
- `node tests/phase259-worker-faction-parity.js`
- 변경 JavaScript 파일 `node --check`
- `git diff --check`
