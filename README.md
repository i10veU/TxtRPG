# TxtRPG

대규모 오프라인 우선 텍스트 RPG 프로젝트.

## 현재 설계 방향

- 플레이어가 세계를 탐험하며 스스로 목표를 발견하는 구조
- NPC가 플레이어와 무관하게 일정·목표에 따라 행동하는 세계 시뮬레이션
- 사건을 Trigger → Event → Consequence 구조로 연결
- 지역·인물·조직·경제·아이템·역사를 서로 연결하는 설정망
- Microsoft Edge 로컬 환경을 기준으로 IndexedDB + Web Worker + Canvas 기반 확장
- 현재 web/에는 바로 실행 가능한 TXT RPG 코어를 유지하며 이후 오프라인 엔진으로 확장

## V2 코어 재작성 (`feature/v2-core`, 진행 중)

기존 V1(`web/core`, `web/data`, `web/ui`, `web/worker`, `web/storage`, `web/index.html`, `web/game.js`,
`tests/*.js`)은 그대로 유지하면서, 순수 함수 기반의 새 게임 엔진을 별도 트리(`web/v2/`)에서
계약(contract) 우선 방식으로 병행 개발하고 있다. V1과 V2는 서로 다른 브랜치 전략과 개발 규칙을
따르며, V2 작업은 V1 런타임 코드를 절대 수정하지 않는다.

### 왜 다시 만드는가

- V1은 IIFE + `window` 전역 네임스페이스 구조라 Node 테스트가 `vm` 컨텍스트를 거쳐야 했다. V2는
  ES Module만 사용해 브라우저와 Node 테스트가 같은 소스를 그대로 import한다.
- 엔진 로직을 `state, action, data -> {state, events}` 형태의 순수 함수로 고정해, 결정론(같은
  seed·같은 액션 시퀀스는 항상 같은 결과)과 재현 가능한 테스트를 구조적으로 보장한다.
- 새 콘텐츠(사건/성장/아이템/관계)를 추가할 때 엔진 코드를 바꾸지 않도록, 게임 규칙을 선언형
  Condition/Effect DSL과 JSON 데이터로 분리한다.

### 자세한 설명 — 아키텍처

- **위치**: 엔진 코어는 `web/v2/core/{rng,engine,rules}.js` 3개 파일만 사용한다(Ponytail 원칙 —
  실제 필요가 생기기 전까지 파일을 분리하지 않는다). 저장 계층은 코어 밖의 별도 어댑터
  `web/v2/storage/idb.js` 1개 파일이다 — 엔진은 이 파일을 import하지 않는다. 세계관 데이터는
  `web/v2/data/world.js` 1개 파일이다(콘텐츠가 실제로 커질 때만 분리한다).
  - `rng.js` — FNV-1a 해시, 시드 파생, 결정론적 난수. **보호 파일**(모든 라운드에서 수정 금지).
  - `rules.js` — `evaluateCondition`, `applyEffects`/`applyEffectList`, `check()`,
    `validateData()`. Condition(25개 op + `handler`)과 Effect(20개 op + `handler`) DSL,
    판정(주사위+modifier+등급) 로직, 콘텐츠 데이터 정적 검증기가 모두 여기 있다.
  - `engine.js` — `SCHEMA_VERSION`, `createInitialState`, `step`, `view`, `migrateState()`,
    `validateState()`. 행동 처리 파이프라인(§2.5, 11단계: 스키마 검사 → action 형태 검사 →
    pending/사망 게이트 → 대상 조회 → requires → 상태 복제 → check → effects/outcomes → day
    경계 → trigger → 이벤트 반환)과 사망/캐릭터 계승을 담당한다.
  - `storage/idb.js` — `save(slot, state, metadata)`/`load(slot)`/`list()`/`remove(slot)` 4개
    함수뿐인 IndexedDB adapter(Ponytail — repository/DAO 추상화 없음). `engine.js`의
    `validateState`/`migrateState`/`SCHEMA_VERSION`을 그대로 재사용해 저장/로드 경계를 검증하고,
    IndexedDB/`Date.now`를 쓰는 V2의 유일한 파일이다.
  - `data/world.js` — 첫 실제 세계관 데이터팩("변경 마을" 시나리오, V2-Core-22). `validateData`를
    그대로 통과하며, 엔진 코드는 전혀 바꾸지 않는다.
