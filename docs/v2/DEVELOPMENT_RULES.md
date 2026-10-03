# TxtRPG V2 개발 규칙 (확정본)

> 이 문서는 `feature/v2-core` 브랜치에서 V2를 개발할 때 지키는 프로젝트 수준 규칙이다.
> V2 작업 범위에서는 이 문서가 AGENTS.md의 자동화 조항(인간 승인 없는 자율 루프, 자동 PR/merge 등)
> 보다 우선한다. AGENTS.md 자체, `.github/workflows/*`, 기타 V1 파일은 이 문서로 수정하지 않는다.
> **V2 작업 범위에서는 사람이 승인한 작업만 수행한다.**

## 0. 목적

V2는 "기능 구현"이 아니라 "V1을 깨뜨리지 않으면서 새 코어를 병행 개발할 수 있는 상태"에서 시작한다.
이 문서가 존재하는 시점에는 아직 V2 실제 구현(`web/v2/**`, 엔진, 세계관/성장/스킬/아이템 콘텐츠)이
시작되지 않았다.

## 1. 회귀 기준점 (Regression Baseline)

- `v1-final`은 현재 `54593cb9418369f2b99ed2237ac01eda648da409`를 가리키는 기존 기준 태그이며,
  V2에서는 이를 회귀 기준점으로 사용한다.
- 원격(`origin`)에도 동일 커밋을 가리키는 `v1-final` 태그가 이미 존재한다. 로컬에는 별도로 만든
  annotated 태그(`v1-final`, 태그 객체 해시가 다름)가 있다. 가리키는 커밋은 같지만 태그 객체 자체가
  다르다는 차이만 기록해 두고, 지금 단계에서는 정리하거나 변경하지 않는다.
- `v1-final`을 삭제하거나 다른 커밋으로 이동시키지 않는다.
- `feature/v2-core`는 `v1-final`(= `origin/main` = `54593cb`) 지점에서 분기했다.
- V2 작업 중 "기존 동작이 깨지지 않았는가"는 항상 이 기준점과 비교해서 판단한다.

## 2. 개발 경계

### V1

- `v1-final`을 회귀 기준점으로 보존한다.
- V1 런타임 파일(`web/core`, `web/ui`, `web/worker`, `web/storage`, `web/data`, `web/index.html`,
  `web/game.js` 등)을 V2 때문에 수정하지 않는다. 예외 없음 — 통합이 필요해지면 V2 쪽 진입점을
  새로 만든다 (예: `web/v2/index.html`).
- 기존 V1 테스트(`tests/*.js`, `tests/*.spec.js`)와 문서(`docs/phase*.md`)를 삭제하거나 고치지 않는다.
- 기존 Serka 세계관 콘텐츠(`web/data/*.js`)를 V2 콘텐츠로 임의 변환하지 않는다.
- Worker/fallback 이중 경로 구조를 제거하지 않는다.
- V1 세이브를 V2로 import하지 않는다.
- V1의 `world.continuity` 구현(phase292 사망/nextLife 모델)을 V2에 이식하지 않는다. V2의 사망/세계
  전환 설계는 15절 기준으로 별도로 진행한다.

### V2

- `feature/v2-core`에서 개발한다.
- V2 런타임은 `web/v2/` 아래에 둔다.
- V2 저장소는 V1과 별도의 namespace를 사용한다 (별도 IndexedDB DB 이름/버전, 별도 localStorage 키
  프리픽스 — 구체적인 이름은 저장소 구현 시점에 확정).
- V2 개발 작업은 사람이 검토한 뒤 다음 작업으로 넘어간다. 작업 단위를 임의로 이어 붙여 진행하지
  않는다.
- 자동 commit / merge / push를 하지 않는다.
- Stop hook이나 다른 자동화가 commit/push를 요구하더라도, 사용자 지시가 이를 금지하는 동안에는
  사용자 지시를 우선하여 작업을 중단하고 그 사실을 보고한다.
- 기존 legacy 자동화(AGENTS.md의 자율개발 루프, `txt-rpg-task.yml` 등)가 V2 개발을 자동으로
  진행하도록 허용하지 않는다. V2는 이 문서의 승인 경계 밖에서 자동 진행되지 않는다.

