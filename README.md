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
  `web/v2/data/world.js` 1개 파일이다(콘텐츠가 실제로 커질 때만 분리한다). 브라우저 진입점은
  `web/v2/index.html` + `web/v2/ui/app.js`(V2-Core-23) — 엔진/저장/데이터 공개 API 위의 얇은
  어댑터 하나뿐이며, `state`/`action`/`check`/Condition·Effect 세만틱스를 재구현하지 않는다.
  - `rng.js` — FNV-1a 해시, 시드 파생, 결정론적 난수. **보호 파일**(모든 라운드에서 수정 금지).
  - `rules.js` — `evaluateCondition`, `applyEffects`/`applyEffectList`, `check()`,
    `validateData()`. Condition(25개 op + `handler`)과 Effect(20개 op + `handler`) DSL,
    판정(주사위+modifier+등급) 로직, 콘텐츠 데이터 정적 검증기가 모두 여기 있다.
  - `engine.js` — `SCHEMA_VERSION`, `createInitialState`, `step`, `view`, `migrateState()`,
    `validateState()`, `checkDataCompatibility()`(D-68 — state가 현재 데이터팩과 호환되는지 판정하는
    순수 함수). 행동 처리 파이프라인(§2.5, 11단계: 스키마 검사 → action 형태 검사 →
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
- **테스트 실행**: `node tests/v2/run.js` — `tests/v2/*.test.js` 8개 파일(core/effects/rules/
  storage/data-world/data-world-lifecycle/save-compat-view/save-compat-policy)을 모두 실행하고
  `V2 tests: N/N passed`를 출력한다. **보호 파일**(수정 금지). `data-world.test.js`,
  `data-world-lifecycle.test.js`, `save-compat-view.test.js`, `save-compat-policy.test.js`가 실제 세계관
  데이터(`web/v2/data/world.js`)를 쓰는 테스트 파일이다(DEVELOPMENT_RULES §17 — 다른 테스트는 여전히
  추상 ID 합성 fixture만 쓴다). 실제 IndexedDB/브라우저를 쓰는 smoke는 별도로 `npx playwright test
  tests/v2-storage-browser.spec.js tests/v2-data-world-browser.spec.js tests/v2-ui-browser.spec.js
  tests/v2-ui-lifecycle-browser.spec.js tests/v2-ui-view-boundary-browser.spec.js
  tests/v2-ui-save-compat-browser.spec.js tests/v2-ui-canonical-browser.spec.js
  tests/v2-ui-information-browser.spec.js tests/v2-ui-consequence-browser.spec.js
  tests/v2-ui-faction-browser.spec.js tests/v2-ui-persistence-browser.spec.js
  tests/v2-ui-successor-browser.spec.js tests/v2-ui-successor-gate-browser.spec.js
  tests/v2-ui-succession-browser.spec.js tests/v2-ui-core-semantics-browser.spec.js tests/v2-ui-case-completion-browser.spec.js
  tests/v2-ui-golden-browser.spec.js`로 실행한다(Node 테스트는 IndexedDB를 mock하는 새 의존성을
  추가하지 않고 순수 함수만 검증한다). V1 회귀는 기존과 동일하게 `tests/*.js`(`.spec.js` 제외)
  41개를 개별 실행해 41/41을 확인한다. CI(`Unit & regression`/`Browser smoke`)가 두 계층 모두
  매 PR마다 자동으로 검증한다.
- **금지 사항**: 새 npm 의존성 추가 금지, 루트 `package.json` 생성 금지(V1의 CommonJS 테스트가
  깨짐), DOM/`window`/`Date.now`/`Math.random`/`indexedDB`/`fetch` 등 호스트 API를 엔진 코드
  (`web/v2/core/*`)에서 사용 금지 — Node 22.12+의 ESM 자동 감지만으로 별도 빌드 설정 없이 동작한다.
  저장 어댑터(`web/v2/storage/idb.js`)는 코어 밖이므로 IndexedDB/`Date.now` 사용이 허용된다.
- **저장 계층**: 구현 완료(D-63/D-64, V2-Core-21) — IndexedDB DB명 `txtrpg_v2`, 스토어 `saves`
  (keyPath `slot`), V1의 `AnonymousChroniclesDB`/`anonymous_chronicles_*` 키와 완전히 분리된
  네임스페이스를 쓴다. 저장소는 현재 데이터팩을 모르므로 호환성은 판정하지 않는다 — 다른 데이터팩으로
  만든 save를 조용히 실행하지 않도록, 현재 팩을 가진 caller(UI)가 로드 경계에서
  `checkDataCompatibility`로 거부한다(D-68).

### 현재 진행 단계 (V2-Core-01 ~ V2-Core-40 완료)

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
  경로를 실제로 검증한다. V2-Core-25에서 같은 데이터팩에 이미 구현된 mechanics만 추가로 연결했다:
  긴 action 2개의 `minutes`(시간 진행), 마을 행동 2개의 `location` 조건(위치 제약 — 하나는
  `showWhenLocked`), 폐허에서 `cooldown`으로 반복 발동하는 `data.events` 1개(`hp` Effect — 3번 맞으면
  사망), 사망 후 `rules.succession`(새 캐릭터에게 `money`+`narrate`). 새 엔진 semantics는 없다.
- **최소 브라우저 진입점**: `web/v2/index.html` + `web/v2/ui/app.js`(V2-Core-23)가 위 콘텐츠를
  실제 화면/입력에 연결한다 — 새 게임/저장/불러오기, 이동(`evaluateCondition`으로 location
  `links[*].requires`를 재평가해 노출 — 엔진이 이미 하는 것과 동일한 평가, 새 evaluator 아님),
  행동 수행, 대기, 선택지(`choice`/`newCharacter` pending) 처리를 포함한다. UI가 들고 있는 상태는
  `state` 자체(엔진이 반환한 그대로)·`worldData`·현재 저장 슬롯·재진입 방지 플래그·표시용 로그뿐이며,
  매 렌더마다 `view(state, worldData)`를 새로 계산한다(D-06/D-15 — 잠긴 행동의 사유는 `view()`가
  원래 노출하지 않으며, UI도 이를 우회하지 않고 그대로 따른다). V1과 완전히 분리된
  `tests/v2-ui-browser.spec.js` 브라우저 smoke가 CI(`Browser smoke`)에서 실행된다.
  `tests/v2-ui-lifecycle-browser.spec.js`(V2-Core-25)는 위치 제약/시간 진행/이벤트/HP 감소/사망/
  `newCharacter` UI/succession과 그 상태들의 save-load를 실제 브라우저로 검증한다.
  V2-Core-29에서 canonical 루프를 넓혔다(마을 → 시장에서 등불 → 폐허 조사 → 함정 HP 손실 → 마을에서
  휴식으로 회복): `act_buy_lantern`은 `loc_market`, `act_investigate_ruins`는 `loc_ruins`에서만
  실행되고(기존 `location` Condition), 새 `act_rest_village`는 기존 `hp` Effect(양수 add, max clamp)로
  회복한다. 죽은 actor는 엔진의 pending/dead 게이트가 막아 회복 행동으로 되살릴 수 없다.
  `tests/v2-ui-canonical-browser.spec.js`가 이 루프를 실제 브라우저로 검증한다.
  V2-Core-30에서 정보 흐름을 실제 플레이에 연결했다(원로 대화 → 소문 → 시장/등불 → 폐허 → 조사 → 소문 확인
  → 대면): `act_investigate_ruins`는 원로에게서 `rum_ruins_secret`을 들었을 때만 실행되고(기존 `rumor`
  Condition — player 문맥에서 허용됨, 진실인 `fact`만 제한), 조사에 성공하면 같은 소문을 관찰 모드로
  다시 배워(기존 `rumor` Effect) 두 번째 출처가 기록된다(`confirmations` 2). 안부만 물은 플레이어는 조사를
  할 수 없지만 원로에게 다시 물으면 열리므로 막다른 길은 없다. UI는 `knowledge`를 화면에 그리지 않는다 —
  플레이어는 로그 문장과 "어떤 행동이 보이는가"로 정보를 얻는다. `tests/v2-ui-information-browser.spec.js`가
  이 흐름을 실제 브라우저로 검증한다.
  V2-Core-31에서 정보가 관계와 결과로 이어지게 했다(조사 확인 → 원로에게 보고 → 대면): 조사가 확인되면 원로
  대화에 세 번째 선택지 "조사에서 알아낸 것을 전한다"가 생기고(선택지 `requires` + 기존 `flag` Condition),
  고르면 원로의 relation edge에 점수/`cooperation`/`confidant` 태그가 기록된다(기존 `relation` Effect).
  대면에 성공하면 그 태그를 읽는 `if`가 두목에게 추가 타격을 준다(기존 `relation` Condition). 보고는 선택
  사항이며 대면의 접근 조건과 check는 그대로다 — 보고하지 않은 기존 경로의 결과는 변하지 않는다. 점수가
  아니라 태그를 읽는 이유는 원로 대화가 무료이고 반복 가능해서 점수는 정보 없이도 쌓을 수 있기 때문이다.
  `tests/v2-ui-consequence-browser.spec.js`가 이 흐름을 실제 브라우저로 검증한다.
  V2-Core-32에서 관계가 조직으로 이어지게 했다(원로의 뒷받침 → 도적단 → 원로 선택지): 보고한 뒤 대면에 성공하면
  같은 분기가 도적단 조직의 플레이어에 대한 edge(`org_bandits` → self, `cowed` 태그)도 기록하고(기존 `relation`
  Effect — 조직은 NPC와 같은 relation edge의 끝이며 ID 접두어로만 구분된다), 원로 대화에 네 번째 선택지 "도적단
  잔당의 처분을 원로에게 맡긴다"가 그 edge와 두목의 `member` 태그(조사가 남긴 것)를 기존 `relation` Condition으로
  읽어 열린다. 고르면 두목의 조직 소속이 사라져(`untag`) 선택지가 스스로 닫힌다. 보고하지 않은 기존 대면 경로는
  이벤트 목록까지 그대로다. `tests/v2-ui-faction-browser.spec.js`가 이 흐름을 실제 브라우저로 검증한다.
  V2-Core-33에서 그 결과가 시간이 지난 뒤 다른 장소에서 드러나게 했다(원로의 결정 → 시장): `data.events`의
  `evt_market_reopens`(`once`)가 도적단이 `cowed`이고 두목이 더 이상 조직원이 아닐 때, 그 뒤 어느 step에서든 플레이어가
  시장에 서 있으면 발동해 상인들의 사례(`money` +3)를 준다. 관계 edge는 시간이 지나도 변하지 않고(relation rule이
  없다) `state.fired`가 두 번 주는 것을 막는다. `cowed` edge는 행동한 캐릭터의 것이라 후계자는 받지 못한다.
  `tests/v2-ui-persistence-browser.spec.js`가 이 흐름을 실제 브라우저로 검증한다.
  V2-Core-34에서 무엇이 캐릭터의 것이고 무엇이 세계의 것인지를 실제 state로 가렸다(D-70): actor 소유 상태·`knowledge[actorId]`·한쪽 끝이
  `player_<n>`인 relation edge는 그 캐릭터의 것이고, `flags`/`cases`/`facts`/`fired`/`time`과 양 끝이 세계 개체인 edge는 세계의 것이며 후계자가
  시작해도 하나도 바뀌지 않는다. 세계 상태만 읽는 원로 선택지 "도적단의 소식을 묻는다"가 행동한 캐릭터와 그 후계자 모두에게 제안되고(다른 이력에서는
  누구에게도 아님), 개인 결정은 후계자에게 제안되지 않는다. `tests/v2-ui-successor-browser.spec.js`가 실제 사망 → "새 캐릭터로 시작" → 불러오기를
  실제 브라우저로 검증한다.
  V2-Core-35에서 그 경계의 누수 하나를 막았다: 보고 선택지와 대면 행동이 세계 flag `ruins_secret_confirmed`를 개인 정보처럼 읽어 조사한 적 없는
  후계자도 통과할 수 있었다. 이제 두 관문은 그 캐릭터 자신의 증표 `item_relic`(성공한 조사만 조사한 캐릭터의 인벤토리에 쓴다)을 요구하고, 후계자는 세계의
  역사(소식 선택지)는 제안받되 보고/대면은 직접 조사해 증표를 얻어야 열린다. `tests/v2-ui-successor-gate-browser.spec.js`가 이를 실제 브라우저로 검증한다.
  V2-Core-36은 코드나 콘텐츠를 바꾸지 않고 계승을 실제 state로 조사했다(D-71): 후계자가 전 캐릭터에게서 받는 것은 없고(고정 `money +3`뿐), 세계 필드는 succession이 하나도
  바꾸지 않는다. 시장 보상은 현재 플레이어 자신의 `cowed` edge와 세계 전체의 `once`로 정해져, 전 캐릭터가 먼저 받았거나 받기 전에 죽었을 때의 결과를 테스트로 고정했다(새 semantics를
  정하지 않음). `tests/v2-ui-succession-browser.spec.js`가 실제 사망 → 후계자 → 시장 → 저장/불러오기를 실제 브라우저로 검증한다.
  V2-Core-37은 역시 코드/콘텐츠를 바꾸지 않고 미결 세 항목(`completeWhen`, relation rule `when`, `facts[*].initial`)을 다시 추적했다(D-72): 소비 코드는 여전히 검증기뿐이고 실제 팩은 쓰지
  않으며, 같은 일을 하는 `data.events`가 이미 있어 "전용 경로를 둘 것인가"가 첫 결정이다. `facts[*].initial`은 seed 입력(문자열 `worldSeed` / `rng.seed` / 숫자)이 미정이다.
  `tests/v2/core-semantics-gap.test.js`와 `tests/v2-ui-core-semantics-browser.spec.js`가 현재 동작을 고정한다(새 semantics를 구현하는 테스트는 아님).
  V2-Core-38은 `completeWhen`을 결정했다(D-73): 활성화하지 않는다. `data.events`의 trigger + `case` Effect가 같은 일을 하고 전이 Effect, `check`/`outcomes`, `once`/`cooldown`까지 더 표현력이 크며,
  전용 evaluator는 연쇄 1단계 제한과 충돌하거나 별개의 순서 규칙을 만든다. 그래서 `completeWhen`은 모양만 검사하는 예약 필드로 남고 엔진/콘텐츠는 바뀌지 않았다.
  `tests/v2/case-completion.test.js`와 `tests/v2-ui-case-completion-browser.spec.js`(실제 IndexedDB, 페이지 새로고침 포함)가 그 전제를 고정한다.
  V2-Core-39는 relation rule을 결정했다(D-74): 역시 활성화하지 않는다. 관계는 `relation` Effect로만 바뀌고 시간이 지나도 저절로 감쇠하지 않는다. V1의 관계 규칙 모양(이름이 정해진 edge, 하루 한 번,
  세계 상태에 따른 분기)은 `data.events`와 `day` selector·`signal` 카운터로 정확히 표현되고, event로 표현할 수 없는 것은 여러 edge에 걸친 규칙뿐인데 그 수요가 없다.
  `tests/v2/relation-rules.test.js`가 그 전제와 저작 패턴을 고정한다.
  V2-Core-40은 계약 §13.2의 golden 테스트를 구현했다(D-75): 추상 ID 합성 fixture(`tests/v2/fixtures/golden-path.json`)의 고정 seed·action 시퀀스가 만드는 step별 `{state, events}`와
  최종 state의 fingerprint를 기록값과 비교한다. 엔진 변경이 결과를 바꾸면 실패하고, 의도된 변경일 때만 `node tests/v2/golden.test.js --print`로 사유와 함께 갱신한다.
  `tests/v2-ui-golden-browser.spec.js`는 같은 fixture를 실제 Chromium에서 돌려 지금의 Node 값·기록값과 step마다 맞춘다(§2.7의 "서버-클라이언트 결과 일치").

### 이후 진행 단계

- **V2-Core-24 조사 결과** (코드 변경 없음, 상세는 `CORE_CONTRACTS.md` D-66/D-67): 플레이 루프를
  막는 core gap은 없다. `handler`와 D-09는 의도적 미구현(D), `migrateState`는 이미 구현됨(A),
  case `completeWhen` 자동 평가·relation rule 실행·`data.facts[*].initial` 시딩은 각각 새 설계 결정이
  필요하다(C) — 실제 콘텐츠가 필요로 하기 전에는 구현하지 않는다. 실제 gap은 데이터팩 쪽이었다: action에
  시간/위치 제약이 없고 `events`/HP/`succession` 콘텐츠가 없어 day/trigger 파이프라인과 사망·새 캐릭터
  경로가 실제 콘텐츠에서 도달 불가였다.
- **V2-Core-25 결과**: 위 데이터팩 gap을 이미 구현된 계약만으로 채웠다(시간/위치/이벤트/HP·사망/
  succession 모두 구현, 새 D-decision 없음, 엔진 코드 변경 없음). 사망 → `newCharacter` UI 경로가 처음으로
  실제 브라우저에서 실행·검증됐다.
- **V2-Core-26 결과** (엔진/저장/UI 코드 변경 없음, 테스트와 문서만 추가, 상세는 `CORE_CONTRACTS.md`
  D-66/D-67의 후속 노트): 저장 provenance와 `view()` 경계를 실제 함수 호출로 조사했다. D-66 — `dataRef`/
  `worldId`의 의미와 `migrateState`/`validateState`/`validateData`의 책임 경계는 확정된 사실로
  기록했고, 불일치 save의 비교 기준·처리 정책·검사 위치는 계약이 정하지 않아 C로 남겼다(임의로 throw/
  migration/fallback을 만들지 않았다). 새 gap: `version`이 없는 팩은 플레이는 되지만 저장할 수 없다(C).
  D-67 — 문서는 현재 프로토타입을 브라우저에서 엔진을 실행하는 local-client 모델로 기술하고 서버 권위
  모델을 미래 확장으로만 두므로 현재 UI 구조는 문서와 일치한다(변경 없음); `view()`를 확장할지는 서버/
  Worker 경계를 실제로 만들 때 정할 C로 남겼다.
- **V2-Core-27 결과** (상세는 `CORE_CONTRACTS.md` D-68): 저장 호환성 정책을 확정하고 최소 구현했다.
  정책은 "호환되지 않는 save는 검출해서 거부하고 고치지 않는다"이다 — state의 `dataRef`(id와 version의
  정확한 일치)와 `worldId`(그 state 자신의 seed로 재계산한 값)가 현재 데이터팩에서 도출한 값과 같아야
  호환이다. 순수 함수 `checkDataCompatibility(state, data)`(engine.js)를 추가하고 UI의 `loadGame`이
  로드 경계에서 호출한다(불일치면 사유를 보여주고 불러오지 않으며 save는 삭제/수정하지 않는다). record
  헤더는 색인일 뿐 **state가 권위**이고, `migrateState`/`validateState`/저장 어댑터/`step()`은 그대로다.
  `version`이 없는 팩도 이제 저장할 수 있다(`dataRef:{id}`). 새 versioning/migration semantics는 만들지
  않았다.
- **V2-Core-28 결과** (조사만, 코드/데이터/테스트 변경 없음, 상세는 `CORE_CONTRACTS.md` D-69): 남은 미결
  core semantics 네 가지를 실제 함수 호출(Node와 실제 Chromium)로 조사했다. D-09 `maxTotalModifier`는
  의도적 미사용(D — 어떤 값을 넣어도 무시되며 실제 팩은 필요 없음), case `completeWhen`·relation rules·
  `facts[*].initial`은 각각 새 설계 결정이 필요하다(C). 기존 계약만으로 구현 가능한 항목(B)은 없었다.
  핵심 사실: 기존 event 파이프라인이 "조건이 참이면 stage 전이/관계 변경"을 이미 표현하므로
  `completeWhen`/relation rule은 전용 필드가 정말 필요한지부터 정해야 하고, `facts[*].initial`의
  `pickFrom`은 `deriveSeed`에 넘길 seed(계약은 숫자, 구현은 문자열 `worldSeed`와 그 hash `rng.seed`)에 따라
  결과가 갈린다. canonical 플레이는 이 네 가지 중 어느 것도 필요로 하지 않는다.
- **V2-Core-29 결과** (콘텐츠와 테스트만 변경, 엔진/저장/UI 코드 변경 없음, 새 D-decision 없음, 상세는
  `CORE_CONTRACTS.md` §11/§15): 데이터팩의 등불 구입과 폐허 조사를 각각 시장/폐허로 제한하고(기존
  `location` Condition) 마을 휴식 행동 하나를 추가했다(기존 `hp` Effect). 팩 `version`은 일부러 `0.1.0`
  그대로다 — 행동 하나 추가와 실행 위치 제한뿐이라 state 모양이 변하지 않고, D-68의 정확 일치 규칙 아래
  기존 save를 불필요하게 막지 않기 위해서다. canonical path의 기존 테스트 3개 파일은 이동 단계를 넣도록
  최소한으로 고쳤다.
- **V2-Core-30 결과** (콘텐츠와 테스트만 변경, 엔진/저장/UI 코드 변경 없음, 새 D-decision 없음, 상세는
  `CORE_CONTRACTS.md` §11/§15): 정보 흐름(원로 대화 → 소문 → 조사 → fact/flag → 대면)을 계약 → runtime →
  데이터 → 테스트 → 브라우저 순으로 추적했다. `rumor` Condition과 selector는 이미 player 문맥에서 소비할 수
  있었고(D-24) 데이터팩이 소문을 기록만 하고 있었다는 것이 실제 gap이었다. 등불/위치처럼 이미 있는 조건과
  겹치지 않는 조건이 되도록 조사 행동에만 소문 조건을 붙였다. 팩 `version`은 `0.1.0` 그대로다(state 모양
  변화 없음, D-68 호환성 통과 — 이전 팩으로 만든 save는 그대로 불러와지고, 소문이 없으면 조사가 다시 원로와
  대화한 뒤에 열린다). canonical path를 밟는 기존 테스트 5개 파일(Node 2개, 브라우저 spec 3개 — #89의 spec 포함)은
  원로 대화 단계를 앞으로 옮기도록만 고쳤다. `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은
  결정하지 않았다.
- **V2-Core-31 결과** (콘텐츠와 테스트만 변경, 엔진/저장/UI 코드 변경 없음, 새 D-decision 없음, 상세는
  `CORE_CONTRACTS.md` §11/§15): 정보 → 관계/선택 → 결과 경로를 계약 → runtime → 데이터 → 테스트 → 브라우저
  순으로 추적했다. `relation` Condition과 선택지 `requires`는 이미 player 문맥에서 쓸 수 있었고, 원로 relation
  (+5/+1)을 읽는 곳이 없다는 것이 실제 gap이었다. 기존 테스트는 하나도 수정하지 않았다(보고하지 않는 경로가 그대로
  유효하므로). 팩 `version`은 `0.1.0` 그대로다(state 모양 변화 없음, D-68). `facts[*].initial`/relation rule/
  `completeWhen`/D-09/D-67은 결정하지 않았다.
- **V2-Core-32 결과** (콘텐츠와 테스트만 변경, 엔진/저장/UI 코드 변경 없음, 새 D-decision 없음, 상세는
  `CORE_CONTRACTS.md` §11/§15): 관계 → 조직 → 사건 경로를 계약 → runtime → 데이터 → 테스트 → 브라우저 순으로
  추적했다. 조직 edge는 일반 relation edge이고 Condition이 player/world 문맥 모두에서 읽을 수 있으며, `data.events`
  trigger도 같은 step의 관계/태그 변화를 본다(probe로 확인). 조사가 남기는 두목의 `member` 태그를 읽는 곳이 없다는
  것이 실제 gap이었다. 기존 테스트는 하나도 수정하지 않았다. 팩 `version`은 `0.1.0` 그대로다(state 모양 변화 없음,
  D-68). `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지 않았다.
- **V2-Core-33 결과** (콘텐츠와 테스트만 변경, 엔진/저장/UI 코드 변경 없음, 새 D-decision 없음, 상세는
  `CORE_CONTRACTS.md` §11/§15): 사건 결과의 지속성을 계약 → runtime → 데이터 → 테스트 → 브라우저 순으로 추적했다.
  relation/flag/case/`fired`는 모두 일반 state라 시간이 지나도 그대로이고, 나중 step의 event가 그것을 읽는다(probe와
  테스트로 확인). 기존 테스트 중 `data-world-lifecycle.test.js`의 "이 팩의 event는 하나뿐"이라는 데이터 모양 단정 한 줄만
  새 event를 반영하도록 고쳤다(동작 회귀가 아님). 팩 `version`은 `0.1.0` 그대로다(state 모양 변화 없음, D-68).
  `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지 않았다.
- **V2-Core-34 결과** (콘텐츠와 테스트만 변경, 엔진/저장/UI 코드 변경 없음, 상세는 `CORE_CONTRACTS.md` D-70/§11): 개인 귀속 상태와 세계 귀속 상태를
  A/B/C/D로 분류해 D-70에 기록했다(새 semantics는 결정하지 않은 조사 기록). B 하나만 구현했고 C 네 가지는 구현하지 않았다: 후계자가 물려받는 범위,
  세계 수준 flag를 개인의 정보 관문으로 쓰는 점(후계자가 조사 없이 원로에게 "보고"할 수 있다 — V2-Core-35에서 해소), 세계 수준 보상의 수혜자, 쌓이기만 하는 죽은 캐릭터의 edge.
  기존 테스트는 하나도 수정하지 않았다. 팩 `version`은 `0.1.0` 그대로다(state 모양 변화 없음, D-68). `facts[*].initial`/relation rule/`completeWhen`/
  D-09/D-67은 결정하지 않았다.
- **V2-Core-35 결과** (콘텐츠와 테스트만 변경, 엔진/저장/UI 코드 변경 없음, 상세는 `CORE_CONTRACTS.md` D-70 후속/§11): D-70의 C(2)를 기존 contract로
  결정해 해소했다. `flag`는 계약상 세계 단위라 위반이 아니라 팩 불일치였고, 두 관문을 캐릭터 자신의 증표 `item_relic`으로 바꿨다. 소문 confidence는 옛 save를
  가두고 구제 수치는 우회를 열어 기각했다. 후계자가 물려받는 범위, 세계 수준 보상의 수혜자, 죽은 캐릭터 edge의 누적은 여전히 C다. 기존 테스트는 하나도 수정하지
  않았다. 팩 `version`은 `0.1.0` 그대로다(state 모양 변화 없음, D-68). `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지 않았다.
- **V2-Core-36 결과** (코드/콘텐츠 변경 없음, 새 테스트/문서/CI만, 상세는 `CORE_CONTRACTS.md` D-71/§9/§11): 후계자의 상태를 World/Personal/Inherited/Undecided로 분류했고
  (Inherited는 없음), 세계 보상의 귀속을 기존 contract가 결정하는 현재 동작으로 고정했다. B(구현 가능) 항목은 없었다. C 네 가지는 결정하지 않고 선택지와 영향을 D-71에 남겼다:
  후계자가 받을 범위, 세계 보상의 귀속과 `once`의 단위, 개인 행동이 세계 edge(`member`)를 되돌리는 것, 죽은 캐릭터 기록의 누적. 기존 테스트는 하나도 수정하지 않았다. 팩 `version`은
  `0.1.0` 그대로다(state 모양 변화 없음, D-68). `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지 않았다.
- **V2-Core-37 결과** (코드/콘텐츠 변경 없음, 새 테스트/문서/CI만, 상세는 `CORE_CONTRACTS.md` D-72/§8.1/§11): 세 항목을 세부 질문별로 A/B/C/D로 나눴다. B(구현 가능)는 없다 —
  조건부 case 전이와 관계 변화는 지금 `data.events`로 표현된다. C: 전용 `completeWhen` 실행, 전용 relation rule 실행, `facts[*].initial` 시딩(seed 입력 포함). 결합도가 낮아 후속 이슈를 나누도록 권한다:
  (i) `completeWhen`+relation rule의 공통 전제(event와 별도 경로를 둘 것인가)와 cadence/순서 결정, (ii) `facts[*].initial` seed 입력과 옛 save 호환, (iii) D-67, (iv) D-68. 기존 테스트는 하나도
  수정하지 않았다. 팩 `version`은 `0.1.0` 그대로다(state 모양 변화 없음, D-68). D-09/D-67은 결정하지 않았다.
- **V2-Core-38 결과** (코드/콘텐츠 변경 없음, 새 테스트/문서/CI만, 상세는 `CORE_CONTRACTS.md` D-73/§3.3/§11): `completeWhen`은 활성화하지 않는다(예약 필드, `data.events` + `case` Effect가 지원 경로).
  평가 cadence는 event 경로의 것(10단계, 수락된 모든 step 종류 뒤, id 오름차순 한 패스), 전이는 event의 `case` Effect, 같은 step 연쇄는 id 순서(고정점 없음)다. state/save/replay는 그대로다.
  relation rule `when`(D-62)과 `facts[*].initial`(D-65)은 이번에도 결정하지 않았다 — 각각 별도 이슈로 남는다. 기존 테스트는 하나도 수정하지 않았다. 팩 `version`은 `0.1.0` 그대로다(D-68).
- **V2-Core-39 결과** (코드/콘텐츠 변경 없음, 새 Node 테스트/문서만, 상세는 `CORE_CONTRACTS.md` D-74/§3.3/§7.4/§11): relation rule은 활성화하지 않는다(예약 필드, `data.events` + `relation` Effect가
  지원 경로). 저작 주의: event 안의 `relation` Effect는 `from`을 명시한다(기본값 `target`이 event 문맥에 없어 조용히 건너뛰어진다). 여러 edge에 걸친 관계 규칙과 엔진이 도는 NPC 자율 행동은
  실제 수요가 생길 때 새 scheduler 설계(설계 게이트, 인간 결정)로 연다. 기존 테스트는 하나도 수정하지 않았다. 팩 `version`은 `0.1.0` 그대로다(D-68).
- **V2-Core-40 결과** (테스트/CI/문서만, 엔진·콘텐츠 변경 없음, 상세는 `CORE_CONTRACTS.md` D-75/§13.2): golden 테스트(Node)와 Node↔Chromium 일치·실제 IndexedDB 이어 실행(브라우저)을
  추가했다. 변이 5개(주사위, trigger 순서, Resolvable 시간 순서, attempts, stat 수정자)를 모두 잡고 키 생성 순서만 바꾼 리팩터는 통과한다. §13.2의 "seed 차이"/"파생 스트림 격리"는 world-generation
  소비자가 없어 여전히 쓸 수 없다(`facts[*].initial` 결정에 묶임). 기존 테스트는 하나도 수정하지 않았다.
- **다음 issue 후보**: (1) 실제 콘텐츠가 요구할 때 남은 C 항목을 각각 별도 D-decision으로 확정 — `completeWhen`(D-73)과 relation rule(D-74)은
  "event로 쓴다"로 결정했고, 남은 core 결정은 seed 입력(`facts[*].initial`, D-65/D-72)이다.
  (2) 콘텐츠 결정(core와 분리): HP 회복과 위치 제약(V2-Core-29), 소문 → 행동 연결(V2-Core-30)은 처리했다.
  V2-Core-31에서 원로 relation을 읽는 지점을 만들었다. 남은 후보 — 무료·반복 가능한 원로 대화로 relation 점수를
  정보 없이 쌓을 수 있는 점(지금은 태그를 읽어 우회했지만 다른 콘텐츠가 점수를 읽으면 문제), 후계자가 물려받는
  범위, 세계 수준 보상의 수혜자(D-70의 C — 조사만 했고 결정하지 않았다: 세계 상태를 읽으면 후계자가 받지만 `once`가 세계 전체라 먼저 받은 쪽이
  있으면 못 받는다; 세계 flag를 개인 관문으로 쓰던 누수는 V2-Core-35에서 막았다), 조사를 다시 하면
  `member` 태그가 다시 붙어 조직 선택지가 다시 열릴 수 있는 점, `knowledge`를 화면에 보여줄지 (UI 결정), `data.rules.rumor` 증감폭과 `minConfidence`를 함께 쓰는 콘텐츠. 부활 semantics를
  정의할지는 여전히 C다. (3) 서버/Worker 경계를 실제로 만들게 될 때 `view()` 확장
  (D-67)과 UI 외 caller의 호환성 검사 호출. (4) 실제로 데이터팩 version을 올려 옛 save가 문제가 되는
  시점의 version 범위/data migration 결정(D-68 (a)). (5) 별도 유지보수: V1 `phase255` 브라우저 테스트의
  타이밍 race 안정화.

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