- **핵심 계약 문서**: `docs/v2/architecture/CORE_CONTRACTS.md`(설계 전체, D-01~D-65 결정 이력,
  §13 테스트 계약, §15 작업 이력)와 `docs/v2/DEVELOPMENT_RULES.md`(브랜치·회귀 기준·Ponytail
  원칙 등 상위 규칙 — 두 문서가 충돌하면 DEVELOPMENT_RULES가 우선한다).
- **데이터 모델**: `state`(schemaVersion/rng/time/actors/flags/signals/facts/knowledge/relations/
  cases/fired 등)와 `data`(월드 정의 — actions/choices/events/locations/growthSystems/
  characterTemplates/rules 등)를 분리하고, 둘 다 순수 JSON으로 직렬화 가능해야 한다.

### 기타 설정

- **개발 브랜치**: `feature/v2-core` (V1의 회귀 기준점 `v1-final` = `54593cb`에서 분기).
- **테스트 실행**: `node tests/v2/run.js` — `tests/v2/*.test.js` 5개 파일(core/effects/rules/
  storage/data-world)을 모두 실행하고 `V2 tests: N/N passed`를 출력한다. **보호 파일**(수정 금지).
  `data-world.test.js`가 실제 세계관 데이터(`web/v2/data/world.js`)를 쓰는 유일한 테스트 파일이다
  (DEVELOPMENT_RULES §17 — 다른 테스트는 여전히 추상 ID 합성 fixture만 쓴다). 실제 IndexedDB를
  쓰는 브라우저 smoke는 별도로 `npx playwright test tests/v2-storage-browser.spec.js
  tests/v2-data-world-browser.spec.js`로 실행한다(Node 테스트는 IndexedDB를 mock하는 새 의존성을
  추가하지 않고 순수 함수만 검증한다). V1 회귀는 기존과 동일하게 `tests/*.js`(`.spec.js` 제외)
  41개를 개별 실행해 41/41을 확인한다. CI(`Unit & regression`/`Browser smoke`)가 두 계층 모두
  매 PR마다 자동으로 검증한다.
- **금지 사항**: 새 npm 의존성 추가 금지, 루트 `package.json` 생성 금지(V1의 CommonJS 테스트가
  깨짐), DOM/`window`/`Date.now`/`Math.random`/`indexedDB`/`fetch` 등 호스트 API를 엔진 코드
  (`web/v2/core/*`)에서 사용 금지 — Node 22.12+의 ESM 자동 감지만으로 별도 빌드 설정 없이 동작한다.
  저장 어댑터(`web/v2/storage/idb.js`)는 코어 밖이므로 IndexedDB/`Date.now` 사용이 허용된다.
- **저장 계층**: 구현 완료(D-63/D-64, V2-Core-21) — IndexedDB DB명 `txtrpg_v2`, 스토어 `saves`
  (keyPath `slot`), V1의 `AnonymousChroniclesDB`/`anonymous_chronicles_*` 키와 완전히 분리된
  네임스페이스를 쓴다.

### 현재 진행 단계 (V2-Core-01 ~ V2-Core-22 완료)

- **엔진 핵심**: `state`/`action`/`event` 스키마, RNG, `step()` 11단계 파이프라인, Condition
  DSL(and/or/not/eq류 6개 + shorthand 12개 + money/rumor), Effect DSL(20개 op 전부: flag/signal/
  time/if/stat/hp/money/item/relation/skill/trait/unlock/case/exp/proficiency/fact/rumor/move/
  choice/narrate), `check()`(주사위·modifier·등급 판정), 사망/캐릭터 계승, `choose`/`pending`
  흐름, `day.started`/사건 trigger 단계, `view()`(플레이어 노출 투영) — 모두 구현·테스트 완료.