## 2.5 자율 개발 결정 규칙

V2의 일반 작업은 사용자에게 매 단계 승인을 묻지 않고 자율적으로 판단하고 연속해서 진행한다.
새 결정이 필요하면 기존 구현, 테스트, 현재 계약, 게임철학, Ponytail/YAGNI, Save/Core/Regression 영향을 먼저 조사한 뒤 가장 일관되고 최소인 선택을 스스로 결정한다.
중요한 결정은 `Decision / Alternatives / Reason / Risk / Compatibility impact`를 기록한다.

### Hard Gate — 사용자 승인 필수

다음 변경만 반드시 중단하고 사용자 승인을 요청한다.

- `step(state, action, data)` 등 Core Engine 계약의 근본적 변경
- 기존 State schema의 의미 변경
- 기존 Save의 의미를 깨뜨리거나 호환 불가하게 만드는 변경
- RNG/결정론 계약 변경
- 기존 시스템 제거 또는 비호환 대체
- World/Game Loop의 핵심 철학 변경
- V1과의 격리 경계 변경
- 대규모 dependency 도입 또는 플랫폼 구조의 근본적 변경
- 보안 경계/권한 모델의 근본적 변경
- 상용 출시 구조에 직접 영향을 주는 비가역적 아키텍처 결정

Hard Gate에서는 분석 결과, 선택지, 영향, 추천안을 정리한 뒤 승인을 기다린다. 그 외 결정은 질문하지 않고 진행한다.

## 2.6 자율 개발 루프

```
Issue → Research → Gap Analysis → Design → Self Review → Decision
→ Implementation → Unit → Mutation → Browser → Save/Load
→ V1 Regression → Final Self Review → PR → CI → Merge → Next Phase
```

테스트/CI 실패가 발생하면 원인을 스스로 분석하고 수정한 뒤 재검증한다. 현재 작업의 완료 조건을 만족하면 다음 Issue/Phase의 Research로 이어간다. 다음 작업이 Hard Gate에 도달할 때만 중단한다.

## 2.7 모델/에이전트 라우팅

작업의 난이도보다 위험도와 판단 비용을 우선 평가한다.

- LOW: 단순 탐색, 테스트 실행, 기존 패턴을 따르는 데이터 변경, 국소 UI → 저비용/경량 모델 가능
- MEDIUM: 일반 기능 구현, 테스트 작성, 국소적인 시스템 연결, 일반 버그 수정 → 표준 모델
- HIGH: 아키텍처 분석, 복수 시스템 상호작용, Capability/전투/성장 구조 변경 → 고성능 모델
- CRITICAL: Core contract, State/Save, RNG, V1 boundary, 비가역 architecture → 최고 성능 모델 독립 검토 + Hard Gate

모델 다양화 자체를 목적으로 하지 않으며, 판단 수준에 맞는 모델을 배정한다.

## 2.8 Decision Record

중요한 자체 결정은 다음 형식으로 남긴다.

```
Decision:
Alternatives:
Reason:
Risks:
Compatibility:
Validation:
```

## 3. Ponytail 원칙 (확정)

우선순위:

```
YAGNI
→ 기존 코드 재사용
→ 표준 라이브러리
→ 브라우저/플랫폼 네이티브 기능
→ 이미 존재하는 의존성
→ 최소 구현
```

추상화, 파일 분리, Worker, 서버, 별도 라이브러리는 실제 요구가 발생하기 전까지 만들지 않는다.
"나중에 필요할 것 같다"는 이유로 미리 구조를 만들지 않는다.

## 4. V2 플랫폼 구조

V2는 Web-first다. 그러나 핵심 게임 엔진은 DOM/browser API에 의존하지 않는다 (Steam/Mobile 등
향후 확장을 고려).

장기 목표 계약:

```
step(state, action, data) → { state, events }
```

엔진은 다음에 의존하지 않는다.

- DOM
- `window`
- `indexedDB`
- `Date.now()`
- `Math.random()`
- 브라우저 전용 API

브라우저 UI와 저장소는 engine 바깥 계층이다.

초기 디렉터리는 과도하게 세분화하지 않는다. 지금 허용하는 범위는:

