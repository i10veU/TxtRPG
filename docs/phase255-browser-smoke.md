# Phase 255 — Browser Runtime Smoke Test

## 목적

Phase 251–254까지의 핵심 엔진이 Node 기반 회귀 테스트뿐 아니라 실제 Chromium 브라우저에서 연결되어 실행되는지 검증한다.

검증 경로:

`index.html → script 초기화 → IndexedDB load/save → Worker INIT → UI render → 사용자 action → Worker UPDATE → IndexedDB save → reload 복원`

## 검증 항목

첫째, 초기 부팅 시 기본 로그 2개, NPC 7명, 세력 관계 6개가 렌더링되는지 확인한다.

둘째, Worker가 실제로 활성화되어 있는지 런타임 상태를 확인한다. Worker 생성 실패 시 메인 스레드 fallback으로 조용히 전환되는 문제를 브라우저 테스트에서 바로 발견하도록 한다.

셋째, `휴식` 입력으로 시간이 60분 진행되고 30분 단위 NPC 시뮬레이션이 실제 브라우저 런타임에서 수행되는지 확인한다.

넷째, `AnonymousChroniclesDB`가 생성되고 상태가 저장되는지 확인한 뒤 페이지를 새로 고쳐 동일한 월드 시간이 복원되는지 확인한다.

다섯째, 페이지 오류와 콘솔 error가 없는지 검사한다.

## 실행

CI에서는 Chromium을 설치한 후 웹 루트에 Python 정적 서버를 실행하고 Playwright smoke test를 수행한다.

로컬에서는 다음 순서로 재현할 수 있다.

```text
npm install --no-save @playwright/test@1.55.0
npx playwright install chromium
python3 -m http.server 4173 --directory web
npx playwright test tests/phase255-browser.spec.js
```

## 범위

이 테스트는 게임의 전체 콘텐츠 정합성이나 장기 시뮬레이션을 검증하지 않는다. 목적은 브라우저 경계에서 발생하는 초기화, Worker, 저장, 복원, UI 연결 회귀를 빠르게 탐지하는 것이다.