- **검증 계층**: `validateState(state)`(§2.1 불변 조건 — JSON 안전성/정수 필드/ID 형식/`seq` 금지)와
  `validateData(data)`(§11 — ID 형식, 확정된 참조 무결성, Condition/Effect op와 인자, handler
  등록/reason, player 문맥 fact 금지, Resolvable success/fail 필수, characterTemplate.locationId
  필수, CheckSpec shape, case stage `completeWhen`/relation rule `when`의 Condition shape)를
  구현했다 — 모두 순수 함수이며 런타임 세만틱스를 바꾸지 않는다. `migrateState(raw)`(D-63)로
  §10 로드 파이프라인(`migrateState → validateState → 오류 시 거부`)이 처음부터 끝까지 실제로
  연결됐다.
- **의도적으로 미구현/보류** (근거 없이 임의로 확정하지 않는다는 원칙에 따라 blocker로 유지):
  - `handler` — 선언형 op로 표현 불가능한 실제 사용례가 아직 없음(§4.4).
  - D-09(`maxTotalModifier`, 판정 modifier 총합 상한) — 밸런스 테스트 데이터 없이 cap 방식을
    정할 근거가 없음.
  - `data.cases[*].stages[*]`/`data.rules.relation.*`의 `completeWhen`/`when` **자체**는 D-61/D-62로
    "Condition 하나"까지 확정됐지만, 그 평가 시점(stage 전이 실행)과 relation rule의 effect/
    우선순위/실행 cadence는 여전히 스키마가 없다 — 사건/퀘스트/관계 시스템 설계와 함께 결정한다.
  - `data.facts[id].initial`(고정값/`pickFrom` seed 초기화, §8.1) — 이를 읽어 `state.facts`를
    채우는 런타임 코드가 아직 없다(D-65, V2-Core-22에서 재확인). `state.facts`는 지금은 오직
    `fact` Effect로만 채워진다.
  - Effect 개별 op가 참조하는 콘텐츠 ID 중 명시적 "우아한 폴백"이 있는 것들(성장 정의/아이템/
    소문/fact/case) — 존재하지 않아도 정상 동작하도록 계약이 이미 확정했으므로 검사하지 않음.
- **실제 게임 콘텐츠**: `web/v2/data/world.js`에 첫 실제 세계관 데이터팩이 생겼다(V2-Core-22) —
  "변경 마을" 시나리오 하나(world 1개, location 3개, action 5개(`choice` 1개 포함), growthSystem
  1개, item 2개, fact/rumor 각 1개, npc 2명 + org 1개). `validateData`를 그대로 통과하며(`[]`),
  `handler`/D-09/completeWhen·relation rule 실행 semantics/`data.facts[*].initial` 중 어느 것에도
  기대지 않고 이미 구현된 계약만으로 `data → createInitialState → step → view → save/load` 전체
  경로를 실제로 검증한다. `web/v2/ui/`는 여전히 생성 전이다 — 이번 단계의 목적은 UI가 아니라
  엔진/저장 계층을 실제 콘텐츠로 관통시키는 것이었다.

### 이후 진행 단계

1. `web/v2/ui/`에 V2 엔진 + 저장 어댑터 + `web/v2/data/world.js`를 소비하는 최소 브라우저
   진입점을 만들고, V1과 별도로 V2 게임플레이 브라우저 smoke 테스트를 추가한다.
2. 콘텐츠가 더 쌓이면 `handler`, `data.cases[*].stages`/`data.rules.relation.*`의 나머지 구조
   (전이 실행/effect/우선순위/cadence), `data.facts[*].initial` seed 시딩이 실제로 필요한 형태를
   확인하고 그때 각각 결정한다.