```
web/v2/core/
web/v2/data/
web/v2/ui/
```

`worker/`, `server/`, `storage/` 디렉터리는 실제 구현 필요성이 생길 때 만든다. 지금은 만들지 않는다.

## 5. 모듈 형식

V2는 **ES Module**을 기본으로 한다. `import`/`export`를 사용한다.

V1 방식인 IIFE + global/window namespace(`window.AnonymousRPG`)는 V2에서 사용하지 않는다.

브라우저에서 직접 실행 가능한 진입점과 Node 테스트가 동일한 core 모듈을 그대로 import할 수 있어야
한다 (별도 빌드/트랜스파일 단계를 전제하지 않는다 — 필요해지면 그때 재검토).

루트 `package.json`에 `"type":"module"`을 추가하면 V1 테스트(CommonJS `require`)가 깨지므로 금지한다.
Node ESM 적용 방식은 `docs/v2/architecture/CORE_CONTRACTS.md` 1.2절(D-01)에서 결정한다.

## 6. Seed / 결정론 계약

새 게임은 새로운 `worldSeed`를 생성한다. seed는 전투 판정뿐 아니라 필요하면 다음의 초기 상태
생성에도 쓰일 수 있다.

- 초기 세계 상태
- 세력 초기 상태
- NPC 초기 상태
- 사건 배치
- 세계의 역사적 초기 조건
- 결정론적 판정

단, 모든 콘텐츠를 무작위 생성한다는 뜻은 아니다. **고정된 데이터 정의 + seed 기반 초기화** 구조를
쓴다.

계약: 같은 `worldSeed` + 동일한 초기 상태 + 동일한 action sequence는 동일한 결과를 만들어야 한다.

RNG는 명시적인 seed 기반 함수로 분리하고, engine은 외부의 전역 난수 상태(`Math.random()` 등)를
사용하지 않는다.

## 7. step() 계약

초기 계약:

```
step(state, action, data) -> { state, events }
```

원칙:

- 입력 `state`를 직접 mutate하지 않는다. 새로운 state를 반환한다.
- 게임 결과는 `events`로 설명 가능해야 한다.
- 잘못된 action은 예외를 남발하지 않고 명시적인 reject event/result로 표현한다.
- 엔진에서 시간은 state 안의 게임 시간만 사용한다. 실제 시스템 시간(`Date.now()` 등)은 engine에서
  읽지 않는다.

정확한 action/event 스키마는 `docs/v2/architecture/CORE_CONTRACTS.md` 2절에 제안되어 있으며,
사람 검토로 확정한 뒤 구현한다.

## 8. Condition / Effect / check()

V2의 공통 규칙 시스템으로 `Condition`, `Effect`, `check()` 세 가지를 쓴다.

다음 시스템들이 가능한 한 동일한 `Condition` 표현을 공유해야 한다.

- 행동 가능 여부
- 지역 접근
- 선택지
- 사건 trigger
- 퀘스트 완료
- 관계 조건
- 성장 해금
- 아이템 사용 조건

`Effect`는 가능한 한 선언형 데이터로 표현한다. 선언형 표현이 불가능한 예외적인 경우에만 이름 기반
handler registry를 사용한다. **함수 자체를 JSON 데이터에 넣지 않는다.**

`check()`는 단순 boolean이 아니라 판정 등급을 표현할 수 있도록 설계할 예정이다 (예: `great`,
`success`, `partial`, `fail`). 정확한 수치/주사위 범위는 구현 전에 테스트로 확정한다.

## 9. 데이터 형식

세계/성장/사건/퀘스트/아이템 등의 기본 데이터는 JSON을 우선 검토한다.

예외 로직(선언형으로 표현 불가능한 규칙)은 별도의 명시적인 JS handler registry로 분리한다.

JSON이 지나치게 복잡해지는 것이 실제로 확인되기 전까지 JS 데이터 모듈로 회귀하지 않는다.

## 10. 성장 / 세계관 경계

첫 세계는 판타지다. 첫 성장체계는 판타지형이다.

성장에는 다음이 포함될 수 있다: `level`, `exp`, `stats`, `proficiency`, `skill`, `trait`, `item`,
`unlock`.

