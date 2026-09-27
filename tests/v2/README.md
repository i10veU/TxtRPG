# tests/v2/

V2 전용 테스트 디렉터리. V1 회귀 테스트(`tests/*.js`, `tests/*.spec.js`)와 분리된 실행 경로다.

## 실행

```
node tests/v2/run.js
```

`tests/v2/` 아래의 `*.js` 파일(‘.spec.js’ 제외, `run.js` 자신 제외)을 각각 별도 프로세스로 실행하고
PASS/FAIL을 요약한다. 아직 V2 테스트가 없으면 통과(exit 0)로 보고한다.

브라우저 테스트(`*.spec.js`, Playwright)는 이 러너에서 제외되며 core 엔진 테스트와 별도로 실행한다.

## 규칙

- 이 디렉터리의 테스트는 V1 CI(`.github/workflows/phase251-check.yml`)에 포함되지 않는다.
- V1 테스트 파일을 이 디렉터리로 옮기거나 수정하지 않는다.
- `web/v2/**` 코드가 실제로 존재하기 시작하면, 그 코드를 검증하는 테스트가 이 디렉터리에 최소
  1개 이상 함께 존재해야 한다 (코드만 추가되고 테스트가 0개인 상태를 통과로 보지 않는다).
- 자세한 V2 개발 규칙은 `docs/v2/DEVELOPMENT_RULES.md` 참고.