3. 실 콘텐츠가 쌓이면 D-09(modifier 상한)를 실제 밸런스 데이터로 재검토한다.

## 릴리스 기록

- [Phase 1–205 통합 릴리스 인덱스](PHASES_1_205_RELEASE_INDEX.md)
- [Phase 206–220](docs/phase206-220-release.md)
- [Phase 221–235](docs/phase221-235-release.md)
- [Phase 236–250](docs/phase236-250-release.md)
- [Phase 251 엔진화](docs/phase251-engineization.md)
- [Phase 252 NPC 자율 시뮬레이션](docs/phase252-npc-simulation.md)
- [Phase 254 NPC 틱 중복 수정](docs/phase254-npc-tick-fix.md)
- [Phase 255 브라우저 런타임 스모크 테스트](docs/phase255-browser-smoke.md)
- [Phase 256 NPC 일정 효과/알림 주기 분리](docs/phase256-npc-routine-cadence.md)
- [Phase 257 NPC 사건 Trigger 연결](docs/phase257-npc-event-triggers.md)
- [Phase 257 세력 압력과 연쇄 사건](docs/phase257-faction-world.md)
- [Phase 260 동적 곡물 경제](docs/phase260-economy-world.md)
- [Phase 261 정보·소문 시스템](docs/phase261-information.md)
- [Phase 262 NPC 목표 상태](docs/phase262-npc-goals.md)
- [Phase 263 조직 자율 의사결정](docs/phase263-organizations.md)
- [Phase 264 조직 연계 NPC 목표 동역학](docs/phase264-goal-dynamics.md)
- [Phase 265 조직 협력·충돌 관계망](docs/phase265-organization-relations.md)
- [Phase 266 조직 충돌과 사건 연결](docs/phase266-organization-events.md)
- [Phase 267 사건 Consequence와 조직 피드백](docs/phase267-case-consequences.md)
- [Phase 268 경제 압력과 시장 위기](docs/phase268-economic-pressure.md)
- [Phase 269 NPC 개인 관계망과 갈등](docs/phase269-npc-relations.md)
- [Phase 270 지역 자원과 교역로](docs/phase270-regional-economy.md)
- [Phase 271 사건 인과망과 후속 사건](docs/phase271-case-causality.md)
- [Phase 274 후속 사건 조직 목표 압력](docs/phase274-case-causality-goal-impact.md)
- [Phase 275 NPC 충돌 후속 사건](docs/phase275-npc-causality.md)
- [Phase 276 지역 사건과 장기 NPC 목표](docs/phase276-regional-goal-causality.md)
- [Phase 277 Worker/fallback reset parity](docs/phase277-reset-parity.md)
- [Phase 278 지연 사건 후폭풍 장기 검증](docs/phase278-case-aftermath-stress.md)
- [Phase 279 플레이어 목표 연쇄](docs/phase279-player-quest-chains.md)
- [Phase 280 사건 후폭풍 목표 연쇄](docs/phase280-quest-aftermath.md)
- [Phase 281 fallback reset 목표 연쇄 parity](docs/phase281-fallback-quest-parity.md)
- [Phase 282 persistence-boundary state normalization](docs/phase282-storage-normalization.md)
- [Phase 283 persistence save-boundary normalization](docs/phase283-storage-save-normalization.md)
- [Phase 284 game loop tutorial and end states](docs/phase284-game-loop.md)
- [Phase 285 terminal-state persistence](docs/phase285-terminal-persistence.md)
- [Phase 286 장기 플레이와 결말 게이트](docs/phase286-long-play-ending.md)
- [Phase 287 IndexedDB 엔티티 스냅샷](docs/phase287-storage-entities.md)
- [Phase 288 IndexedDB 엔티티 스냅샷 스트레스 검증](docs/phase288-storage-entity-stress.md)
- [Phase 289 결말 상태 저장 왕복 검증](docs/phase289-finale-storage-persistence.md)
- [Phase 290 브라우저 결말 진행·복원 검증](docs/phase290-browser-finale.md)
- [Phase 291 대표 장기 플레이 브라우저 진행](docs/phase291-browser-long-play.md)
- [Phase 292 세계 연속성/생 경계 모델](docs/phase292-world-continuity-model.md)
- [Phase 1–205 파일 목록](docs/phase1-205-file-manifest.md)