성장은 단순 수치 상승에 그치지 않는다. 성장 결과는 새로운 행동/선택지/능력/시스템 접근으로
이어져야 한다 (Condition/Effect 기반 해금).

성장체계는 세계별로 분리한다. 다른 세계로 이동하면 해당 세계의 성장체계를 새로 획득하는 장기
구조(성장형 먼치킨 구조로 누적)를 고려한다. **세계 간 성장 재해석 로직은 현재 구현하지 않는다.**

## 11. 전투

전투는 별도 액션 게임이 아니라 서술형 판정 시스템이다. 기본적으로 사건 시스템의 특수한 형태로
구현한다.

성장/스탯/스킬/장비/특성이 판정 결과(`check()`)에 영향을 준다.

전투 전용 UI를 별도로 만들지 않는다.

## 12. RelationshipGraph

NPC / 조직 / 플레이어 관계를 하나의 관계 그래프로 통합한다.

초기에는 과도한 관계 차원을 만들지 않는다. 기본 `score`/`mode`/`lastDay` 등 최소 구조를 쓰고,
실제 게임 요구가 생길 때 `trust`/`fear`/`respect` 등의 차원을 추가한다.

관계가 사건/정보/목표/대화/성장에 영향을 줄 수 있도록, Condition에서 관계를 참조할 수 있어야 한다.

## 13. Fact / Rumor

세계의 진실(`Fact`)과 행위자가 알고 있거나 믿는 주장(`Rumor`)을 분리한다.

- `Fact` = 세계의 실제 상태
- `Rumor` = 행위자가 알고 있거나 믿는 주장 (틀릴 수 있음)

실제 진실은 플레이어 view에 직접 노출하지 않는 방향으로 설계한다 (서버 권위 구조로 향후 전환할
수 있도록). 프로토타입에서는 같은 엔진을 브라우저에서 실행하지만, 데이터 모델상 Fact와 플레이어
지식(Rumor)은 분리한다.

## 14. 자아 / 인간관계

플레이어의 강함은 단순 숫자 상승만을 의미하지 않는다. 장기적으로 성장 과정에서 자아 탐색/변화와
인간관계가 상호작용할 수 있어야 한다.

다만 현재 Core Prototype 단계에서는 별도의 거대한 '자아 시스템'을 만들지 않는다. 필요한 최소 상태와
확장 지점만 확보하고, 실제 자아 콘텐츠는 세계관 설계 이후 추가한다.

## 15. Multiverse

현재 구현하지 않는다. 다만 모든 세계 데이터에 `worldId`를 사용할 수 있도록 한다.

장기적으로 세계 A → 세계 B → 세계 C가 하나의 다중차원 구조에 편입될 수 있는 데이터 경계를
유지한다.

V1의 `world.continuity` 구현은 재사용하지 않는다 (2절 참고).

## 16. 사망

프로토타입의 사망 처리는 **C안**으로 확정한다.

```
사망 → 현재 세계는 유지 → 새로운 캐릭터 시작
```

단, 구체적으로 무엇을 계승하는지(지식/관계/성장 등)는 아직 시스템 계약에서 확정하지 않는다.
세계 이동과 사망의 계승 규칙 차이는 별도 설계 단계에서 결정한다.

## 17. V2 테스트 규칙

- 위치: `tests/v2/` (core 엔진 테스트), 브라우저 테스트는 별도 파일(`*.spec.js`)로 분리한다.
- 실행: `node tests/v2/run.js`
- `tests/v2/run.js`는 현재 scaffold 상태로 유지한다 (아직 V2 테스트가 없으면 "실행할 V2 테스트
  없음"으로 보고하고 exit 0).
- **V2 테스트가 실제로 존재하기 시작한 이후에는 테스트 0개를 성공으로 간주하지 않는다.** 즉,
  `web/v2/**` 코드가 하나라도 커밋되는 시점부터는 그 코드를 검증하는 `tests/v2/` 테스트가 최소 1개
  이상 존재해야 하며, 테스트 없이 코드만 추가된 상태를 통과로 보고하지 않는다 (이 규칙은
  `run.js`의 "0개=성공" 로직을 대체하는 것이 아니라, 코드 존재와 테스트 존재를 연결하는 리뷰
  기준이다).
- V1 CI(`.github/workflows/phase251-check.yml`)는 건드리지 않는다.
- 최소한 다음 검증 영역을 준비한다: deterministic seed, Condition, Effect, check(), step(), state
  immutability, 성장, 관계, 사건, 저장/복원. 영역별 합격 기준은 `docs/v2/architecture/CORE_CONTRACTS.md`
  13절을 따른다.
- 테스트 fixture(`tests/v2/fixtures/`)는 추상 ID(`stat_a`, `loc_1` 등)만 쓰는 합성 데이터로 작성하며,
  세계관 콘텐츠로 취급하지 않는다. 실제 세계관 데이터를 테스트 fixture로 만들지 않는다.
- 브라우저 테스트는 Core engine 테스트와 분리한다.

## 18. 브라우저 baseline

현재 V1 browser smoke(`tests/phase255-browser.spec.js`, `tests/phase291-browser-long-play.spec.js`)가
`favicon.ico` 404 콘솔 로그 때문에 실패하는 것은 **V1 baseline의 기존 문제**로 기록한다. V1 파일을
수정해서 해결하지 않는다.

V2 회귀 테스트에서는 이 favicon 404를 성공 기준으로 만들지 않는다 (예: "콘솔 에러 0건"을 그대로
가져오면 항상 실패하므로, V2 browser smoke는 이 알려진 404를 명시적으로 제외하거나 별도로 판단한다).

V2 browser smoke를 만들 때는 실제 V2 진입점에 필요한 리소스 오류와 게임 런타임 오류를 구분한다.

## 19. v1-final 태그 (재확인)

`v1-final`은 현재 `54593cb`를 가리키는 기존 기준 태그이며, V2에서는 이를 회귀 기준점으로 사용한다.
로컬 annotated tag와 원격 lightweight tag의 객체 차이는 기록만 하고 지금 해결하지 않는다 (1절 참고).

## 20. V2 개발에 사용할 디렉터리 구조 (제안, 아직 미생성)

```
web/v2/
  core/            # 순수 엔진 (step, Condition/Effect/check, RNG 등) — DOM/browser API 의존 금지
  data/            # JSON 우선 데이터 정의
  ui/              # 브라우저 UI (engine을 소비하는 바깥 계층)
tests/v2/          # V2 전용 core/브라우저 테스트 (실행 경로만 생성됨)
docs/v2/           # V2 설계 문서/ADR
  architecture/    # 기술 계약 (CORE_CONTRACTS.md)
```

`worker/`, `server/`, `storage/`는 실제 구현이 필요해지는 시점에 추가한다. `web/v2`는 아직
생성하지 않았다.

## 21. Definition of Done (V2 작업 단위 공통, AGENTS.md 상위 규칙에 종속)

1. 회귀 기준점(`v1-final` = `54593cb`)과 비교했을 때 V1 동작 회귀가 없다.
2. `node tests/v2/run.js` 통과. `web/v2/**` 코드가 존재하는 시점부터는 그 코드를 검증하는 V2
   테스트가 최소 1개 이상 함께 존재한다 (17절).
3. V1 CI에 포함된 회귀와 `tests/*.js` 41개 전체가 통과한다 (V1 CI가 실제로 실행하는 범위와
   전체 회귀 테스트 범위가 다르다는 점에 유의 — 전체 41개 기준으로 판단한다).
4. V1 런타임 파일을 수정하지 않았다 (2절 — 예외 없음).
5. 해당 작업이 사람의 검토와 승인을 받았다 (자동 commit/merge/push 없음).

## 22. 현재 단계의 금지사항

다음은 아직 하지 않는다. 이번 문서/테스트 스캐폴딩 확정 작업의 목적은 **V2 개발 규칙과 테스트
환경을 확정하는 것**이며, 실제 구현은 포함하지 않는다.

- `rules.js` 작성
- `engine.js` 작성
- GrowthSystem 작성
- World 작성
- Case 작성
- Skill 작성
- Item 작성
- NPC 작성
- RelationshipGraph 구현
- 서버 구현
- IndexedDB 구현
- Worker 구현
- 세계관 창작 (콘텐츠 데이터 포함)