## 문서

### 아키텍처

- [오프라인 Edge RPG 아키텍처](docs/architecture/offline-edge-architecture.md)

### 세계관

- [무명의 연대기 — 세계관 설계 원칙](docs/world/world-design-principles.md)
- [세계관 연구 적용 메모](docs/world/source-analysis.md)

## Agent 개발 체계

TxtRPG는 GitHub Copilot custom agents를 역할별로 사용한다.

- `txtrpg-director`: 전체 작업 분해, 우선순위, 통합 관리
- `txtrpg-lore`: 세계관·NPC·조직·지역·사건·퀘스트·정보
- `txtrpg-engine`: 게임 상태·시뮬레이션·IndexedDB·Worker·경제·이벤트
- `txtrpg-ui`: HTML/CSS/Canvas·입력·렌더링
- `txtrpg-qa`: 테스트·회귀·브라우저 smoke·보안 검증

운영 기준은 `.github/copilot-instructions.md`, 현재 프로젝트 상태는 `PROJECT_STATE.md`에 기록한다. 각 Agent 프로필은 `.github/agents/`에 있다.

표준 개발 흐름은 다음과 같다.

`Inspect → Plan → Issue → Implement → Test → Review → Integrate → Update Project State`

Agent가 다른 Agent에게 작업을 넘겼다고 주장하는 것만으로 완료로 간주하지 않는다. 실제 변경, 테스트 결과, PR 또는 커밋이 확인되어야 한다.

## 실행

web/index.html을 Edge/Chromium 계열 브라우저에서 열면 현재 TXT RPG 프로토타입을 실행할 수 있습니다.

주요 입력 예시:
- 시장 조사
- 기록관으로 이동
- 세린과 대화
- 사건목록
- 사건분기 1
- 사건분기 1 2
- 연쇄사건
- 목표추천
- 곡물 가격
- 곡물 구매 2
- 곡물 판매 1
- 지역자원
- 목재 시세
- 어물 시세
- 목재 구매 2

## 현재 엔진 구조

web/ 아래에서 상태, 데이터, 입력, 렌더링, 저장, Worker를 분리하여 유지합니다.

- core/: 상태, 액션, NPC/세력/경제 시뮬레이션
- data/: 지역/NPC/사건 데이터
- storage/: IndexedDB 저장 계층
- worker/: 게임 시뮬레이션
- ui/: 렌더링/입력

기존 localStorage 세이브는 IndexedDB로 최초 1회 자동 마이그레이션하며 IndexedDB를 사용할 수 없는 환경에서는 기존 키를 fallback으로 사용합니다.

NPC는 플레이어의 행동과 함께 흐른 시간을 기준으로 30분 단위 자율 시뮬레이션을 수행하며, 현재 위치와 최근 행동을 UI에 표시한다.

NPC의 개인 목표는 goalState로 구조화되며 일정 진입에 따라 관련 행동의 진행도가 누적된다. 조직 압력이 목표 우선순위를 올리거나 목표를 중단시킬 수 있으며, 중단이 하루 이상 지속되면 다음 목표로 재계획한다. 목표 완료 후에도 짧은 목표 체인이 이어지며 완료·중단 이력이 저장된다.

조직은 하루에 한 번 현재 세계 상태를 평가해 독립적인 의사결정을 내린다. 상인회·경비대·기록관·농촌 대표단·여관망·노동자 조합의 결정은 시장 재고, 치안, 긴장, 행정 신뢰, 소문 압력 등에 직접 영향을 주며, 그 결과는 소속 NPC 목표의 goalPressure로도 전달된다. 조직 간 관계도 별도 상태로 계산되며 협력은 목표 압력을 높이고 충돌은 긴장을 높이면서 두 조직의 NPC 목표를 압박한다. 조직 충돌은 event signal과 소문으로 기록되고 기존 세력 충돌 사건 Trigger를 열어 플레이어 선택으로 이어진다. 사건 선택의 Consequence는 다시 조직 관계 점수와 goalPressure를 바꿔 다음 자율 행동에 피드백된다.

세력 세계 압력 계산은 NPC 시뮬레이션의 동일한 경로에서 하루 1회 수행되며 Worker와 fallback이 같은 결과를 사용한다.

NPC 일정의 생산·치안·소문 같은 효과는 활동 중인 30분 틱마다 유지하고, 일정 진입을 알리는 서술은 같은 활동에서 반복하지 않도록 분리되어 있다.

NPC 일정은 필요할 때 event signal을 생성하며, 이 신호는 기존 사건 Trigger와 연결되어 NPC의 자율 행동이 새로운 사건을 열 수 있다.

NPC event signal은 출처와 확인 횟수를 가진 소문으로도 저장되며, 여러 출처에서 같은 정황이 반복되면 정보 신뢰도가 상승한다. 플레이어는 `소문` 명령 또는 6번 정보 패널에서 이를 확인할 수 있다.

세력 관계는 곡물·치안·긴장·행정 신뢰·소문 압력에 따라 하루 단위로 변화하며, 적대 세력이 동시에 늘어나면 세력 충돌 사건이 생성된다. 충돌 사건의 선택은 다시 세력 관계와 세계 상태에 영향을 준다.

동적 경제는 곡물을 기본 시장 상품으로 사용하고, 지역 경제 모듈에서 목재·어물을 별도 지역 자원으로 확장한다. 구릉·부두의 생산량이 교역로 신뢰도와 시장 재고에 따라 이동하며 지역 자원 가격이 변한다. 가격·재고가 임계치를 넘으면 시장 위기 신호가 생성되어 상인회·농촌·노동자·여관망의 관계와 긴장·소문 압력을 변화시키며, `market-crisis` 사건으로 플레이어의 개입을 요구한다. 지역 교역로의 신뢰도가 낮아지면 `tradeRouteCrisis:*` 신호가 생성되고 `trade-route` 사건으로 연결된다. NPC 사이에도 별도 관계망이 존재하며 협력·갈등이 조직 목표 압력과 `npc-dispute` 사건으로 연결된다.

해결된 사건은 `caseHistory`에 선택과 결과를 남기며, 원 사건의 선택 결과가 다음 날 이후 후속 사건 Trigger로 이어진다. 현재 곡물 창고·교역로·세력 충돌·NPC 충돌 사건에 후속 사건이 연결되어 `연쇄사건` 명령과 8번 패널에서 인과 흐름을 확인할 수 있다. 플레이어 목표 연쇄는 후속 사건까지 진행되어 원 사건의 결과가 완료될 때까지 유지된다.

브라우저 smoke test는 실제 Chromium에서 Worker 실행, IndexedDB 저장, 액션 처리, 페이지 새로고침 후 복원을 검증한다.

## 다음 단계

1. 장기 시뮬레이션 저장/복원 스트레스 테스트와 엔티티 경계 보강
2. 플레이어 목표 연쇄를 사건 후속 결과·다단계 발견으로 확장
3. 최종 게임 루프·튜토리얼·엔딩/장기 플레이 구조 검증
4. 최종 게임 루프·튜토리얼·엔딩/장기 플레이 구조 검증

## 프로젝트 원칙

세계관 문서와 구현 문서를 분리하고, 설정은 데이터화하여 게임 엔진과 독립적으로 관리한다.
