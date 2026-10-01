# TxtRPG V2 Core 기술 계약 (구현 전 설계)

> 상태: **제안(Proposed)** — 사람 검토 후 확정한다. 이 문서는 코드를 만들지 않는다.
> 상위 규칙: `docs/v2/DEVELOPMENT_RULES.md`. 이 문서와 충돌하면 DEVELOPMENT_RULES가 우선한다.
> 목표: `State → Action → Condition → Check → Effect → Event` 계약을 구현 전에 고정해,
> 구현 이후 구조를 다시 뜯어고치지 않게 한다.

각 설계 항목에는 **이유**(왜 필요한가)와 **확장**(향후 확장에 주는 영향)을 짧게 적는다.
`D-xx`는 구현 전에 사람이 결정해야 하는 항목이며 14절에 모아 두었다.

---

## 0. 조사 요약 (V1에서 확인한 사실)

| 항목 | V1 현재 구현 | V2 계약에서의 처리 |
| --- | --- | --- |
| 모듈 | IIFE + `window.AnonymousRPG`, 테스트는 `vm` 컨텍스트 로드 | 사용하지 않음. ES Module |
| 시간 | 절대 분(minute), 1일 = 1440분 | 동일 단위 채택 (재사용: 개념) |
| 관계 | `score(-100..100)/mode/lastDay/cooperationCount/conflictCount`, NPC 쌍 키 | 필드명 재사용, 방향성 그래프로 일반화 |
| 소문 | `id/text/sources[]/confidence(0..1 float)/firstSeenDay/lastSeenDay/confirmations` | 필드명 재사용, Fact 분리, confidence는 정수 |
| 시드 해시 | `hashSeededText` = FNV-1a 32bit (`Math.imul`) | 알고리즘 재사용 (V1 모듈 import 없이 V2에 재작성) |
| 난수 | `Math.random` 기본값 사용 경로 존재 | 엔진에서 금지 |
| 저장 | IndexedDB `AnonymousChroniclesDB`, localStorage `anonymous_chronicles_save_v2` | 사용 금지. **V1 키 이름에 이미 "v2"가 들어 있으므로 혼동 금지** (10절) |
| 사망 | `world.continuity` (phase292) | 이식하지 않음 (9절) |

---

## 1. 모듈 구조

### 1.1 형식

- ES Module (`import`/`export`). 빌드/트랜스파일 없음.
- 엔진 위치: `web/v2/core/`.
- 엔진 금지 의존성: DOM, `window`, `document`, `indexedDB`, `localStorage`, `fetch`,
  `Date`/`Date.now()`, `performance.now()`, `Math.random()`, `crypto`, `setTimeout` 등 모든 호스트 API.
  허용: ECMAScript 표준 내장(`Math.imul`, `Math.floor`, `JSON`, `Object`, `Array`), `structuredClone`.
  - 이유: 같은 엔진을 브라우저, Node 테스트, 향후 Node 서버에서 그대로 실행하기 위해.
  - 확장: 서버 권위 구조로 전환할 때 엔진 코드 변경 없이 호출 위치만 옮기면 된다.
  - 참고: `structuredClone`은 HTML 표준이지만 Node 17+와 모든 대상 브라우저에 있다. 순수 함수이며 결정론적이다.
- Worker 없음. 필요해지면 UI 계층이 Worker 안에서 같은 `step()`을 호출하는 형태로 추가한다.
  엔진은 Worker의 존재를 모른다.

### 1.2 Node에서 ESM을 실행하는 방식 (확정)

루트에 `package.json`이 없다. scratchpad에서 이 환경의 Node v22.22.2로 확인한 결과는 다음과 같다.

- `package.json`이 없어도 `export`/`import` 구문이 있는 `.js`는 **ESM으로 자동 감지**되어 실행된다.
- CommonJS 파일에서 그 ESM 파일을 `require()`로 불러오는 것도 성공했다.

즉, Node 22.12 이상에서는 별도 설정 없이도 동작한다. 다만 자동 감지에는 다음 한계가 있다.

- `import`/`export`가 없는 파일은 CommonJS로 해석된다.
- Node 버전(20.x 등, 향후 서버 런타임)에 따라 동작이 달라질 수 있다.
- 파일을 두 번 파싱하는 비용이 있다.

**결정: Option B(자동 감지)를 쓴다.** 설정 파일을 추가하지 않고, Node 22.12 이상의 ESM 자동 감지에
의존한다. `web/v2/core/*.js`는 `import`/`export` 구문만으로 ESM으로 인식되며, 테스트도 `.js`로 그대로
쓴다.

- 루트에 `package.json` `{"type":"module"}`을 추가하는 것은 **V1 테스트(`require` 사용) 41개를 깨뜨리므로
  금지**했고 애초에 후보가 아니었다.
- `web/v2/package.json` `{"type":"module"}`을 추가하는 안(파일 확장자를 명시적으로 `.mjs`로 강제)은
  **채택하지 않는다.** 이유:
  - 이번 단계(V2-Core-01)는 `tests/v2/run.js`를 수정하지 않기로 했는데, `.mjs` 안을 택하면 첫 구현
    작업에서 러너의 파일 수집 규칙(현재 `.js`만 수집)도 함께 바꿔야 해서 변경 범위가 더 커진다.
  - Node 22.12 이상 자동 감지만으로 이미 브라우저·Node 테스트·향후 Node 서버 모두에서 같은 `.js`
    소스를 그대로 쓸 수 있으므로, 별도 설정 파일이 주는 이득(버전 독립성)보다 새 파일과 확장자
    규칙을 늘리는 비용이 크다 (Ponytail: 표준 기능으로 되면 새 설정을 만들지 않는다).
- 브라우저는 `package.json`과 무관하게 `<script type="module">`로 로드한다 (변화 없음).
- **제약**: CI와 향후 Node 서버의 Node 최소 버전을 **22.12 이상**으로 고정해야 한다. 이 환경은
  22.22.2이므로 문제없다. 더 낮은 Node 버전 지원이 필요해지면 이 결정을 재검토한다.

### 1.3 초기 파일 계획 (아직 만들지 않음)

Ponytail에 따라 **파일 3개로 시작**한다. 한 파일이 독립 테스트가 필요할 만큼 커졌을 때만 분리한다.

| 파일 | 내용 |
| --- | --- |
| `web/v2/core/rng.js` | 시드 해시, 결정론 난수, 스트림 파생 |
| `web/v2/core/rules.js` | Condition 평가, Effect 적용, `check()`, 데이터 검증 |
| `web/v2/core/engine.js` | `createInitialState`, `step`, `view`, 상태 검증/마이그레이션 |

- growth, relationship, knowledge는 **별도 파일 없이** `rules.js`의 Condition/Effect 연산자로 시작한다.
  - 이유: 이들은 결국 "상태를 읽는 Condition과 쓰는 Effect"이므로 별도 시스템 계층이 필요 없다.
  - 확장: 파일 분리는 import 경로만 바뀌고 계약은 바뀌지 않는다.
- 예외 handler 파일(`web/v2/core/handlers.js`)은 첫 handler가 실제로 필요할 때 만든다 (4.4절).

### 1.4 공개 API (계약)

```js
// engine.js
export const SCHEMA_VERSION = 1;
export function createInitialState({ worldSeed, data }) // -> { state, events }
export function step(state, action, data)                // -> { state, events }
export function view(state, data)                        // -> PlayerView (플레이어에게 보이는 투영)
export function migrateState(raw)                        // -> state (구버전 -> 현재 버전), 순수
export function validateState(state)                     // -> string[] (오류 목록, 빈 배열이면 정상)
export function checkDataCompatibility(state, data)      // -> string[] (state가 현재 데이터팩과 호환되는가, 빈 배열이면 호환. D-68)

// rules.js
export function validateData(data)                       // -> string[]
export function evaluateCondition(condition, ctx)        // -> boolean
export function applyEffects(effects, ctx)               // -> { state, events } (D-26 확정, 4.1절)
export function check(input, ctx)                        // -> { result, rng }

// rng.js
export function hashString(text)                         // -> uint32 (FNV-1a)
export function deriveSeed(seed, label)                  // -> uint32
export function nextUint32(rng)                          // -> { value, rng }
export function rollDie(rng, sides)                      // -> { value, rng }
```

- 모든 함수는 순수 함수다. 입력을 변경하지 않고, 같은 입력에는 같은 출력을 낸다.

---

## 2. State / Action / Event 계약

### 2.0 V2-Core-01 범위 (이번 단계에서 필요한 최소 계약)

V2-Core-01("결정론 기반 + 빈 step", 15절)의 구현에는 아래 최소 계약만 있으면 된다. 이 절 아래의
나머지 내용(Resolvable, Condition/Effect/check, 트리거, `actors`/`facts`/`relations` 등)은
V2-Core-01 범위가 아니며, 그 계약이 필요한 이후 작업(15절)에서 각각 확정·구현한다.

- **State**: `schemaVersion`, `worldSeed`, `rng{seed,cursor}`, `time{minute}` 네 필드만 존재한다.
  `dataRef`, `pending`, `actors`, `flags`, `signals`, `facts`, `knowledge`, `relations`, `cases`,
  `fired`, `attempts`(2.1절 전체 스키마)는 해당 시스템을 구현하는 이후 작업에서 추가한다.
- **Action**: `wait`만 유효 경로로 처리한다. 그 밖의 action(`type`이 `wait`가 아니거나 형태가
  잘못된 경우)은 모두 `invalid_action`으로 reject한다. `perform`/`move`/`choose`/`startCharacter`의
  전용 처리는 Resolvable과 actors가 생기는 이후 작업에서 추가한다.
- **step 파이프라인**(2.5절 11단계) 중 1, 2, 6, 8(시간 Effect만), 11단계만 동작한다. 3, 4, 5, 7, 9,
  10단계(pending/사망 게이트, 대상 조회, requires, check, world 틱, trigger)는 관련 state 필드와
  Resolvable이 생기는 이후 작업에서 활성화된다.
- **Event**: `wait` 성공 시 `time.advanced` 이벤트 1개, 실패 시 `action.rejected` 이벤트 1개만
  발생한다.
- **RNG**: `rng.js`의 네 함수(2.7절)를 구현하고 결정론을 테스트한다. `step()` 자체는 아직 RNG를
  소비하지 않는다 (check가 없으므로). RNG는 함수 단위로 독립적으로 검증한다.
- **결정론과 시간 모델**(2.6절)은 범위와 무관하게 처음부터 전부 지킨다 — 기능이 적다고 규칙을
  느슨하게 하지 않는다.

### 2.1 State 최소 스키마 (schemaVersion 1, 장기 계약 — V2-Core-01 범위는 위 2.0절 참고)

```jsonc
{
  "schemaVersion": 1,
  "worldId": "fantasy_world_3f2a91c0",        // 2.6절 (D-03: world.id + "_" + hex(hashString(worldSeed)))
  "worldSeed": "user-or-generated-string",
  "dataRef": { "id": "fantasy_pack", "version": "0.1.0" },   // 팩에 version이 없으면 { "id" }만 (D-68)
  "rng": { "seed": 1063372352, "cursor": 0 },   // uint32 seed, 정수 cursor. state의 유일한 rng 필드 (2.7절)
  "time": { "minute": 0 },                      // 게임 절대 분, day = floor(minute / 1440)
  "player": { "actorId": "player_1", "characterCount": 1 },
  "pending": null,                              // null | { "kind": "choice", "choiceId": "..." , "sourceId": "..." }
                                                //      | { "kind": "newCharacter" }
  "actors": {
    "player_1": {
      "id": "player_1", "kind": "player", "alive": true,
      "locationId": "loc_start",
      "hp": { "current": 10, "max": 10 },
      "money": 0,
      "inventory": { },                         // itemId -> 수량(양의 정수)
      "growth": { },                            // growthSystemId -> GrowthState (6절)
      "tags": [ ]
    }
  },
  "flags":     { },                             // key -> string | number | boolean
  "signals":   { },                             // key -> 정수 카운트
  "facts":     { },                             // factId -> { "value": <JSON>, "since": minute }   (8절)
  "knowledge": { },                             // actorId -> { rumorId -> RumorEntry }             (8절)
  "relations": { },                             // edgeKey -> Relation                              (7절)
  "cases":     { },                             // caseId -> { "stage": "stageId", "since": minute }
  "fired":     { },                             // eventDefId -> { "count": n, "lastMinute": m }   (트리거 once/cooldown 기록)
  "attempts":  { }                              // attemptKey -> 정수 (5.6절)
}
```

**불변 조건 (validateState가 검사)**

- JSON 직렬화 안전: `JSON.parse(JSON.stringify(state))`가 원본과 deepEqual이어야 한다.
  `undefined`, `NaN`, `Infinity`, `Map`, `Set`, `Date`, 함수를 넣지 않는다.
  - 이유: 저장은 `JSON.stringify` 하나로 끝나고, 서버 전송에도 그대로 쓸 수 있다.
  - 확장: 저장소와 네트워크 프로토콜이 별도의 직렬화 계층 없이 state를 다룬다.
- 게임 수치는 모두 정수다 (hp, money, score, confidence, stat, exp, minute).
  - 이유: 부동소수 누적 오차와 엔진 간 차이를 없애 결정론을 보장한다.
  - 확장: V1의 confidence(0..1 float)와 달리 V2는 0..100 정수를 쓴다.
- ID 형식: `^[a-z][a-z0-9_]*$` (소문자로 시작). `:`는 쓰지 않는다 (7.1절 edgeKey 구분자와 겹침 방지).
  - 이유: 숫자형 문자열 키는 JS 객체에서 삽입 순서와 무관하게 먼저 정렬된다.
    문자로 시작하게 강제하면 키 순서가 문자열 정렬 규칙 하나로 통일된다.
  - 확장: 멀티버스 전역 ID는 `worldId`와 로컬 ID를 합성해 만들며 (2.6절), 로컬 ID 규칙은 그대로 유지된다.
- 이벤트 로그는 state에 넣지 않는다. `step`은 events를 반환만 하고, 로그 보관은 UI와 저장 계층의 책임이다 (D-05).
  - 이유: state 크기를 제한하고 결정론 비교를 단순하게 한다.
  - 확장: 서버에서는 이벤트 스트림을 별도로 저장할 수 있다.
- **state에 이벤트 일련번호(`seq`) 필드를 두지 않는다.** 이유와 대안은 2.4절 참고.

### 2.2 Action 스키마

```jsonc
{ "type": "perform", "actionId": "act_rest", "targetId": "npc_a" }  // 데이터 정의 행동 (targetId 선택)
{ "type": "move", "to": "loc_market" }                              // 지역 이동
{ "type": "choose", "optionId": "opt_1" }                           // pending choice 응답
{ "type": "wait", "minutes": 60 }                                   // 시간 경과 (1..1440)
{ "type": "startCharacter", "templateId": "start_default" }         // 사망 후 새 캐릭터
```

- 행동하는 actor는 항상 `state.player.actorId`다. 클라이언트는 actorId를 보내지 않는다.
  - 이유: 서버 권위 구조에서 클라이언트가 다른 actor를 사칭하지 못하게 한다.
  - 확장: NPC 자율 행동은 step 안의 world 단계(2.5절 9단계)에서 처리하며 Action 경로를 쓰지 않는다.
- action 타입은 위 5개로 고정한다. 새 게임 행동은 **새 action type이 아니라 데이터(`data.actions`)로** 추가한다.
  - 이유: 콘텐츠를 늘려도 엔진 코드가 바뀌지 않는다.
  - 확장: 새 type은 엔진 버전 변경으로 취급한다 (테스트와 문서 동시 갱신).
- `move`를 데이터 행동과 분리한 이유: 지역 연결과 이동 시간은 지역 그래프 데이터에서 나오며 모든 세계에 공통이다.

### 2.3 Resolvable: 행동, 선택지, 사건의 공통 형태

```jsonc
{
  "requires": Condition,                       // 생략하면 항상 true
  "check": CheckSpec,                          // 생략하면 판정 없음 (5절)
  "effects": [Effect, ...],                    // check가 없을 때 사용
  "outcomes": {                                // check가 있을 때 사용
    "great": [...], "success": [...], "partial": [...], "fail": [...]
  },
  "minutes": 30                                // 소요 시간. effects 뒤에 time Effect로 자동 추가됨
}
```

- 누락된 outcome 처리: `great`가 없으면 `success`를 쓰고, `partial`이 없으면 `fail`을 쓴다.
  `success`와 `fail`은 필수다.
- `data.actions[id]`, `data.choices[id].options[]`, `data.events[id]`가 모두 이 형태를 공유한다.
  - 이유: 행동, 선택지, 사건 결과, 전투 라운드를 하나의 해석기로 처리한다.
  - 확장: 새 콘텐츠 유형도 Resolvable을 재사용하면 엔진을 바꿀 필요가 없다.

### 2.4 Event 스키마 (확정 — `seq` 없음)

```jsonc
{
  "minute": 1500,                  // 발생 시점 게임 시간
  "type": "relation.changed",      // 도메인 이벤트 이름
  "visibility": "player",          // "player" | "internal"
  "actorId": "player_1",           // 관련 actor (선택)
  "data": { }                      // 타입별 구조화 데이터. 서술 텍스트는 넣지 않음 (textId만 허용)
}
```

**seq를 두지 않는 이유와 로그 순번의 책임 (항목 5)**

- 한 `step()` 호출이 반환하는 `events` 배열 안의 순서는 **배열 인덱스 자체**로 정해진다 (배열은 항상
  발생한 순서대로 채워지며, 재배열되지 않는다). 여러 번의 `step()` 호출에 걸친 순서는 호출자가 `step`을
  부르는 순서 그 자체로 이미 정해져 있다.
  - 이유: 순서를 나타내는 정보가 (호출 순서, 배열 인덱스)만으로 이미 완전하므로, `state.seq` 같은
    전역 단조 카운터는 **중복 정보**다. state에 로그 관리용 필드를 두면 엔진 state의 책임(게임 로직)과
    로그 계층의 책임(순번 부여, 영속화, 페이지네이션)이 섞인다.
  - 확장: 이벤트를 UI 히스토리나 분석용으로 영속 로그에 쌓아야 하면, 그 번호는 **런타임/저장 계층**이
    이벤트를 로그에 append할 때 자체적으로 매긴다 (예: 저장 레코드 배열의 인덱스, IndexedDB의
    `autoIncrement` 키). 이는 순수 엔진의 계약이 아니다 (10절).
  - 참고: 이전 초안의 "reject된 이벤트는 발급되지 않은 seq 번호를 남긴다"는 문제는 seq 자체가 없으므로
    함께 사라진다 (2.6절 invalid action 항목도 갱신됨).
- `internal` 이벤트(fact, flag, signal 변경, 정확성 관련 정보)는 `view`/UI에 전달하지 않는다.
  - 이유: 8절의 진실 비노출 원칙을 이벤트 경로에서도 지킨다.
  - 확장: 서버는 `player` 이벤트만 클라이언트로 보낸다.
- 서술 텍스트는 데이터(`data.texts`)에 두고, 이벤트는 `textId`만 참조한다 (`narrate` Effect).
  - 이유: 엔진과 콘텐츠를 분리하고, 향후 현지화나 UI 교체를 쉽게 한다.

**Effect ↔ Event 매핑은 장기 계약으로 고정하지 않는다 (항목 6, 재검토 결과 · D-20)**

- 4.2절의 "Effect 1개당 Event 1개" 표는 **참고용 기본값**일 뿐, 엔진이 지켜야 하는 고정 계약이 아니다.
  실제로 몇 개의, 어떤 이벤트를 만들지는 Effect를 구현하는 시점(15절 작업 3 = V2-Core-03에서
  "변화 있으면 1개, 없으면 0개"로 확정. D-30, 4.1절)에 정한다 — 예를 들어 여러 Effect를 하나의
  도메인 이벤트로 묶거나, UI에 의미 없는 내부 변화는 이벤트를 아예 만들지 않는 선택지를 열어 둔다.
  V2-Core-01에는 이 매핑 자체가 없다 (2.0절 — `wait`/`action.rejected`만 존재).
  - 이유: "Effect 1개 = Event 1개"를 지금 확정하면, 나중에 이벤트 노이즈를 줄이거나 의미 단위로 묶고
    싶을 때 계약을 깨야 한다. 엔진이 실제로 보장해야 하는 최소 계약은 "이벤트는 `visibility`로 진실을
    감추고, 배열 순서로 발생 순서를 나타낸다"까지이며, 그 이상의 세밀한 매핑 규칙은 콘텐츠/Effect
    설계의 몫으로 남긴다.
  - 확장: 이후 어떤 매핑 방식을 고르든 위 Event 스키마나 step 계약(2.5절)을 다시 바꿀 필요가 없다.
- 엔진 자체가 만드는 고정 이벤트 이름은 계속 존재하며, 이 목록은 매핑 재검토 대상이 아니다:
  `action.rejected`, `action.resolved`, `check.resolved`, `time.advanced`, `day.started`(internal),
  `level.up`, `actor.died`, `character.started`, `choice.offered`, `trigger.fired`(internal).
  V2-Core-01에서는 이 중 `action.rejected`, `time.advanced`만 쓰인다.

### 2.5 step 파이프라인 (순서 고정)

```
 1. state.schemaVersion !== SCHEMA_VERSION  -> throw (프로그래머 오류. 로드 시 migrateState를 먼저 거쳐야 함)
 2. action 형태 검증                          -> 실패 시 reject(invalid_action)
 3. 게이트: pending 불일치 / actor 사망         -> reject(pending_choice | pending_new_character | actor_dead)
 4. 대상 정의 조회 (actionId, optionId, to)     -> reject(unknown_action | unknown_option | unknown_location)
 5. requires Condition 평가                   -> reject(requirements_not_met)
 6. structuredClone(state)로 작업 사본 생성 (이후 변경은 사본에만 적용)
 7. check가 있으면 check() 실행 (rng 전진)     -> check.resolved 이벤트
 8. 해당 outcome 또는 effects 순차 적용 (minutes는 끝에 time Effect로 적용)
 9. world 단계: 경과 시간에 포함된 day 경계마다 day.started 발생 (향후 NPC/경제 자율 틱 연결 지점)
10. trigger 단계: data.events를 id 오름차순으로 한 번 순회하며 trigger가 참이고 once/cooldown을 통과하면 발동
    - 이번 단계에서 발동한 사건의 결과로 참이 된 trigger는 **다음 step에서** 평가한다 (연쇄 1단계 제한)
11. action.resolved 이벤트 발생 후 { state: 사본, events } 반환
```

- 이유: 순서가 고정되어야 결정론과 재현 테스트가 성립한다. 10단계의 연쇄 제한은 무한 루프를 구조적으로 막는다.
- 확장: NPC 자율 행동, 조직 의사결정, 경제 틱은 9단계에 추가된다. AGENTS.md의 월드 순환에 해당한다.

### 2.6 불변성, 결정론, 시간, ID

- **mutation**: 입력 `state`와 `data`를 절대 변경하지 않는다. 구현은 6단계에서 `structuredClone`을 쓴다.
  호출자는 반환된 state가 입력과 같은 참조라고 가정하면 안 된다.
  - 이유: 네이티브 기능만으로 불변성을 확보한다 (Ponytail 4단계). 구조 공유 라이브러리는 쓰지 않는다.
  - 확장: 상태가 커져 복제 비용이 문제가 되면 내부 구현만 구조 공유로 바꾼다. 계약은 유지된다.
- **invalid action**: 예외를 던지지 않는다. 입력 state와 deepEqual인 state와 다음 이벤트 1개를 반환한다:
  `{ type:"action.rejected", visibility:"player", data:{ code, detail? } }`.
  이때 rng와 time은 전진하지 않는다 (state에 `seq`가 없으므로 "발급되지 않은 번호" 문제 자체가 없다.
  2.4절 참고).
  - reason code 고정 목록: `invalid_action`, `unknown_action`, `unknown_option`, `unknown_location`,
    `requirements_not_met`, `pending_choice`, `pending_new_character`, `actor_dead`, `no_pending_choice`.
  - `requirements_not_met`에는 어떤 조건이 실패했는지 넣지 않는다 (fact 누출 방지. 8.4절, D-06).
  - **throw**는 프로그래머 오류에만 쓴다: 스키마 버전 불일치, 검증을 통과하지 못한 data, 등록되지 않은 handler.
  - 이유: 플레이어 입력은 정상 흐름이고, 깨진 데이터는 버그다. 둘을 구분하면 테스트와 디버깅이 명확해진다.
- **시간**: `state.time.minute`만이 시간의 원천이다. 시간은 `time` Effect 또는 Resolvable.minutes로만 전진하고,
  감소하지 않는다. 엔진은 실제 시계를 읽지 않는다.
- **결정론 범위** (항목 5·8): 같은 `(engine 코드, SCHEMA_VERSION, data, state, action)`이면 Node와
  Chromium에서 **deepEqual한 `{state, events}`** 를 반환한다. 이는 `step`이 순수 함수이고 무작위성의
  유일한 원천이 `state.rng`이기 때문에 성립하는 **성질**이며, 별도의 검증 로직으로 강제하는 것이 아니다.
  보장 조건은 다음과 같다:
  - 결과에 영향을 주는 객체 순회는 항상 `Object.keys(x).sort()` 순서로 한다.
  - `localeCompare`, `toLocaleString`, `Intl`을 쓰지 않는다.
  - 수치는 정수만 쓰고, 나눗셈은 즉시 `Math.floor`한다.
  - 난수는 `state.rng`에서만 뽑는다.
  - **합성(composition)**: `step`을 순서대로 여러 번 호출할 때, 각 호출에 앞 호출이 반환한 state를
    그대로 넘기면 최종 state와 각 단계의 events도 결정론적이다. 즉 "한 번의 (state, action, data)"뿐
    아니라 "같은 초기 state에서 같은 action 시퀀스를 재생"해도 매번 같은 결과가 나온다 — 이 성질이
    저장/복원, golden 테스트(13절), Worker/서버 이식의 기반이다.
  - **주의**: 이 성질을 "저장 조작(save-scumming) 방지" 같은 안티치트 목적으로 설계하지 않는다.
    엔진의 목표는 재현 가능한 테스트와 서버-클라이언트 결과 일치이며, 부정행위 방지가 필요해지면
    그 역할은 서버 권위 구조(8절, 13절)가 담당한다 (2.7절에서 다시 설명).
- **worldId**: `createInitialState`가 `${data.world.id}_${hex(hashString(worldSeed))}`로 결정론적으로 만든다 (D-03).
  - 확장: 멀티버스 전역 참조는 `worldId` + 로컬 ID 조합으로 만든다. 로컬 state 구조는 변하지 않는다.

### 2.7 Seed와 RNG (확정)

```
hashString(text)       = FNV-1a 32bit (V1 hashSeededText와 같은 알고리즘, Math.imul 사용)
deriveSeed(seed,label) = hashString(seed.toString(16) + ":" + label)
nextUint32(rng)        = x = (seed + cursor * 0x9E3779B9) >>> 0 에 murmur3 fmix32 적용
                          -> { value: x >>> 0, rng: { seed, cursor: cursor + 1 } }
rollDie(rng, sides)    = nextUint32의 value % sides + 1
```

`rng` 값의 형태는 항상 `{ seed: <uint32>, cursor: <정수 ≥ 0> }`이고, `nextUint32`는 이 값을 받아
`{ value, rng: 다음 rng }`를 반환하는 순수 함수다. 모듈 스코프나 전역 변수에 난수 상태를 두지 않는다
(항목 3: 전역 상태 없는 순수 결정론 방식).

**두 종류의 스트림, 서로 영향 없음 (항목 4)**

| 스트림 | 저장 위치 | 용도 | 소비 시점 |
| --- | --- | --- | --- |
| gameplay 스트림 | `state.rng` (state의 유일한 rng 필드) | `check()` 등 `step()` 안에서 일어나는 모든 판정 | `step()` 호출마다 순차 소비, cursor가 state에 영속화됨 |
| world-generation 스트림 | **state에 저장하지 않음** (호출 시점에만 존재하는 로컬 값) | 초기 세계 상태, NPC/세력 초기값, 사건 배치 등 "이름 있는 대상 하나당 한 번 결정되는" 값 | `createInitialState`(또는 이후 새 콘텐츠 도입 시점)에서 라벨별로 `deriveSeed(worldSeed, label)`로 새로 만들어 그 자리에서 소비하고 버림 |

- gameplay 스트림과 world-generation 스트림은 **서로 다른 seed에서 출발**하고, world-generation 스트림은
  cursor를 state에 남기지 않는다. 따라서 한쪽을 몇 번 더 소비해도 다른 쪽의 다음 값에 **전혀 영향을
  주지 않는다** — 소비량이 서로의 결과에 간섭하지 않는 구조다.
  - 이유: 데이터에 NPC를 하나 추가하거나 세계 생성 로직을 조정해도 진행 중인 판정 흐름(gameplay
    스트림)이 달라지지 않는다. 반대로 플레이어가 판정을 몇 번 더 시도해도 아직 등장하지 않은 NPC의
    초기값이 바뀌지 않는다.
  - 확장: 새 world-generation 라벨을 추가하는 것은 항상 안전한 변경이다. 기존 라벨의 소비 횟수·순서를
    바꾸는 것만 호환성을 깬다 (라벨 이름과 그 라벨 안에서의 draw 횟수·순서를 데이터 변경처럼 취급한다).
- world-generation 라벨 규칙: `"<종류>:<id>"` (예: `"fact:fact_a"`, `"npc:npc_a"`). 같은 라벨은 항상
  같은 local cursor(0부터)로 시작하며, 이미 초기화된 대상을 다시 초기화하지 않는다 (idempotent).
- V2-Core-01(2.0절)에는 world-generation 스트림 사용처가 아직 없다 — `createInitialState`가 만드는
  state에 `facts`/`actors` 자체가 없기 때문이다. 이 절의 스트림 분리 계약은 이후 작업(Fact/Growth 구현)을
  위해 지금 확정해 둔다.

**state + action + data → 결과 계약 (항목 8, 9)**

같은 `(state, action, data)`로 `step`을 호출하면 항상 deepEqual한 `{state, events}`를 반환한다. 이는
`step`이 순수 함수이고 유일한 무작위성의 원천이 `state.rng`이기 때문에 성립하는 **성질**이며, 이를
위해 별도로 강제하는 검증 로직을 두지 않는다. 이 성질의 자연스러운 결과로 저장한 state를 다시 불러와
같은 action을 호출하면 같은 결과가 나오지만, **이것을 저장 조작(save-scumming) 방지 목적으로
설계하지는 않는다.** 엔진의 목표는 재현 가능한 테스트와 서버-클라이언트 결과 일치이며, 부정행위 방지가
필요해지면 그 역할은 엔진이 아니라 서버 권위 구조(8절, 13절)가 맡는다.

**seed 생성과 편향**

- 새 게임의 `worldSeed` **생성**은 엔진 밖(UI는 `crypto.getRandomValues`, 서버는 자체 난수)에서 한다.
  엔진은 seed를 입력으로 받기만 한다.
  - **구현과의 차이 (V2-Core-28 확인, D-69)**: 위 `deriveSeed`의 `seed.toString(16)`과 `getRandomValues`는
    seed가 숫자라는 전제인데, 구현은 `worldSeed`를 String으로 저장하고(UI는 `crypto.randomUUID`)
    `state.rng.seed`는 그 hash(uint32)다. 문자열의 `toString(16)`은 기수 인자를 무시하므로 같은 게임에서
    숫자 seed, 저장된 문자열, `rng.seed`를 `deriveSeed`에 넘기면 서로 다른 값 셋이 나온다. 지금은
    `deriveSeed`를 엔진이 쓰지 않아 영향이 없지만, world-generation 스트림을 처음 쓰는 기능(`facts[*].initial`의
    `pickFrom` 등)은 무엇을 넘길지 먼저 정해야 한다.
  - **해결(D-76, V2-Core-43)**: world-generation seed 입력은 C1 — 저장된 `state.worldSeed` 문자열이다.
    즉 `deriveSeed(state.worldSeed, label)` = `hashString(worldSeed + ":" + label)`(문자열의 `toString(16)`은 문자열 그대로이므로
    위 공식은 바뀌지 않는다). 이 입력은 `engine.js`의 `worldGenerationSeed(state)` 한 곳에서만 정한다. C2(`state.rng.seed`)로
    가는 절차와 영향은 D-76에 있다.
- `% sides`의 편향: sides가 100 이하이면 편향이 1e-7 미만이므로 무시한다 (계약상 허용).
- cursor 값 자체는 "지금까지 몇 번 뽑았는가"를 보여주므로 디버깅에 쓸 수 있지만, 게임 로직이 cursor
  값을 직접 참조하지는 않는다.

---

## 3. Condition

### 3.1 공통 규칙

- 형태: `{ "op": "<name>", ...인자 }`. 키 자체를 연산자로 쓰는 형식(`{"and": [...]}`)은 쓰지 않는다.
  - 이유: `op` 필드 하나로 검증과 분기가 가능하고, 인자 이름과 충돌하지 않는다.
- 평가: `evaluateCondition(cond, ctx) -> boolean`. 순수 함수이며 rng를 쓰지 않고 부수효과가 없다.
- `ctx = { state, data, actorId, targetId, contextKind }`
  - `contextKind`: `"player"` (행동/선택지/지역 requires, 플레이어에게 보이는 것) 또는 `"world"` (사건 trigger, NPC 규칙, outcome 분기).
- **subject 해석**: `"self"`(기본값) = ctx.actorId이며, trigger 문맥에서는 현재 플레이어 캐릭터다.
  `"target"` = ctx.targetId. 그 밖의 값은 명시적 엔티티 ID로 해석한다.
- **누락 참조**는 false 또는 0으로 평가하고 throw하지 않는다.
  예: 없는 flag는 `null`, 없는 signal은 0, 없는 관계 edge는 기본값으로 본다.
  - 이유: 아직 발생하지 않은 상태는 정상이다.
- **알 수 없는 op나 잘못된 인자**는 `validateData`(D-56, V2-Core-16 구현)에서 오류로 잡아, 정상적인
  런타임에는 발생하지 않는다고 가정한다. 다만 `validateData` 통과는 `step()` 호출의 전제 조건일 뿐
  `evaluateCondition` 자체의 동작을 바꾸지 않는다 — validateData를 거치지 않았거나 검증 결과를
  무시한 호출에서도 `evaluateCondition`이 이런 입력을 만나면 여전히 **throw하지 않고 `false`를
  반환한다** —
  "누락 참조는 throw하지 않는다"는 위 원칙을 알 수 없는 op/selector/형태 오류에도 그대로 확장한
  것이며, 별도의 새 reject 메커니즘을 만들지 않는다 (Condition은 boolean만 반환하므로 "reject"는
  이 값을 호출자인 `step()`이 `false`로 받아 `requirements_not_met`으로 처리하는 것을 말한다).
- 수치 비교 인자는 `min`, `max`(포함 범위)로 통일한다. 둘 다 없으면 "존재하거나 참인지"를 검사한다.
  동등 비교는 `eq`로 한다.
- 평가는 단락 평가(short-circuit)하며, 왼쪽부터 순서대로 진행한다.
- 생략된 requires는 true다.

### 3.2 연산자

> **D-22 확정**: 논리곱/논리합의 정식 명칭은 `and`/`or`다. 이전 초안의 `all`/`any`는 폐기했고
> 별칭으로도 두지 않는다 — Condition DSL에는 `and`/`or`만 존재한다.

| op | JSON 예시 | 평가 규칙 |
| --- | --- | --- |
| `and` | `{"op":"and","of":[C,C]}` | 모두 참이면 참. **빈 배열은 참** |
| `or` | `{"op":"or","of":[C,C]}` | 하나라도 참이면 참. **빈 배열은 거짓** |
| `not` | `{"op":"not","of":C}` | 부정. 정확히 하나의 Condition만 받는다 |
| `always` | `{"op":"always"}` | 항상 참. 인자 없음. requires 생략과 의미상 동일하다 (D-21) |
| `never` | `{"op":"never"}` | 항상 거짓. 인자 없음 (D-21) |
| `stat` | `{"op":"stat","stat":"stat_a","min":5}` | subject의 현재 세계 성장체계에서 **기본 stat 값**을 비교 (D-07) |
| `flag` | `{"op":"flag","key":"gate_open","eq":true}` | `state.flags[key]`. eq가 없으면 truthy 검사 |
| `signal` | `{"op":"signal","key":"sig_x","min":3}` | `state.signals[key] ?? 0` 비교 |
| `skill` | `{"op":"skill","skill":"skill_a","min":2}` | 스킬 rank. min 기본값은 1 |
| `trait` | `{"op":"trait","trait":"trait_a"}` | 특성 보유 여부 |
| `item` | `{"op":"item","item":"item_a","min":1}` | 보유 수량. min 기본값은 1 |
| `relation` | `{"op":"relation","from":"npc_a","to":"self","min":20,"mode":"cooperation","tag":"debt"}` | 방향 edge(7절). 준 인자 모두 만족해야 참. edge가 없으면 기본값으로 평가 |
| `rumor` | `{"op":"rumor","rumor":"rum_a","minConfidence":50}` 또는 `{"op":"rumor","fact":"fact_a"}` | subject의 지식에 해당 rumor(또는 해당 fact에 대한 어떤 rumor)가 있는지. **정확성은 보지 않는다** |
| `fact` | `{"op":"fact","fact":"fact_a","eq":"value_b"}` | 세계의 진실. **`contextKind:"world"`에서만 허용** (8.4절, D-06) |
| `day` | `{"op":"day","min":3,"hourFrom":20,"hourTo":4}` | day = floor(minute/1440), hour = floor((minute%1440)/60). hourFrom > hourTo이면 자정을 넘는 구간으로 해석 |
| `location` | `{"op":"location","at":"loc_a"}` 또는 `{"op":"location","in":["loc_a","loc_b"]}` | subject의 현재 위치 |
| `unlock` | `{"op":"unlock","id":"unl_a"}` | 성장 해금 보유 여부 (6절). **후보 목록에 추가한 연산자** |
| `case` | `{"op":"case","case":"case_a","stage":"stage_b"}` 또는 `{"op":"case","case":"case_a","in":[...]}` | 사건/퀘스트 단계. **후보 목록에 추가한 연산자** |
| `money` | `{"op":"money","min":10}` | 보유 금액. **후보 목록에 추가한 연산자** |
| `handler` | `{"op":"handler","name":"x.y","params":{}}` | 예외 경로 (4.4절). boolean만 반환 |
| `eq` | `{"op":"eq","left":Value,"right":Value}` | 둘 중 하나라도 `undefined`면 거짓(D-25). 아니면 `left === right` (strict). D-23, 3.2a절 |
| `neq` | `{"op":"neq","left":Value,"right":Value}` | 둘 중 하나라도 `undefined`면 거짓(D-25). 아니면 `left !== right` (strict). D-23, 3.2a절 |
| `gt` | `{"op":"gt","left":Value,"right":Value}` | 둘 중 하나라도 `undefined`면 거짓(D-25). 아니면 둘 다 숫자일 때만 `left > right`, 아니면 거짓 |
| `gte` | `{"op":"gte","left":Value,"right":Value}` | 둘 중 하나라도 `undefined`면 거짓(D-25). 아니면 둘 다 숫자일 때만 `left >= right`, 아니면 거짓 |
| `lt` | `{"op":"lt","left":Value,"right":Value}` | 둘 중 하나라도 `undefined`면 거짓(D-25). 아니면 둘 다 숫자일 때만 `left < right`, 아니면 거짓 |
| `lte` | `{"op":"lte","left":Value,"right":Value}` | 둘 중 하나라도 `undefined`면 거짓(D-25). 아니면 둘 다 숫자일 때만 `left <= right`, 아니면 거짓 |

- 후보 목록에 없던 `unlock`, `case`, `money`를 추가한 이유:
  - `unlock`: 성장 해금으로 행동, 선택지, 시스템 접근을 게이팅하려면 필요하다 (레벨 게이팅의 대안).
  - `case`: 퀘스트 완료와 사건 진행 조건에 필요하다.
  - `money`: 구매 조건을 handler 없이 표현하려면 필요하다.
- `level` 연산자는 **의도적으로 두지 않는다**. 레벨로 과도하게 게이팅하지 않는다는 원칙을 스키마 수준에서 강제한다 (D-08).
- **확장 규칙**: 새 op를 추가하려면 (1) 이 표 갱신, (2) validateData 갱신, (3) 참/거짓/누락 참조 테스트가 함께 필요하다.
- **구현 상태 (V2-Core-14, D-54)**: `and`/`or`/`not`/`always`/`never`/`eq`/`neq`/`gt`/`gte`/`lt`/`lte`(V2-Core-02)에
  더해 `stat`/`flag`/`signal`/`skill`/`trait`/`item`/`relation`/`fact`/`day`/`location`/`unlock`/`case`
  12개를 이번 라운드에 구현했다(§3.1 공통 min/max/eq 규칙 재사용, D-54 참고). `money`도 이번에 구현했다.
  `rumor`는 당시 D-24가 풀릴 때까지 미구현(거짓만 반환)이었으나, **V2-Core-15에서 D-24를 확정하며
  함께 구현했다**(직접 조회/`fact` 역참조 두 형태 모두). `handler`는 4.4절/D-38 그대로 미구현(등록된
  handler가 없으므로 항상 거짓).

### 3.2a Value와 selector (D-23 확정)

`eq`/`neq`/`gt`/`gte`/`lt`/`lte`의 `left`/`right`는 각각 `Value`다. `Value`는 둘 중 하나다.

- **literal**: JSON 원시값(string, number, boolean, null) 그대로 쓴다.
- **selector**: 아래 표에 있는 키 중 **정확히 하나**만 가진 plain object. 각 selector는 state에서
  스칼라 값 하나로 해석(resolve)되거나, 참조 대상이 없으면 `undefined`로 해석된다.

**임의의 dot-path/state traversal 문법은 두지 않는다.** selector는 아래 표에 있는 이름 있는 키로만
쓸 수 있고, 그 외 임의의 경로 문자열(`"actors.player_1.money"` 같은 것)은 지원하지 않는다.

| selector 키 | 형태 | 해석되는 값 | 근거 |
| --- | --- | --- | --- |
| `stat` | `{"stat":"<id>","subject"?:Subject,"system"?:"<id>"}` | subject의 기본 stat 값 (§6.3 `growth[system].stats[id]`) | §3.2 `stat` op, D-07 |
| `skill` | `{"skill":"<id>","subject"?:Subject,"system"?:"<id>"}` | skill rank (§6.3 `growth[system].skills[id]`) | §3.2 `skill` op |
| `proficiency` | `{"proficiency":"<id>","subject"?:Subject,"system"?:"<id>"}` | 누적 포인트 (§6.3 `growth[system].proficiency[id]`) | §6.2 Proficiency |
| `item` | `{"item":"<id>","subject"?:Subject}` | 보유 수량 (§2.1 `actors[id].inventory[item]`) | §3.2 `item` op |
| `money` | `{"money":true,"subject"?:Subject}` | 보유 금액 (§2.1 `actors[id].money`). 유일한 자원이라 식별자가 필요 없으므로 `true`를 고정 마커로 쓴다 | §3.2 `money` op |
| `relation` | `{"relation":{"from":Subject,"to":Subject}}` | edge의 `score` (§7.2). 없으면 기본 Relation(`score:0`)으로 간주 | §7.1~7.2, §3.2 `relation` op |
| `flag` | `{"flag":"<key>"}` | `state.flags[key]`, 없으면 `null` | §3.1 누락 참조 규칙 |
| `signal` | `{"signal":"<key>"}` | `state.signals[key] ?? 0` | §3.2 `signal` op |
| `day` | `{"day":true}` | `floor(state.time.minute / 1440)`. 유일한 자연수 값이라 `money`와 같은 이유로 `true`를 고정 마커로 쓴다 | §2.6 시간 모델 |
| `fact` | `{"fact":"<id>"}` | `state.facts[id].value`. **`ctx.contextKind !== "world"`이면 항상 `undefined`로 해석한다** (D-06을 selector 형태에도 동일하게 적용 — 아래 참고) | §8.1, §8.4, D-06 |
| `rumor` | `{"rumor":"<id>","subject"?:Subject}` | subject의 지식에 있는 해당 rumor의 `claim`(§8.2, D-24 resolved V2-Core-15) — `fact` selector의 `.value`와 같은 역할. 모르는 rumor면 `undefined` | §8.2, D-24 |

`Subject`는 §3.1의 subject 해석을 그대로 재사용한다: `"self"`(기본값) \| `"target"` \| 명시적 엔티티 ID.

**`fact` selector와 D-06**: §3.2의 `fact` op는 이미 "`contextKind:"world"`에서만 허용"으로 확정되어
있다 (진실을 player 문맥에 노출하지 않기 위함, §8.4). 같은 위험이 selector 형태에도 그대로 적용되므로
(콘텐츠 제작자가 `{"op":"eq","left":{"fact":"..."},"right":...}`를 행동 `requires`에 써서 진실을
간접 노출할 수 있음), 새로 결정하지 않고 D-06을 selector에도 동일하게 확장 적용한다: player 문맥에서는
`fact` selector가 항상 `undefined`로 해석된다 (값이 있어도 없는 것처럼 처리 — reject 대신 조용히
`undefined`로 만들어, 다른 selector의 "참조 대상 없음"과 같은 방식으로 처리한다).

**타입 불일치와 selector 해석 실패**: selector가 가리키는 state 구조(`actors`, `growth`, `relations`,
`facts`, `knowledge` 등)가 아직 존재하지 않는 state에서는, 해당 selector는 (flag/signal/relation/day
넷을 제외하면) `undefined`로 해석된다 — 이는 새로 만든 예외 처리가 아니라 `?.` 낙관적 접근이 자연스럽게
만드는 결과다.

> **D-25 확정**: `eq`/`neq`/`gt`/`gte`/`lt`/`lte` 여섯 연산자 모두, `left`나 `right` 중 **하나라도**
> `undefined`로 해석되면 (selector가 가리키는 대상이 없거나, `rumor`처럼 아직 resolver가 없는
> 경우 등) 그 비교는 예외 없이 **`false`**다. 이전 초안은 `eq`/`neq`를 strict 비교(`===`/`!==`)로
> 그대로 두어 `undefined === undefined`가 `true`가 되는 경우가 있었으나, 이는 "값이 없다"는 사실
> 두 개가 우연히 같아서 참이 되는 것이라 오해의 소지가 있어 폐기했다. 이제 `eq`/`neq`도 다른 네
> 연산자와 동일하게 "둘 중 하나라도 해석 실패 → 거짓"을 최우선으로 적용한 뒤에만 각자의 비교
> 규칙(`===`, `!==`, 숫자만 허용하는 순서 비교)을 적용한다.

이 설계 덕분에 (V2-Core-02 작성 시점처럼) Growth/Item/RelationshipGraph/Fact/Rumor가 아직 구현되지
않았던 때도 `stat`/`skill`/`proficiency`/`item`/`money`/`rumor` selector를 쓴 비교는 런타임 오류 없이
안전하게 "항상 거짓"으로 동작했다. Growth/Item/Fact/Rumor는 이제 전부 구현됐고(§4.2, §6, §7, §8),
`rumor`도 D-24(V2-Core-15)로 확정됐다 — 각 시스템이 실제로 state에 필드를 추가하는 시점에 이
resolver 코드를 바꾸지 않고도 자동으로 실제 값을 비교하게 된다는 성질을 그대로 활용한 것이다.

### 3.3 사용처 (모두 같은 평가기를 사용)

| 사용처 | 위치 | contextKind |
| --- | --- | --- |
| 행동 requires | `data.actions[id].requires` | player |
| 선택지 requires | `data.choices[id].options[].requires` | player |
| 지역 접근 | `data.locations[id].requires`, `links[].requires` | player |
| 사건 trigger | `data.events[id].trigger` | world |
| 퀘스트 완료 | `data.cases[id].stages[s].completeWhen` — **Condition 하나, optional (D-61, V2-Core-20). 예약 필드: 모양만 검사하고 실행 의미는 없다(D-73, V2-Core-38) — "조건이 참이면 case를 옮긴다"는 `data.events` + `case` Effect로 쓴다** | world |
| 관계 규칙 | `data.rules.relation.*.when` — **Condition 하나, optional (D-62, V2-Core-20). 예약 필드: 모양만 검사하고 실행 의미는 없다(D-74, V2-Core-39) — 관계는 `relation` Effect로만 바뀌고, 조건부 변화는 `data.events` + `relation` Effect로 쓴다** | world |
| 스킬/특성 해금 | `skills[].requires`, `traits[].requires`, `unlocks[].requires` | world |
| outcome 분기 | Effect `if.when` | world |

---

## 4. Effect

### 4.1 공통 규칙

- 형태: `{ "op": "<name>", ...인자 }`. 배열로 주어지면 **순서대로** 적용하며, 각 Effect는 앞 Effect의 결과를 본다.
- **Effect는 reject하지 않는다.** 전제 조건은 requires Condition이 책임진다.
  Effect 수준에서는 경계값에서 **clamp**만 하고, 실제 적용된 변화량(delta)을 이벤트에 기록한다.
  - 이유: 실패 경로를 Condition 하나로 모으면 "왜 실패했나"가 한 곳에서 설명된다.
  - 확장: 거래나 트랜잭션처럼 원자성이 필요한 기능은 requires와 Effect 묶음으로 표현한다.
- subject 해석은 3.1절과 같다 (`self` 기본값, `target`, 명시 ID). 다만 `fact`, `flag`, `signal`, `time`,
  `narrate`, `choice`, `case`, `if`는 세계 단위이거나 분기 전용이라 subject를 쓰지 않는다.
- **`applyEffects`는 외부에서 순수 함수다 (D-26 확정).**
  - 시그니처: `applyEffects(effects, ctx) -> { state, events }`. `ctx = { state, data, actorId, targetId }`.
  - `effects`, `ctx`, `ctx.state`를 절대 mutate하지 않는다. 반환하는 `state`는 항상 `ctx.state`와 다른
    참조다 (`result.state !== ctx.state`).
  - 내부 구현은 `ctx.state`를 **최초 한 번만** `structuredClone`해서 작업 사본을 만들고, 이후 그 사본을
    직접 mutate하면서 만든다. 중첩 Effect(`if.then`/`if.else` 등)도 **같은 작업 사본을 계속 공유**하며
    별도로 clone하지 않는다 — 그래야 "Effect A의 변경을 Effect B가 즉시 관측"하는 순차 가시성이 성립한다.
  - 이 "내부는 지역 mutation, 외부는 순수 함수"는 새 모델이 아니라 표준적인 순수 함수 구현 기법이다
    (호출자가 넘긴 객체를 바꾸지 않고, 함수가 스스로 만든 지역 사본만 바꾼 뒤 그 사본을 반환한다).
    이전 초안의 "ctx.state는 이미 복제된 작업 사본"이라는 문구와 "모든 함수는 입력을 변경하지 않는다"는
    문구가 서로 다른 것을 가리켜 자기모순처럼 보였던 문제는 이 구분으로 해소한다.
- **RNG 원천은 `state.rng` 하나뿐이다 (D-27 확정).** `ctx.rng`는 두지 않고, `applyEffects`의 반환값에도
  `rng`를 넣지 않는다 — 이전 초안에 있던 `ctx = {…, rng}` / `{state, events, rng}`는 `state.rng`가
  "state의 유일한 rng 필드"(2.1절)라는 이미 확정된 원칙과 충돌했으므로 폐기한다. RNG가 필요한 Effect나
  handler는 `ctx.state.rng`를 직접 읽고 쓴다 (이번 V2-Core-03의 4개 op는 RNG를 쓰지 않는다).
- **Effect ↔ Event 규칙 (D-30, D-20을 이 원칙으로 확정)**: 실제로 state가 변경된 Effect 하나당 domain
  event 하나를 만든다. 적용 전/후 값이 같으면(clamp로 인해 변화가 0이 되는 경우 포함) 이벤트를 만들지
  않는다. `if` 자체는 state를 바꾸지 않으므로 이벤트를 만들지 않지만, `then`/`else` 안의 Effect는 각자
  자신의 이벤트를 만든다. (이 규칙은 4.2절 표의 "이벤트" 열 전체에 적용되는 기본값이며, 이후 이벤트를
  묶거나 생략해야 할 필요가 생기면 그때 개별 op 단위로 예외를 정한다 — 4.2절 표를 영원히 고정된 계약으로
  보지 않는다는 D-20의 취지는 유지한다.)
- **함수를 JSON에 넣지 않는다.** 예외 로직은 `handler` op로만 호출한다.
- **malformed Effect는 Condition과 다르게 처리한다 (D-28 확정).** Effect가 plain object가 아니거나,
  `op`이 없거나 알 수 없거나, 필수 필드가 없거나 타입이 틀리거나(정수가 아님, `NaN`/`Infinity` 포함),
  `then`/`else`처럼 배열이어야 할 필드가 배열이 아니면 **throw**한다 — 프로그래머/콘텐츠 오류로 취급한다
  (2.6절 "throw는 프로그래머 오류에만 쓴다"와 일관). 단, `if.when`처럼 **Condition 자체**가 들어가는
  자리는 예외다: `when`이 malformed여도 `evaluateCondition`이 이미 안전하게 `false`를 반환하므로
  (3.1절), `if`는 그 `false`를 정상적인 분기 결과로 받아들이고 `else`를 실행할 뿐 throw하지 않는다.
  Effect의 "throw"와 Condition의 "false, 절대 throw 안 함"은 서로 다른 시스템의 서로 다른 정책이며,
  `if.when`이 그 경계다.

### 4.2 연산자와 최소 스키마

> **구현 상태**: `flag`, `signal`, `time`, `if`(V2-Core-03), `stat`, `hp`(§9 사망 트리거 포함,
> D-34, V2-Core-10), `money`, `item`, `relation`(add만, V2-Core-04 / mode·tag·untag 추가, D-43,
> V2-Core-07), `skill`, `trait`, `unlock`, `case`(V2-Core-05), `exp`, `proficiency`(D-41/D-42
> resolved, V2-Core-06), `fact`(D-44, V2-Core-08), `rumor`(D-45/D-14 resolved, V2-Core-09),
> `move`(D-46, V2-Core-11), `choice`(D-35 resolved, V2-Core-12), `narrate`(D-52, V2-Core-13)까지
> 20개를 실제로 구현했다(아래 스키마가 현재 확정된 인자명이다, D-37). `handler`는 계약(4.4절)은
> 확정돼 있지만 실제 사용 사례가 아직 없어 **의도적으로 미구현**이다(4.4절 콜아웃 참고, blocker
> 아님).
>
> **skill/trait/unlock도 D-31의 subject 기준 visibility를 따른다.** 아래 세 행의 "player" 하드코딩은
> V2-Core-05에서 stat/hp/money/item과 동일하게 "subject 기준(대상이 현재 player actor면 player, 아니면
> internal)"으로 갱신했다 — 새 결정이 아니라 D-31을 같은 카테고리(actor 기반 Effect)에 일관되게
> 적용한 것이다.
>
> **subject 기반 5개(stat/hp/money/item/relation) 공통 규칙 (D-29, D-31 확정)**:
> - **대상 해석 실패 = skip, malformed와 다르다 (D-29).** `subject`(또는 relation의 `from`/`to`)가
>   `"self"`/`"target"`/명시 ID 문자열이 아니면(타입이 틀리면) **throw**한다(스키마 오류, D-28). 반면
>   타입은 올바르지만 가리키는 대상을 찾을 수 없으면 — `"target"`인데 `ctx.targetId`가 없거나, 명시
>   ID가 `state.actors`에 없으면 — **throw하지 않고, lazy actor를 만들지 않고, state를 바꾸지 않고,
>   이벤트도 만들지 않은 채 다음 Effect로 넘어간다(skip).** `stat`의 `system`이 해석되지 않을 때도
>   (문자열 `data.world.growthSystemId`를 찾을 수 없음) 같은 skip 정책을 따른다 — actor를 못 찾는 것과
>   같은 "해석 실패"이지 스키마 오류가 아니기 때문이다.
> - **Visibility는 subject 기준 (D-31 확정)**: 대상 actor가 `state.player.actorId`와 같으면 `player`,
>   아니면 `internal`이다. `relation`은 대상이 둘(`from`/`to`)이므로 **둘 중 하나라도** 현재 player면
>   `player`다(기존 표의 설명을 D-31로 공식화한 것뿐, 새 규칙 아님).
> - actor를 찾은 뒤에도 실제 값이 안 바뀌면(clamp로 delta 0 포함) D-30에 따라 이벤트를 만들지 않는다.

| op | 최소 스키마 | 적용 규칙 | 이벤트 (visibility) |
| --- | --- | --- | --- |
| `stat` | `{op, stat, add, subject?, system?}` | **구현됨.** `stat`은 string, `add`는 정수, `system`은 있으면 string(그 외 malformed→throw). subject 해석은 위 공통 규칙. `system` 기본값은 `data.world.growthSystemId`(§3.2a `stat` selector와 동일). `actor.growth[system].stats[stat]`을 `add`만큼 바꾸고, `data.growthSystems[system].stats`에서 같은 `id`의 정의를 찾아 `[min,max]`로 clamp한다 — 정의를 못 찾으면 clamp 없이 적용한다(범위를 모르므로) | `stat.changed` (subject 기준, D-31), `data:{stat, delta}` |
| `hp` | `{op, add, subject?}` | **구현됨(§9 사망 트리거 포함, D-34 resolved, V2-Core-10).** `add`는 정수(그 외 malformed→throw). subject 해석은 위 공통 규칙. `actor.hp.current`를 `[0, actor.hp.max]`로 clamp하며 변경한다. **current가 실제로 0이 되는 전이(alive였다가 처음 0이 됨) 순간에만** `actor.alive=false`로 바꾸고 `actor.died` 이벤트를 낸다(이미 죽은 actor에게 다시 적용해도 중복 발생하지 않음). 죽은 actor가 플레이어면 `state.pending={kind:"newCharacter"}`를 설정한다. `startCharacter`/succession(§9)은 action/step() 영역이라 이번 범위 밖이다(D-40, engine.js 미변경) | `hp.changed`(subject 기준, D-31, `data:{delta}`) + 사망 전이 시 `actor.died`(subject 기준, `data:{}`) |
| `money` | `{op, add, subject?}` | **구현됨.** `add`는 정수(그 외 malformed→throw). subject 해석은 위 공통 규칙. `actor.money`를 `[0, Number.MAX_SAFE_INTEGER]`로 clamp하며 변경한다 | `money.changed` (subject 기준, D-31), `data:{delta}` |
| `time` | `{op, minutes}` | **구현됨.** `minutes`는 정수이고 0 이상이어야 한다(그 외 malformed). `state.time.minute += minutes`만 한다 — day 경계 계산과 `day.started` 발행은 `step()`의 책임이다(§2.5 9단계), `time` Effect는 만들지 않는다(D-39 확정, 이전 초안의 "day 경계 기록"은 폐기). `minutes:0`은 no-op(이벤트 없음) | `time.advanced` (player), `data:{minutes: 실제 적용값}` |
| `move` | `{op, to, subject?}` | **구현됨(D-46, V2-Core-11).** `to`는 string(그 외 malformed→throw). `move`는 4.1절의 "world 전용이라 subject 무시" 목록(`fact`/`flag`/`signal`/`time`/`narrate`/`choice`/`case`/`if`)에 없으므로 subject 해석은 위 공통 규칙(기본값 self)을 그대로 따른다. `actor.locationId`를 `to`로 직접 설정한다. 연결 검사는 하지 않는다(requires/링크 requires가 책임, §2.2). 이미 같은 위치면 no-op(D-30) | `actor.moved`(subject 기준, D-31 — skill/trait/unlock이 이미 "player" 하드코딩을 subject 기준으로 갱신한 것과 같은 선례를 적용), `data:{to}` |
| `relation` | `{op, from?, to?, add?, mode?, tag?, untag?}` | **구현됨(D-43, V2-Core-07).** `add`/`mode`/`tag`/`untag`는 한 Effect 안에서 임의로 조합될 수 있으며 각각 독립적으로 검증·적용된다. `add`가 있으면 정수여야 한다. `mode`가 있으면 `"neutral"`/`"cooperation"`/`"conflict"` 중 하나여야 한다(그 외 값은 malformed→throw, 7.2절의 enum을 그대로 스키마 검증에 사용). `tag`/`untag`가 있으면 각각 string이어야 한다(그 외 malformed→throw). `from`/`to` 해석은 7.3절 기본값(`from`=target, `to`=self)과 위 공통 skip 규칙을 그대로 따른다. score는 `[-100,100]`으로 clamp한다. `mode`를 지정하면 그 값으로 설정하고 `cooperation`이면 `cooperationCount`, `conflict`이면 `conflictCount`를 **지정할 때마다 무조건** +1 한다(이전 값과 같아도 증가한다 — V1 `npc-relations.js`의 매일 재적용 semantics를 그대로 유지, 7.3절). `tag`는 `tags`에 없을 때만 추가 후 재정렬하고, `untag`는 있을 때만 제거한다(둘 다 idempotent). 네 필드 중 실제로 값이 바뀐 것이 하나라도 있으면(예: `mode`를 같은 값으로 다시 지정해도 카운터가 늘면 "바뀐 것"이다) edge를 lazy 생성/갱신하고 `lastDay`를 현재 day로 설정한다 — 아무것도 실제로 바뀌지 않으면(예: `add` 없음/0, `tag`가 이미 있음, `untag`가 이미 없음, `mode`가 이미 같은 값이고 neutral이라 카운터도 없음) edge를 만들지도 갱신하지도 않는다(순수 no-op, D-30 확장) | `relation.changed` (player: 플레이어가 한쪽 끝일 때 / 그 외 internal, D-31), `data:{from, to}`에 실제로 바뀐 필드만 조건부로 추가: `delta`(score가 바뀌었을 때만), `mode`(모드/카운터가 바뀌었을 때만, 값은 delta가 아니라 결과값), `tagAdded`(태그가 실제로 새로 추가됐을 때만), `tagRemoved`(태그가 실제로 제거됐을 때만) — `trait.changed`의 `removedExclusive?`처럼 조건부 선택 필드를 쓰는 기존 패턴을 재사용한 것이며 새 이벤트 타입을 만들지 않는다 (actorId 필드는 endpoint가 둘이라 쓰지 않는다) |
| `rumor` | `{op, rumor, subject?, source?, confidence?, from?, observe?}` | **구현됨(D-45/D-14 resolved, V2-Core-09).** 8.3절 — `from`이 있으면 복사 모드, `observe:true`면 관찰 모드(둘을 함께 쓰면 malformed→throw), 그 외에는 `source`+`confidence`(둘 다 필수)로 학습 모드. `rumor`은 string, `subject`/`from`은 있으면 string(4.3절 표준 subject 해석, 단 `relation`처럼 `state.actors` 레코드 존재는 요구하지 않음 — `state.knowledge`는 top-level ID-keyed 맵). `confidence`는 있으면 정수, `[0,100]`으로 clamp(D-28/D-32류) | `rumor.learned`(첫 학습) / `rumor.updated`(갱신), subject 기준 visibility(D-31), `data:{rumor, factId, claim, confidence, delta}` + 다른 claim으로 교체된 경우만 `claimChanged:true` |
| `fact` | `{op, fact, set}` | **구현됨(D-44, V2-Core-08).** `fact`는 string, `set`은 생략 불가(어떤 JSON 값이든 허용 — `null`/`false`/`0`/`""` 포함, 8.1절)이지만 `undefined`(필드 자체가 없음)면 malformed→throw. subject를 쓰지 않는 세계 단위 op(4.1절). `state.facts`가 없으면 lazy 생성(`case`/`flag`/`signal`과 같은 패턴 — D-33이 "재확인" 대상으로 남겨둔 부분을 이걸로 확정). 기존 값과 `set`이 같으면(JSON 값 비교) `case`의 "같은 stage" no-op과 동일하게 아무 것도 바꾸지 않는다(`since`도 갱신하지 않음) | `fact.changed` (**internal**), `data:{fact, value}` (flag/case의 "키+새 값" 패턴 재사용, 새 이벤트 타입 아님) |
| `flag` | `{op, key, value}` | **구현됨.** `key`는 string, `value`는 반드시 boolean(그 외 malformed). `state.flags`가 없으면 lazy 생성. 기존 값과 같으면 no-op(이벤트 없음) — 이전 초안의 `set`(임의 JSON, null이면 삭제)은 이 4개 op 구현 범위에서 `value`(boolean 전용, 삭제 없음)로 좁혀 확정했다(D-37). 문자열/숫자 flag나 키 삭제가 필요해지면 그때 별도 op나 인자를 추가한다 | `flag.changed` (internal), `data:{key, value}` |
| `signal` | `{op, key, add}` | **구현됨.** `key`는 string, `add`는 정수(기본값 없음 — 생략하면 malformed, 이전 초안의 "기본 add=1"은 폐기(D-37)). `state.signals`가 없으면 lazy 생성. 결과는 `[0, Number.MAX_SAFE_INTEGER]`로 clamp. 실제 변화량(delta = 적용 후−적용 전)이 0이면 이벤트 없음 | `signal.raised` (internal), `data:{key, delta: 실제 변화량}` |
| `item` | `{op, item, add, subject?}` | **구현됨.** `item`은 string, `add`는 정수(그 외 malformed→throw). subject 해석은 위 공통 규칙. 수량을 `[0, Number.MAX_SAFE_INTEGER]`로 clamp하며 변경한다. 0이 되면 키 삭제(기존 계약 유지) | `item.changed` (subject 기준, D-31), `data:{item, delta}` |
| `exp` | `{op, amount, subject?, system?}` | **구현됨(D-41 resolved, V2-Core-06 — 6.4절).** `amount`는 0 이상 정수(음수는 malformed→throw). subject/system 해석은 stat과 동일 공통 규칙. `actor.growth[system].exp += amount`, 레벨은 `expTable`로 재계산해 `level.max`로 clamp, 넘은 레벨마다 `levelRewards[level]`을 순서대로 적용 | `exp.gained`(subject 기준, D-31, `data:{system,delta}`) + 레벨마다 `level.up`(`data:{system,from,to}`) |
| `proficiency` | `{op, id, add, subject?, system?}` | **구현됨(D-42 resolved, V2-Core-06 — 6.4절).** `id`는 string, `add`는 0 이상 정수(음수는 malformed→throw). subject/system 해석은 공통 규칙. `actor.growth[system].proficiency[id]`를 `[0,max]`로 clamp하며 갱신(정의를 못 찾으면 상한 없음, stat과 동일), 넘은 threshold마다(`at` 오름차순) `effects`를 적용 | `proficiency.changed`(subject 기준, D-31, `data:{id,delta}`) |
| `skill` | `{op, skill, add?:1, subject?, system?}` | **구현됨.** `skill`은 string, `add`는 있으면 정수(생략 시 1, 그 외 malformed→throw). subject/system 해석은 stat과 동일(4.2절 상단 공통 규칙). `actor.growth[system].skills[skill]`을 `add`만큼 바꾸고 `data.growthSystems[system].skills`에서 정의를 찾아 `[0,maxRank]`로 clamp(정의를 못 찾으면 상한 없음, stat과 동일). 0이면 키 삭제(기존 계약 유지) | `skill.changed` (subject 기준, D-31), `data:{skill, delta}` |
| `trait` | `{op, trait, remove?:false, subject?, system?}` | **구현됨.** `trait`은 string, `remove`는 있으면 boolean(그 외 malformed→throw). subject/system 해석은 공통 규칙. `remove:true`면 `actor.growth[system].traits[trait]`을 삭제(없으면 no-op). 추가 시 `data.growthSystems[system].traits`에서 `trait`의 정의를 찾아 `exclusive` 목록에 있는, 현재 보유 중인 다른 trait을 함께 제거한다(정의를 못 찾으면 exclusive 처리 없이 추가만 한다) | `trait.changed` (subject 기준, D-31), `data:{trait, added, removedExclusive?}`(제거 시 `data:{trait, added:false}`) |
| `unlock` | `{op, id, subject?, system?}` | **구현됨.** `id`는 string(그 외 malformed→throw). subject/system 해석은 공통 규칙. `actor.growth[system].unlocks[id] = true`(idempotent — 이미 있으면 no-op) | `unlock.granted` (subject 기준, D-31; 이미 보유하면 이벤트 없음), `data:{id}` |
| `case` | `{op, case, stage}` | **구현됨.** `case`/`stage` 모두 string(그 외 malformed→throw). subject를 쓰지 않는 세계 단위 op(4.1절). `state.cases`가 없으면 lazy 생성. 같은 stage로 다시 설정하면 no-op. 그 외에는 `state.cases[case] = {stage, since: 현재 minute}`으로 갱신(§2.1의 "since: minute" 그대로 — day 아님) | `case.updated` (player), `data:{case, stage}` |
| `narrate` | `{op, textId}` | **구현됨(D-52, V2-Core-13).** `textId`는 string(그 외 malformed→throw). 세계 단위(4.1절 subject 무시 목록에 이미 있음), 진짜로 상태를 바꾸지 않는다(`data.texts[textId]`조차 조회하지 않는다 — 텍스트 내용은 UI/저장 계층이 `textId`로 직접 찾는다, 259줄 "이벤트는 textId만 참조한다"). **D-30의 "실제 변화 없으면 이벤트 없음"은 여기 적용되지 않는다** — narrate는 "state 필드를 설정"하는 것이 아니라 "이 서술이 지금 일어났다"는 사실 자체가 효과이므로, 동일 `textId`를 반복해도 매번 이벤트가 난다(`time.advanced`가 매 `wait`마다 나는 것과 같은 이유 — 비교할 "이전 값"이 애초에 없다) | `narration` (player), `data:{textId}` |
| `choice` | `{op, choice, sourceId?}` | **구현됨(D-35 resolved, V2-Core-12).** `choice`는 string(그 외 malformed→throw). `sourceId`는 있으면 string(그 외 malformed→throw) — 어떤 event/case/action이 이 선택지를 띄웠는지 콘텐츠 작성자가 직접 남기는 불투명한 라벨일 뿐, 엔진이 자동으로 추론하지 않는다(`rumor`의 `source`와 같은 패턴). subject 없음(4.1절 세계 단위 목록). `state.pending = {kind:"choice", choiceId: choice, sourceId?}`을 무조건 덮어쓴다(한 Effect 리스트 안에서 여러 `choice`/`newCharacter`류 pending이 겹치면 마지막 것이 이긴다 — 새 우선순위 로직을 만들지 않고 기존 "나중 Effect가 이긴다"는 순차 적용 규칙 그대로 적용). 결과 pending이 기존과 완전히 같으면(JSON 비교) no-op(D-30, `fact`와 같은 패턴) | `choice.offered` (player), `data:{choiceId, sourceId?}` |
| `if` | `{op, when:Condition, then:[Effect,...], else?:[Effect,...]}` | **구현됨.** `then`은 필수 배열, `else`는 선택 배열(없으면 조건이 거짓일 때 아무 것도 하지 않음). `when`은 `evaluateCondition(when, {...ctx, contextKind:"world"})`으로 평가한다(§3.3과 일치) — `when`이 malformed여도 throw하지 않고 `evaluateCondition`이 반환하는 `false`를 그대로 따른다(4.1절 D-28). `then`/`else`가 배열이 아니면(malformed) throw. 선택된 branch는 **같은 작업 사본을 공유**하며 depth-first로 즉시 적용한다 | 자체 이벤트 없음. `then`/`else` 내부 Effect는 각자 이벤트를 낸다 |
| `handler` | `{op, name, params}` | 4.4절 | handler가 반환한 이벤트 |

- 모든 Effect에 선택 인자 `subject`를 허용한다 (`fact`, `flag`, `signal`, `time`, `narrate`, `choice`, `case`는 세계 단위이므로 subject를 무시한다).
- `if`와 `narrate`, `choice`를 추가한 이유:
  - `if`: 조건 분기를 handler 없이 선언형으로 표현한다.
  - `narrate`: 텍스트 RPG의 서술을 데이터로 분리한다.
  - `choice`: 선택지 시스템을 사건과 연결한다.
- **확장 규칙**: 새 op를 추가하려면 이 표, validateData, 적용 및 경계값 테스트, 이벤트 visibility 결정이 함께 필요하다.

### 4.3 Effect 대상이 없을 때 (D-29 확정)

- 정적 참조(데이터에 적힌 ID)는 `validateData`가 존재 여부를 검사한다. D-56(V2-Core-16)이 구현한
  범위는 `world.growthSystemId`/`.startTemplateId`, `characterTemplates[*].locationId`,
  `locations[*].links[*].to`이며, D-58(V2-Core-18)이 `choice`→`data.choices`와
  `check.difficulty`(문자열)→`data.rules.check.difficulties`를, D-60(V2-Core-19)이
  `characterTemplates[*].locationId`의 필수 여부(존재 자체)와 `check`/`difficulty`의 shape을
  더 넓혔다. item/growth stat·skill·trait·proficiency·unlock/case/rumor 정의가 참조하는 개별
  ID는 **의도적으로 범위 밖**이다 — op별 malformed 스키마를 발명해야 해서가 아니라(D-58 재검토
  결과), §4.2/§6.4/§8.3이 이미 "정의를 못 찾으면 그대로/우아하게 적용"을 명시적으로 선언해 참조가
  없어도 정상 동작이 보장되기 때문이다(D-58 참고, blocker 아님 — 검사하면 오히려 이미 확정된
  기능을 깨뜨리는 새 제약이 된다).
- 동적 참조(`target`)는 Resolvable을 통해 들어올 경우 step 2~4단계에서 존재하지 않으면 reject된다.
  하지만 `applyEffects`는 Resolvable/step 없이도 독립적으로 호출될 수 있고(D-40, 아직 `step()`에
  연결되지 않음), trigger(§2.5 10단계)나 사망 후 succession(§9)처럼애초에 2~4단계를 거치지 않는
  경로도 있다. 그래서 "target은 항상 존재한다"는 가정에 의존하지 않고, **Effect 자신이 대상 부재를
  안전하게 처리한다**:
  - subject/`from`/`to`의 **타입**이 틀리면(`"self"`/`"target"`/문자열 ID가 아니면) malformed로
    **throw**한다(D-28).
  - 타입은 맞지만 **가리키는 대상을 찾을 수 없으면**(`"target"`인데 `ctx.targetId` 없음, 명시 ID가
    `state.actors`에 없음, `stat`의 `system`을 못 찾음) **throw하지 않고, lazy actor를 만들지 않고,
    state를 바꾸지 않고, 이벤트도 만들지 않은 채 다음 Effect로 계속 진행한다(skip)**.
  - `flag`/`signal`/`time`/`if`는 애초에 subject를 쓰지 않으므로(4.1절) 이 절의 영향을 받지 않는다.
  - 4.2절 표의 `stat`/`hp`/`money`/`item`/`relation` 행이 이 규칙의 구체적인 적용례다.

### 4.4 예외 handler registry

> **검토 결과 (V2-Core-13): 의도적으로 미구현 — blocker 아님.** `web/v2/core/handlers.js`는
> "첫 handler가 실제로 필요할 때 만든다"(아래)는 조건이 이번 라운드에도 충족되지 않았다: 지금
> 존재하는 모든 Effect/Condition은 이미 있는 선언형 op(`and`/`or`/`not`/`if` 조합 포함)로 표현되며,
> handler를 쓰기 위한 3가지 조건(① 기존 op로 표현 불가 ② `reason` 문자열 ③ 전용 테스트) 중 ①을
> 만족하는 실제 사례가 하나도 없다. 지금 빈 registry만 만들어 두는 것은 "실제로 필요해질 때 만든다"는
> 이 절 자신의 게이팅 조건을 앞당기는 것이고, 외부 JS 함수 실행 경로를 실사용처 없이 여는 것이므로
> YAGNI에 반한다. 계약(호출 시그니처, malformed/미등록 name 정책, D-38)은 이미 아래처럼 충분히
> 확정돼 있으므로 **blocker가 아니라 "아직 때가 아님"**이며, 실제 콘텐츠에 ①을 만족하는 사례가 생기면
> 그때 `handlers.js`와 registry를 만든다.


- JSON에서의 형태: `{ "op":"handler", "name":"<namespace>.<name>", "params":{...} }`. Condition과 Effect 모두에 쓸 수 있다.
- 등록 위치: `web/v2/core/handlers.js`가 `Object.freeze`된 `{ [name]: { kind, fn } }`를 export한다.
  첫 handler가 필요해질 때 만든다.
  - 이유: 함수는 JSON에 들어갈 수 없고 `step(state, action, data)` 시그니처를 유지해야 하므로, 코드 모듈에서 정적으로 import한다.
  - 확장: 세계별 handler가 늘어나면 `handlers/<worldId>.js`로 나누고, registry가 병합한다 (D-04).
- 호출 계약:
  - Condition handler: `fn(ctx, params) -> boolean`
  - Effect handler: `fn(ctx, params) -> { state, events }` (D-27 확정 — `rng`는 반환하지 않는다.
    RNG가 필요하면 `ctx.state.rng`를 직접 읽고 쓴다. `state.rng`가 유일한 rng 원천이다)
  - 순수하고 결정론적이어야 한다. 입력을 변경하지 않고, 금지 의존성(1.1절)을 쓰지 않는다.
- handler를 쓰려면 다음 **조건**을 모두 만족해야 한다:
  - (1) 기존 op와 `if`, `and`/`or`/`not` 조합으로 표현할 수 없다.
  - (2) 데이터 정의에 `"reason"` 문자열로 이유를 남긴다.
  - (3) 전용 테스트가 있다.
  - validateData는 `reason`이 없는 handler 참조와 등록되지 않은 name을 오류로 처리한다.
- handler는 **기본 경로가 아니다.** 같은 패턴의 handler가 3개 이상 생기면 선언형 op로 승격할지 검토한다.
- **등록되지 않은 handler name (D-38 — 정책 차원에서 정리, handler 자체는 아직 미구현)**: Condition과
  Effect가 서로 다르게 처리해도 모순이 아니다. Condition의 `handler` op가 등록되지 않은 name을 만나면
  Condition의 일반 정책(§3.1 — 알 수 없는/평가할 수 없는 op는 `false`)을 그대로 따르고, Effect의
  `handler` op가 등록되지 않은 name을 만나면 Effect의 일반 정책(4.1절 D-28 — malformed는 throw)을
  그대로 따른다. 두 시스템이 각자의 malformed 정책을 handler op에도 똑같이 적용하는 것뿐이며, 실제
  `handlers.js`와 registry를 구현하는 시점에 이 정리가 맞는지 다시 확인한다.

---

## 5. check()

### 5.1 입력 (CheckSpec, 데이터에 선언)

```jsonc
{
  "stat": "stat_a",              // 선택
  "skill": "skill_a",            // 선택
  "proficiency": "prof_a",       // 선택
  "tags": ["combat"],            // 아이템/특성 modifier 매칭용
  "difficulty": 12,              // 정수, 또는 "normal"(data.rules.check.difficulties의 이름), 또는 아래 opposed 형태
  // "difficulty": { "base": 10, "opposed": { "subject": "target", "stat": "stat_a", "skill": "skill_b" } }
  "situational": [ { "source": "cover", "value": 2 } ],   // 고정 상황 보정 (선택)
  "attemptKey": "door_1",        // 선택 (5.6절)
  "useRelation": true            // targetId가 있을 때 관계 보정 적용 (기본값 false)
}
```

### 5.2 출력

```jsonc
{
  "tier": "great" | "success" | "partial" | "fail",
  "dice": [7, 5],
  "roll": 12,
  "modifiers": [ { "source": "stat:stat_a", "value": 2 }, { "source": "skill:skill_a", "value": 3 } ],
  "total": 17,
  "difficulty": 12,
  "margin": 5
}
```

함수 시그니처: `check(spec, ctx) -> { result, rng }`. 엔진은 `check.resolved` 이벤트(`data: result`)를 발생시킨다.

### 5.3 굴림과 등급 (수치는 data에 두고, 엔진은 규칙만 가진다)

```jsonc
// data.rules.check (제안 기본값이며 밸런스는 테스트로 확정)
{
  "dice": { "count": 2, "sides": 10 },                       // 2..20, 종형 분포
  "tiers": { "great": 6, "success": 0, "partial": -3 },       // margin 임계값
  "difficulties": { "easy": 8, "normal": 11, "hard": 14, "extreme": 17 },
  "statModifier": { "pivot": 10, "step": 2 },                 // floor((stat - pivot) / step)
  "relationModifier": { "step": 25 },                         // floor(score / step) -> -4..+4
  "maxTotalModifier": null                                    // D-09 (미구현: 어떤 값을 넣어도 무시된다, D-69)
}
```

- `margin = total - difficulty`. 등급 판정은 `margin ≥ great`이면 great, `≥ success`이면 success,
  `≥ partial`이면 partial, 나머지는 fail이다.
  - 이유: 임계값이 데이터에 있으므로 세계별로 난이도 곡선을 바꿔도 엔진은 그대로다.
  - 확장: 세계마다 주사위 체계를 다르게 둘 수 있다 (세계별 성장체계 분리 원칙과 맞음).
- 자연값 특수 규칙(최대 눈 = 자동 great 등)은 **두지 않는다** (YAGNI). 필요해지면 `tiers`에 선언형으로 추가한다.

### 5.4 modifier 합산 순서 (고정)

`stat → skill → proficiency → item → trait → relation → situational`

- 합은 순서와 무관하지만, **breakdown 기록 순서**와 향후 cap 적용 순서를 고정하기 위해 명시한다.
- 각 modifier의 출처는 다음과 같다.
  - stat: 5.3 statModifier 공식
  - skill: `rank × skill.checkBonusPerRank`
  - proficiency: `floor(points / prof.checkStep)`
  - item: 보유 아이템 정의 중 `modifiers[].tags`가 spec.tags와 겹치는 항목의 value 합 (보유 기준인지 장착 기준인지는 D-10)
  - trait: item과 같은 방식
  - relation: useRelation이 true이고 targetId가 있으면 `target → self` edge의 score로 계산
  - situational: spec 값을 그대로 사용
- 0인 modifier는 breakdown에 넣지 않는다.

### 5.5 difficulty 계산

- 정수이면 그대로 쓰고, 이름이면 `difficulties`에서 조회한다.
- opposed이면 `base + 상대(subject)의 stat, skill modifier 합`으로 계산한다. **상대는 굴리지 않는다** (굴림은 1회).
  - 이유: 굴림이 1회면 결과 분포가 단순하고 테스트하기 쉽다. 전투도 같은 함수를 쓴다.
  - 확장: 상대도 굴리는 대항 굴림이 필요해지면 `opposed.roll: true` 옵션을 추가한다 (하위 호환).

### 5.6 attempt

- `attemptKey`가 있으면 판정 후 `state.attempts[key] += 1`을 한다.
  - data의 `rules.check.retryPenalty`(기본 0)가 있으면 difficulty에 `attempts × retryPenalty`를 더한다.
  - data에 `maxAttempts`가 있으면 초과 시도는 requires 단계에서 막는다. 이를 위해 `attempts` Condition op를 추가할지는 D-11에서 정한다.
- 재시도하면 rng cursor가 이미 전진했으므로 다른 결과가 나온다. 반면 저장을 복원해 다시 시도하면 **같은 결과**가 나온다.
  - 이유: 반복 시도를 무의미한 루프가 아니라 시간과 비용이 드는 선택으로 만든다.

### 5.7 전투와 일반 사건

- 전투는 `data.events` 또는 `data.cases` 안의 **Resolvable 연쇄**다.
  - 각 라운드: `choice` Effect로 선택지 제시 → 플레이어의 `choose` → 옵션의 `check`(tags:["combat"], opposed difficulty)
    → outcomes에서 hp, relation, fact, case 등을 변경 → 다음 `choice` 또는 종료.
- 적 hp는 `actors[npc].hp`이고, hp가 0이 되면 같은 사망 규칙(9절)을 적용한다.
- 전투 전용 엔진, 전투 전용 UI, 턴 큐를 두지 않는다. **같은 `check()`와 같은 Resolvable을 쓴다.**
  - 확장: 동료나 다수 적이 필요해지면 opposed subject 확장과 라운드 데이터로 표현한다.

---

## 6. GrowthSystem (엔진 스키마만. 콘텐츠 없음)

### 6.1 GrowthSystem (data, 세계별)

```jsonc
{
  "id": "growth_fantasy",
  "stats": [ Stat, ... ],
  "level": { "max": 50, "expTable": [0, 100, 250] } ,   // 또는 null (레벨 없는 체계). 인덱스 i = 레벨 i+1에 필요한 누적 exp
  "levelRewards": { "2": [Effect, ...] },                 // 레벨 도달 시 Effect (stat 증가, unlock 등)
  "proficiencies": [ Proficiency, ... ],
  "skills": [ Skill, ... ],
  "traits": [ Trait, ... ],
  "unlocks": [ Unlock, ... ]
}
```

- `data.world.growthSystemId`가 이 세계의 기본 성장체계를 가리킨다.

### 6.2 정의 스키마

```jsonc
// Stat
{ "id": "stat_a", "min": 0, "max": 99, "base": 5 }

// Proficiency: 사용 기반 성장. 임계값에 도달하면 Effect 발동
{ "id": "prof_a", "max": 1000, "checkStep": 100,
  "thresholds": [ { "at": 100, "effects": [Effect, ...] } ] }

// Skill
{ "id": "skill_a", "maxRank": 5, "checkBonusPerRank": 1, "tags": ["tag_x"],
  "requires": Condition /* 습득 조건. world 문맥 */ }

// Trait
{ "id": "trait_a", "modifiers": [ { "tags": ["tag_x"], "value": 1 } ],
  "exclusive": ["trait_b"], "requires": Condition }

// Unlock: 행동, 선택지, 시스템, 지역 접근의 키. 자체 로직은 없고 Condition(`unlock`)에서 참조된다
{ "id": "unl_a", "kind": "action" | "choice" | "system" | "location" | "other" }
```

### 6.3 GrowthState (actor 상태)

```jsonc
"growth": {
  "growth_fantasy": {
    "level": 1, "exp": 0,
    "stats": { "stat_a": 5 },
    "proficiency": { "prof_a": 0 },
    "skills": { "skill_a": 1 },
    "traits": { "trait_a": true },
    "unlocks": { "unl_a": true }
  }
}
```

- **성장체계 ID를 키로 하는 맵**이다. 하나의 actor가 여러 세계의 성장체계를 동시에 가질 수 있다.
  - 이유: 다른 세계로 이동하면 그 세계의 성장체계를 새로 획득한다는 장기 구조를 schemaVersion 변경 없이 수용한다.
  - 확장: 세계 간 재해석(한 체계의 성장을 다른 체계로 변환)은 **구현하지 않는다**. 필요해지면 handler나 별도 계약으로 추가한다.
- Condition과 Effect의 성장 연산자는 선택 인자 `system`을 받는다. 생략하면 `data.world.growthSystemId`다.
- traits와 unlocks를 배열이 아닌 `{id:true}` 맵으로 둔 이유: 중복을 자연스럽게 막고, 순서가 결정론에 영향을 주지 않게 한다.

### 6.4 성장 규칙

> **구현 상태**: 이 절이 설명하는 `exp`/`proficiency` Effect는 **계약 확정, 구현 완료**다
> (D-41, D-42 resolved, 아래 6.4.1/6.4.2, V2-Core-06에서 `web/v2/core/rules.js`에 계약 그대로
> 구현했다). `skill`/`trait`/`unlock`도 이미 구현했다(4.2절) — 이들은 이 절의 레벨/임계값 곡선과
> 무관하게 동작한다.

- exp: 누적한 뒤 `expTable`을 넘은 만큼 레벨을 올린다. 한 번에 여러 레벨이 오를 수 있으며,
  레벨마다 `levelRewards[level]`을 순서대로 적용하고 `level.up` 이벤트를 발생시킨다.
- proficiency: 누적하면서 `thresholds[].at`를 **처음 넘을 때 한 번** effects를 적용한다 (이전 값 < at ≤ 새 값).
- 레벨은 **보상 트리거**이지 게이트가 아니다. 행동과 지역은 `unlock`, `skill`, `proficiency`, `stat`로 게이팅한다 (D-08).
  - 이유: 레벨 수치 경쟁이 세계 탐험을 막지 않게 하고, 성장이 새 행동과 선택지로 이어지게 한다.
  - 확장: 레벨 없는 성장체계(`level: null`)도 같은 스키마로 표현할 수 있다.
- 스탯 포인트를 직접 배분(플레이어가 선택)하는 기능은 스키마에 없다. 필요하면 `choice` Effect로 levelRewards에서 제시한다 (D-12).

#### 6.4.1 `exp` Effect 계약 (D-41 resolved)

**입력**: `{"op":"exp", "amount":<정수 ≥0>, "subject"?:Subject, "system"?:"<id>"}`. 인자 이름은 이미
확정되어 있던 §4.2 초안(`amount`)을 그대로 쓴다 — `add`로 바꾸지 않는다. `subject`/`system` 해석은
4.2절 상단 공통 규칙(stat과 동일)을 그대로 재사용한다.

- **음수 금지 (D-41-2)**: `amount`는 `Number.isInteger(amount) && amount >= 0`이어야 한다. 음수는
  malformed → **throw**(D-28). `amount:0`은 다른 누적형 Effect(signal/stat/skill)와 동일하게 합법적인
  no-op이다(이벤트 없음). **경험치 손실/디레벨은 이 Effect로 표현하지 않는다** — 별도 시스템이나
  handler가 필요해지면 그때 새로 설계한다. 기존 철학과의 충돌: 없음 — AGENTS.md/CORE_CONTRACTS.md
  어디에도 "성장이 되돌아갈 수 있어야 한다"는 요구가 없고, 경험치의 단조 증가는 통상적인 RPG 관행이다.
- **level 계산 (D-41-3)**: 새 level 계산 공식을 만들지 않는다. §6.1의 기존 주석을 그대로 기계적으로
  적용한다 — `expTable`의 인덱스 `i`는 "레벨 `i+1`에 필요한 누적 exp"이므로:
  ```
  rawLevel = expTable.filter(v => exp >= v).length      // 1-based, expTable[0]이 보통 0이라 exp>=0이면 항상 ≥1
  level    = level.max가 있으면 Math.min(rawLevel, level.max), 없으면 rawLevel
  ```
  `data.growthSystems[system].level`이 `null`이거나 정의 자체가 없으면 **레벨 없는 체계**다 — `exp`는
  그대로 누적되지만(§6.3 참고용으로 보존) `level`은 절대 바뀌지 않고 `levelRewards`도 적용하지 않는다.
  `exp` 자체의 상한은 다른 누적형 값과 동일하게 `Number.MAX_SAFE_INTEGER`다(안전 상한, 실질적으로
  도달하지 않음). `level.max`에 이미 도달한 뒤에도 exp는 계속 쌓이지만 level과 levelRewards는 더
  진행되지 않는다.
  - `actor.growth[system]`이 아직 없으면(lazy) `{level:1, exp:0}`에서 시작한다(§6.3 기본 GrowthState와 동일).
- **levelRewards 적용 순서 (D-41-4)**: 한 번의 `exp` Effect로 `oldLevel`에서 `newLevel`로 여러 레벨을
  넘으면, `oldLevel+1, oldLevel+2, ..., newLevel` 순서로 각 레벨의 `levelRewards[String(level)]`(정의가
  있을 때만)을 **같은 작업 사본을 공유**하며 depth-first로 즉시 적용한다(기존 `if.then`과 동일한
  `applyEffectList` 재사용 — 새 메커니즘을 만들지 않는다). 그 직후 그 레벨의 `level.up` 이벤트를 낸다.
  - **reward ctx**: `resolvedActorId`(exp Effect의 subject가 가리키는 실제 actor)를 `actorId`로 하는
    `{ ...ctx, actorId: resolvedActorId }`를 만들어 넘긴다 — §9 succession이 이미 "새 캐릭터/이전
    캐릭터"로 ctx를 재구성하는 것과 같은 패턴이다. 이래야 reward 안의 `subject:"self"`(생략 시 기본값)가
    실제로 레벨업한 actor를 가리킨다. `targetId`/`data`는 원래 ctx 그대로 둔다.
  - **재귀(cascade) 허용, 새 제한 불필요**: reward 안에 다시 `exp`/`proficiency` Effect가 있으면
    자연스럽게 재귀 호출되어 추가 레벨업/threshold를 유발할 수 있다. **무한 루프는 구조적으로
    불가능하다** — `amount`가 음수를 허용하지 않아 exp가 단조 증가하고, `level`은 `level.max`(유한한
    데이터 값)로 상한이 있으므로, 한 번의 최상위 호출에서 처리되는 "레벨 전이" 총 횟수는
    `level.max - 최초 level`을 넘을 수 없다. 그래서 trigger(§2.5 10단계)처럼 별도의 "연쇄 1단계 제한"을
    새로 둘 필요가 없다 — 이미 있는 D-41-2(음수 금지)와 데이터의 `level.max`가 함께 무한 루프를 막는다.
- **`level.up` 이벤트 (D-41-5)**: 레벨마다(여러 레벨을 넘으면 레벨 수만큼) 각각 하나씩 낸다 — "최종
  레벨에 대해 1개"가 아니라 "레벨당 1개"다(§6.4 기존 문구 "레벨마다... 이벤트를 발생시킨다"와 일치).
  ```jsonc
  { "minute": ..., "type": "level.up", "visibility": <D-31>, "actorId": resolvedActorId,
    "data": { "system": "<growthSystemId>", "from": <이전 레벨>, "to": <이전 레벨+1> } }
  ```
  visibility는 D-31 그대로(대상이 `state.player.actorId`면 `player`, 아니면 `internal`).
- **`exp.gained` 이벤트**: exp 자체가 실제로 바뀌면(위에서 `amount>0`이면 항상) 1개 낸다.
  `data:{system, delta}` — `delta`는 실제 적용된 변화량(현재는 상한에 걸리지 않는 한 `amount`와 같다).
  `amount:0`이거나 대상을 해석할 수 없으면(D-29 skip) 이벤트 없음.

#### 6.4.2 `proficiency` Effect 계약 (D-42 resolved)

**입력**: `{"op":"proficiency", "id":"<string>", "add":<정수 ≥0>, "subject"?:Subject, "system"?:"<id>"}`.
`id`/`add`는 §4.2 초안에 이미 있던 이름을 그대로 쓴다.

- **clamp 확정 (D-42-1)**: `[0, max]`로 clamp한다 — Proficiency 정의(§6.2)의 `max` 필드를 **하드
  clamp 상한으로 확정**한다(이전 blocker였던 "메타데이터인지 clamp인지" 불명확함을 여기서 해소).
  정의를 찾지 못하면 stat/skill과 동일하게 하한(0)만 적용하고 상한은 두지 않는다(안전 상한은
  `Number.MAX_SAFE_INTEGER`). 미존재 proficiency는 0에서 시작(lazy, 기존 stat/skill 패턴과 동일).
- **음수 금지 (D-42-1 연장)**: `add`는 `Number.isInteger(add) && add >= 0`이어야 한다. 음수는
  malformed → throw. exp와 같은 이유이며, 이 결정 하나로 3-3의 하위 질문들이 전부 해소된다:
  - "35 → 15처럼 감소하는 경우"는 애초에 발생하지 않는다(음수 금지).
  - "이미 넘은 threshold를 다시 넘는 경우"(재진입)도 proficiency가 단조 증가이므로 발생할 수 없다 —
    한번 `at`를 넘으면 다시 그 아래로 내려가지 않으므로 §6.4의 기존 규칙("이전 값 < at ≤ 새 값")만으로
    각 threshold가 평생 정확히 한 번만 발동한다는 것이 보장된다. **별도의 "이미 발동한 threshold"
    추적 필드는 필요 없다**(새 GrowthState 필드를 만들지 않는다는 제약과도 맞는다).
- **threshold 적용 순서 (D-42-2)**: `thresholds` 배열을 **`at` 오름차순으로 정렬**한 뒤(데이터 저자가
  이미 정렬해 뒀다고 가정하지 않는다), `이전 값 < at ≤ 새 값`을 만족하는 threshold를 순서대로 통과하며
  각 `effects`를 depth-first로 즉시 적용한다(같은 작업 사본 공유, exp의 levelRewards와 동일한 구조).
  예: `0 → 35`, thresholds `[10,20,30]`이면 10 → 20 → 30 순서로 실행한다.
  - **reward ctx**: exp와 동일하게 `{ ...ctx, actorId: resolvedActorId }`.
  - **재귀(cascade)**: exp와 같은 이유로 안전하다 — `add` 음수 금지 + `thresholds` 배열이 유한하므로,
    한 번의 최상위 호출에서 같은 `id`의 threshold가 두 번 발동할 수 없고 전체 순회는 유한하다. 다른
    proficiency나 exp를 연쇄로 건드려도 각각 자신의 유한한 경계(자기 `thresholds` 길이, `level.max`)
    안에서 끝난다.
- **event**: `proficiency.changed`, subject 기준 visibility(D-31), `data:{id, delta}`(실제 적용된
  변화량). threshold 통과 자체를 알리는 별도 이벤트는 두지 않는다 — threshold의 `effects`가 만드는
  이벤트(예: `unlock.granted`)로 충분히 드러난다.

#### 6.4.3 공통: 재사용한 기존 패턴 (새로 만든 것 없음)

- 중첩 Effect 적용: 기존 `applyEffectList`를 그대로 재사용(`if.then`/`else`와 동일 메커니즘).
- reward/threshold ctx의 `actorId` 재구성: §9 succession의 `{actorId: 새 캐릭터, targetId: 이전 캐릭터}`
  패턴을 재사용.
- lazy 초기화, `system` 해석, subject 해석, D-29 skip, D-31 visibility, D-30 이벤트 규칙: 모두
  stat/skill/trait/unlock에 이미 구현된 것을 그대로 재사용한다. `web/v2/core/rules.js`의 기존
  `resolveActor`/`resolveGrowthSystemId`/`resolveSubjectId`/`applyEffectList`를 새로 만들지 않고 그대로
  호출한다.

---

## 7. RelationshipGraph

### 7.1 엔티티 ID와 edge key

- 엔티티 ID: 모두 2.1절의 ID 형식을 따르며, **종류는 접두어로 구분**한다.
  `player_<n>`(캐릭터 순번), `npc_<id>`, `org_<id>`.
  - 이유: 한 그래프에서 종류를 구분하는 가장 싼 방법이며, 별도 조회 없이 edge key만으로 종류를 알 수 있다.
- edge key: `"<from>:<to>"` (ID에는 `:`가 없으므로 모호하지 않다).
- **방향 그래프**: `npc_a:player_1`(NPC A가 플레이어를 어떻게 보는가)과 `player_1:npc_a`는 서로 다른 edge다.
  - 이유: 비대칭 관계(한쪽만 신뢰함)와 "플레이어의 행동과 자아 변화가 타인의 시선을 바꾼다"를 표현하려면 필요하다.
    V1은 NPC 쌍 기준이었다.
  - 확장: 상호 관계가 필요하면 Effect 2개로 표현한다. 조직 → 개인 태도는 `org_x:player_1`이다.
- edge는 처음 변경될 때 생성한다 (lazy). 없으면 기본값으로 간주한다.

### 7.2 Relation 값

```jsonc
{ "score": 0, "mode": "neutral", "lastDay": -1,
  "cooperationCount": 0, "conflictCount": 0, "tags": [] }
```

- score: -100..100 정수, 누적 태도.
- mode: `"neutral" | "cooperation" | "conflict"`. **마지막으로 명시된 상호작용 국면**이며 score에서 파생하지 않는다 (V1 의미 유지).
- lastDay: 마지막 변경 day.
- tags: 정렬된 고유 문자열 배열 (예: `member`, `debt`, `rival`).
- 신뢰, 공포, 호감 같은 다차원 필드는 **두지 않는다.** 필요해지면 필드를 추가하는 것은 하위 호환이다.
  - 이유: 초기에는 한 차원과 태그로 충분하며, 차원을 늘리면 Condition과 check 규칙이 곱절로 늘어난다.

### 7.3 relation Effect 적용 규칙

> **구현 상태 (D-43 resolved, V2-Core-07)**: `add`/`mode`/`tag`/`untag` 네 필드 모두 구현했다.
> "모든 적용 시 lastDay를 설정한다"는 **실제로 무언가 바뀐 적용에 한해서만** 적용되는 것으로
> 확정했다(D-30을 이 네 필드에 함께 적용한 것뿐, 새 원칙 아님) — `add` 없음/0/clamp로 delta 0,
> `tag`가 이미 있음, `untag`가 이미 없음, `mode`가 이미 같은 값이고 카운터도 안 늘어나는 경우에는
> edge를 만들거나 갱신하지 않는다. 네 필드는 한 Effect 안에서 임의로 조합될 수 있고, 그중 하나라도
> 실제 변화를 만들면 edge를 한 번만 갱신하고 `relation.changed` 이벤트도 한 번만 낸다(D-30의
> "Effect 1개당 이벤트 1개" 단위를 필드 단위가 아니라 Effect 단위로 유지) — 이벤트의 `data`는 실제로
> 바뀐 필드만 조건부로 담는다 (4.2절 표 참고).

- `add`: score에 더한 뒤 clamp한다.
- `mode`: 지정하면 그 값(`"neutral"`/`"cooperation"`/`"conflict"`, 그 외는 malformed→throw)으로
  설정한다. **지정할 때마다 무조건** cooperation이면 cooperationCount, conflict이면 conflictCount를
  +1 한다 — 이전 값과 같은 mode를 다시 지정해도 증가한다. neutral은 아무 카운터도 늘리지 않는다.
  (V1 `web/core/npc-relations.js`의 "매일 재적용되는 mode 판정마다 카운터가 오른다" semantics를 그대로
  유지한 것이며, "값이 실제로 바뀔 때만 카운터가 오른다"는 별도 정책이 아니다.)
- `tag`/`untag`: `tags`는 정렬된 고유 문자열 배열이다(7.2절). `tag`는 이미 있으면 no-op, 없으면
  추가 후 재정렬한다. `untag`는 있으면 제거, 없으면 no-op이다. 한 Effect 안에서 `tag`와 `untag`가
  같은 문자열을 가리켜 서로 상쇄되면(추가 직후 같은 값을 제거) `tags` 최종 결과가 적용 전과 같으므로
  변화 없음으로 취급한다(D-30) — "추가와 제거를 각각 카운트"하지 않고 최종 배열 기준으로 판단한다.
- 위 세 종류(`add`/`mode`/`tag,untag`) 중 하나라도 실제로 값을 바꾸면, 그 적용에서 `lastDay`를 현재
  day로 설정한다.
- `from` 기본값은 `target`이다 (행동 대상이 나를 어떻게 보는가). `to` 기본값은 `self`다.
  - 이유: 플레이어 행동의 결과는 대부분 "상대의 나에 대한 태도" 변화이기 때문이다.
- 조직 소속은 `npc_a:org_b`에 tag `member`를 다는 방식으로 표현한다 (D-13에서 확정).
  NPC 태도가 조직 태도로 **전파되지는 않는다** (초기).

### 7.4 Condition 참조

`{"op":"relation","from":"org_guild","to":"self","min":10}`, `{"op":"relation","from":"npc_a","to":"npc_b","mode":"conflict"}`
→ 3.2절 규칙대로 평가하며, 누락된 edge는 기본값으로 본다.

**관계 규칙과 시간에 따른 변화 (D-74, V2-Core-39)**: 관계는 `relation` Effect(행동/선택지/`data.events`/`rules.succession`)로만
바뀐다 — 시간이 지나도 저절로 감쇠하거나 다른 edge로 전파되지 않는다. `data.rules.relation`은 예약 필드다(§3.3, 실행 의미 없음).
조건부·반복·하루 단위·지연 관계 변화는 `data.events`로 쓴다. event 안의 `relation` Effect는 `from`을 명시한다 — 기본값 `target`은
event 문맥에 없어서 그 Effect는 오류 없이 건너뛰어진다(D-29); `to`를 생략하면 현재 플레이어다. 달력 하루에 한 번은 `day` selector와
edge별 `signal` 카운터를 비교하는 trigger로 쓴다(D-74). 여러 edge를 한꺼번에 다루는 규칙(감쇠, 전파, 정리)은 표현할 수 없고, 필요해지면
새 설계 결정이다(D-74의 다시 열 조건).

---

## 8. Fact / Rumor

### 8.1 Fact

- 정의는 data에 둔다: `data.facts[factId] = { "initial": <JSON 값> }` 또는
  `{ "initial": { "pickFrom": [v1, v2, v3] } }` (seed 기반 초기화: `deriveSeed(seed, "fact:"+id)`로 선택).
- 상태: `state.facts[factId] = { value, since }`.
- **구현 상태 (D-65, V2-Core-22에서 재확인)**: `initial`(고정값/`pickFrom` 모두)을 읽어
  `state.facts`를 채우는 런타임 코드는 **아직 없다** — `createInitialState`는 `data.facts`를 전혀
  읽지 않는다. `state.facts`는 오직 `fact` Effect(D-44)로만 lazy 생성된다. `initial`은 지금은
  콘텐츠 저자가 의도를 기록해 두는 문서용 필드일 뿐이며, 실제로 그 세계의 첫 상태를 결정하려면
  이벤트/행동의 `fact` Effect로 명시적으로 설정해야 한다.
  V2-Core-28 재조사(D-69): 여전히 소비 코드가 없다. 시점(`createInitialState`), 스트림 라벨(`fact:<id>`, local
  cursor 0), `since`(값이 설정된 minute이므로 생성 시점 0이 자연스러움)는 정해져 있지만, `pickFrom`이 쓸 seed
  입력(§2.7 참고, 세 가지 값이 서로 다름)과 인덱스 공식 등은 결정되지 않아 시딩은 구현하지 않는다.
  V2-Core-37 재확인(D-72): 여전히 소비 코드가 없고 `validateData`는 fact id만 검사한다 — `initial`의 어떤 모양(빈 `pickFrom`, 배열이 아닌 `pickFrom`,
  `pickFrom`과 다른 키가 함께 있는 객체, `null`, 생략)도 통과한다. 고정값 `initial`은 RNG가 필요 없어 seed 결정과 독립이지만, 생성 시 이벤트 유무·`since`·
  validator 정책은 여전히 정해지지 않았다(D-72의 C). 이 문단의 "정해진 조각"(시점/라벨/cursor 0/idempotent)만 계약이고 나머지는 계약이 아니다.
  **구현(D-76, V2-Core-43)**: `createInitialState`가 `initial`을 한 번 시딩한다. `pickFrom`을 가진 객체는
  `pickFrom[nextUint32({ seed: deriveSeed(state.worldSeed, "fact:"+id), cursor: 0 }).value % pickFrom.length]`, 그 밖의 값은 그대로이며
  `since`는 생성 시각(0), 생성 이벤트는 없고, `initial`이 없는 fact는 지금처럼 `fact` Effect로 lazy 생성된다. `validateData`는 배열이 아니거나 빈
  `pickFrom`과 `pickFrom` 옆의 다른 키를 보고한다(그런 `pickFrom`은 시딩하지 않는다).
- **플레이어 view에 포함하지 않는다.** fact 변경 이벤트는 internal이다.
  - 이유: 진실(예: 누가 범인인가)은 서버 권위 정보다. seed마다 달라지는 진실은 "고정 데이터 + seed 기반 초기화"로 만든다.
  - 확장: 서버로 전환하면 state.facts는 서버에만 존재하고 클라이언트는 view만 받는다.

### 8.2 RumorEntry (행위자별 지식)

```jsonc
state.knowledge["player_1"]["rum_a"] = {
  "rumorId": "rum_a",
  "factId": "fact_a",
  "claim": "value_b",          // 이 행위자가 믿는 주장 (fact 값과 같은 형태)
  "source": "npc_c",           // 최초 출처 (엔티티 ID 또는 "obs_<locationId>")
  "sources": ["npc_c"],        // 확인한 출처 목록 (정렬, 최대 8). 서로 다른 출처로 확인했는지 판정하는 데 필요
  "confidence": 45,            // 0..100 정수
  "confirmations": 1,
  "firstSeenDay": 2,
  "lastSeenDay": 2
}
```

- 요청 필드에 `sources`를 **추가**했다. `confirmations`를 "서로 다른 출처로 확인한 횟수"로 정의하려면 출처 중복을 판별해야 하기 때문이다 (V1도 `sources[]`를 쓴다).
- rumor 정의는 data에 둔다: `data.rumors[rumorId] = { "factId": "fact_a", "claim": "value_b" }` (틀린 claim일 수 있음).
- **정확성**은 저장하지 않는다. 엔진 내부 헬퍼 `isAccurate(state, entry) = deepEqual(entry.claim, state.facts[entry.factId]?.value)`로 **필요할 때 계산**하며, view와 이벤트에는 절대 넣지 않는다.
  - 이유: fact가 바뀌면 같은 claim도 참에서 거짓으로 바뀔 수 있다. 저장하면 동기화 문제가 생긴다.
  - 확장: NPC가 거짓을 믿고 행동하는 규칙, 추리 판정 등은 `world` 문맥의 handler나 향후 op로 이 헬퍼를 쓴다.

### 8.3 rumor Effect 적용 규칙

> **구현 상태 (D-45 resolved, D-14 resolved, V2-Core-09)**: V2-Core-08 검토에서 발견한 6개 gap을
> 모두 아래처럼 확정하고 구현했다. 요약: `subject?`(수신자, 기본값 self)를 4.1절의 일반 subject
> 규칙 그대로 추가했다. `from`은 필드가 **있으면** copy 모드가 선택되는 방식이라 별도 기본값이
> 필요 없다(없으면 다른 모드로 분기할 뿐이다). 재학습 confidence 증감폭은 `data.rules.rumor`의
> 이름 있는 필드(`relayLoss`/`newSourceGain`/`sameSourceGain`)로 데이터에 두고, 없으면 변화 0으로
> 안전하게 처리한다(콘텐츠 밸런스 수치를 엔진이 임의로 정하지 않기 위함 — `stat`/`skill`의 "정의를
> 못 찾으면 clamp 없이 적용"과 같은 안전한-기본값 원칙). `observe`/직접 학습 모두 "기본 confidence는
> 높다"의 정확한 수치를 만들어내지 않고, 대신 `confidence`를 **항상 명시적으로 요구**한다(생략 시
> malformed→throw) — `time` Effect가 `minutes`에 기본값을 두지 않는 것과 같은 태도다. D-14(상충
> claim)는 8.3절 자신의 "초기 제안"(confidence가 높은 쪽이 이긴다)을 그대로 확정하되, 동률이면
> "덮어쓰지 않는다"는 원문에 맞춰 기존 claim을 유지하는 결정적 규칙으로 다듬었다. 이벤트 `data`
> 스키마는 다른 구현된 op들의 "절대값 + delta" 패턴(`skill.changed`, `case.updated`)을 그대로
> 재사용해 새로 확정했다. 존재하지 않는 참조는 전부 D-29류 skip으로 통일했다(스키마 타입 오류만
> throw). 이 결정들의 근거는 아래 각 항목에 그대로 남겨둔다.

| 형태 | 의미 |
| --- | --- |
| `{op:"rumor", rumor:"rum_a", subject?, source:"npc_c", confidence:45}` | **학습 모드.** `data.rumors[rumor]` 정의의 고정 claim으로 학습한다 |
| `{op:"rumor", rumor:"rum_a", subject?, from:"npc_c"}` | **복사 모드.** `from`이 있으면 이 모드가 선택된다(다른 기본값 없음). npc_c의 지식 항목을 복사한다 (틀린 claim도 그대로 전파). confidence는 원본 값에서 `data.rules.rumor.relayLoss`(없으면 0)만큼 줄인다. 출처는 `from`으로 기록된다 |
| `{op:"rumor", rumor:"rum_a", subject?, observe:true, source:"obs_loc_a", confidence:80}` | **관찰 모드.** `data.rumors[rumor].factId`가 가리키는 `state.facts`의 **현재** 값을 claim으로 복사한다(직접 관찰). confidence는 "기본값이 높다"는 수치를 엔진이 임의로 만들지 않고 **호출자가 명시**한다 |

- `from`과 `observe:true`를 **함께 주면 malformed→throw**한다(어느 모드인지 스키마가 모순되므로, D-28).
- `subject`(수신자, 기본값 self)와 `from`(복사 대상)은 둘 다 4.3절의 표준 subject 해석을 쓰지만,
  `relation`의 `from`/`to`와 달리 **`state.actors`에 실제 actor 레코드가 있을 필요는 없다** —
  `state.knowledge`는 `state.relations`와 같은 top-level ID-keyed 맵이지 `actors[id]` 아래에
  중첩되지 않기 때문이다(8.2절). 그래서 actor 레코드 존재를 확인하는 `resolveActor`가 아니라
  `resolveSubjectId`만으로 충분하다(relation의 from/to가 이미 쓰는 것과 같은 방식). 해석 실패(예:
  `"target"`인데 `ctx.targetId` 없음)는 D-29대로 skip.
- 학습/관찰 모드는 `data.rumors[rumor]`가 없으면(또는 `factId`가 string이 아니면) skip한다(D-29류 —
  참조 대상이 없을 뿐 스키마 오류가 아니다). 복사 모드는 `from` actor의 `state.knowledge[from][rumor]`
  항목이 없으면(복사할 것이 없음) skip한다. 관찰 모드는 `state.facts[factId]`가 아직 없으면(관찰할
  진실이 아직 없음) skip한다.
- 처음 학습(해당 subject가 그 `rumor`를 처음 앎): 항목을 생성한다. `firstSeenDay = lastSeenDay = day`,
  `confirmations = 1`, `sources = [source]`. `rumor.learned` 이벤트 1개.
- 이미 아는 rumor에 **같은 claim**(JSON 값 비교)이 들어오면 재확인이다:
  - 새 출처(`sources`에 없던 출처)면: `confirmations += 1`, `sources`에 추가(정렬 유지, 이미 8개면
    더 추가하지 않지만 `confirmations`는 계속 오른다 — "확인한 출처 목록, 최대 8"은 목록 길이 상한이지
    확인 횟수 상한이 아니다), confidence를 `data.rules.rumor.newSourceGain`(없으면 0)만큼 증가(clamp).
  - 같은 출처(이미 `sources`에 있음)면: `sources`/`confirmations`는 그대로 두고, confidence만
    `data.rules.rumor.sameSourceGain`(없으면 0)만큼 증가(clamp).
  - 두 경우 모두 `lastSeenDay`를 현재 day로 갱신한다. confidence 변화도 없고 day도 이미 같으면(모두
    변화 없음) 순수 no-op(D-30, 이벤트 없음). 그 외에는 `rumor.updated` 이벤트 1개.
- 이미 아는 rumor에 **다른 claim**이 들어오면(D-14 resolved): 기존 항목의 claim을 **무조건** 덮어쓰지는
  않는다 — 들어온 claim의 confidence가 기존 confidence보다 **높을 때만** 전체 항목을 새 claim/source로
  교체한다(`sources=[incoming source]`, `confirmations=1`, `firstSeenDay=lastSeenDay=`현재 day — 다른
  claim은 별개의 새 믿음이므로). confidence가 **같거나 낮으면** 기존 항목을 그대로 유지한다(no-op,
  이벤트 없음) — 동차일 때 무작위로 아무 쪽이나 고르지 않고 항상 기존을 지키는 것으로 확정해
  결정론(§2.6)을 지킨다. 교체가 일어나면 `rumor.updated` 이벤트를 `data.claimChanged:true`와 함께 낸다.
- fact가 바뀌어도 누군가의 지식은 **자동으로 바뀌지 않는다.** 믿음은 낡을 수 있다.
- 이벤트: `rumor.learned`(첫 학습)/`rumor.updated`(기존 항목 갱신), subject 기준 visibility(D-31,
  `state.player.actorId`와 같으면 player), `actorId`는 수신자(subject). `data:{rumor, factId, claim,
  confidence, delta}` — `delta`는 `confidence - (기존 confidence ?? 0)`으로 다른 수치형 op(skill/
  stat/exp 등)와 같은 "before ?? 0" 관례를 그대로 쓴다. 다른 claim으로 교체된 경우만 `claimChanged:true`가
  추가된다(`trait.changed`의 `removedExclusive?`처럼 조건부 선택 필드). **정확성(`isAccurate`)은 절대
  이벤트에 넣지 않는다**(8.2절, 8.4절).

### 8.4 진실 비노출 경계

- `fact` Condition은 `contextKind:"world"`에서만 허용하며, validateData가 player 문맥에서의 사용을 오류로 처리한다.
  - 이유: 행동이나 선택지가 보이는지 여부 자체가 진실을 알려주는 오라클이 되기 때문이다.
  - **충돌 보고**: 요청의 "Condition은 모든 곳에서 동일하게 사용"과 부분적으로 충돌한다.
    **평가기와 문법은 동일하지만 `fact`만 문맥 제한을 둔다** (D-06).
- `view(state, data)`: 플레이어 캐릭터, 현재 위치, 보유 자원과 성장, 플레이어의 knowledge 항목(정확성 없음),
  플레이어가 한쪽 끝인 relation, pending, 가능한 행동 목록을 반환한다. facts, 다른 actor의 knowledge, internal 이벤트는 반환하지 않는다.
- 불가능한 행동을 목록에 보여줄지(비활성 표시)는 D-15에서 정한다 (초기 제안: 행동 정의의 `showWhenLocked:true`인 것만 이유 없이 표시).

---

## 9. 사망 / 계승

> **구현 상태 (D-34 resolved V2-Core-10, D-47 resolved V2-Core-11)**: `hp` Effect(4.2절)가 사망
> 트리거를 구현했다(V2-Core-10). `startCharacter`와 succession Effect 적용도 `engine.js`(이번
> 라운드부터 보호 해제)에 구현했다(V2-Core-11, D-47). **첫 캐릭터는 `startCharacter`를 거치지
> 않는다** — `createInitialState`가 `data.world.startTemplateId`(있으면)로 직접 `player_1`을
> 만든다. `startCharacter`는 오직 "사망 후"(`pending.kind==="newCharacter"`)에만 쓰이며, 이때만
> succession Effect가 적용된다(아래 D-47 참고).

- 트리거: `hp` Effect로 current가 0이 되면 **즉시** `alive=false`가 되고 `actor.died` 이벤트가 발생한다.
- 사망한 actor가 플레이어 캐릭터이면 `state.pending = {kind:"newCharacter"}`가 설정된다. 이 상태에서는 `startCharacter`만 허용한다.
- `startCharacter`:
  - `player_<characterCount+1>` actor를 생성한다. 초기값은 `data.characterTemplates[templateId]`에서 가져온다.
  - `state.player.actorId`를 갱신하고, `characterCount`를 +1 하며, `character.started` 이벤트를 발생시킨다.
  - **첫 캐릭터에는 쓰이지 않는다(D-47)**: `createInitialState`가 `data.world.startTemplateId`로 이미
    `player_1`을 만들어 두므로, `startCharacter`는 오직 사망 후 재생성 경로다.
- **세계는 유지된다**: time, facts, relations, knowledge, cases, 사망한 actor 기록이 그대로 남는다.
  NPC는 죽은 캐릭터와의 관계를 계속 "기억"한다.
  - **구현 확인 (V2-Core-34, D-70)**: 이 문장은 그대로 구현돼 있다 — `startCharacter`는 relations/flags/cases/fired/facts/knowledge/
    signals/attempts/time/rng를 하나도 바꾸지 않고 새 actor와 `rules.succession`의 효과만 더한다. 다만 "세계가 유지된다"와 "후계자가 물려받는다"는
    다르다: actor 소유 상태(items/money/hp/growth), `knowledge[actorId]`, 한쪽 끝이 `player_<n>`인 relation edge는 옛 ID에 묶인 채 남고 후계자의
    `self`/`view()`로는 닿지 않는다. 무엇을 물려줄지는 아래 문단대로 여전히 미정이다(D-70의 C).
  - **구현 확인 (V2-Core-36, D-71)**: 이 팩에서 후계자가 전 캐릭터에게서 받는 것은 **없다**. 받는 것은 template에서 새로 만든 actor와 `rules.succession`의
    고정 지급(`money +3`, 이 규칙은 `ctx.targetId`를 읽지 않는다 — 어떻게 죽었든 무엇을 가졌든 후계자의 actor는 같다)뿐이다. 세계가 유지되는 부분과 캐릭터에 묶인 부분의
    필드별 분류와 세계 보상이 누구에게 가는지의 실제 동작은 D-71에 있다. 계승 규칙을 새로 정한 것이 아니다 — 이 문단의 "아직 결정되지 않았다"는 그대로다.
  - **`wait` 경로의 사망(V2-Core-36 확인)**: 위 "사망이 일어난 그 `step()`은 나머지 파이프라인을 계속 진행한다"는 world 틱과 trigger 단계까지를 뜻한다.
    `wait`는 성공해도 `action.resolved`를 내지 않으므로(V2-Core-01의 "`wait` 성공 시 `time.advanced`" 계약 그대로, 사망 여부와 무관) `wait` 중에 죽으면 그 step의
    마지막 event는 `trigger.fired`/`narration` 등이고 `pending`은 설정된다. `perform`/`move`/`choose`/`startCharacter`가 사망을 일으키면 `action.resolved`로 끝난다.
    계약의 모순이 아니라 `wait`의 기존 성질이며, 바꾸지 않았다.
- **계승은 하드코딩하지 않는다.** 계약은 다음과 같다:
  `data.rules.succession = [Effect, ...]`를 새 캐릭터 생성 직후 적용한다. 이때 ctx는
  `{ actorId: 새 캐릭터, targetId: 이전 캐릭터 }`다. **기본값은 빈 배열**이므로 아무것도 계승하지 않는다.
  - 이유: 무엇을 계승할지(지식, 관계, 성장 일부)는 아직 결정되지 않았다. 빈 Effect 목록이라는 확장 지점만 두면 엔진은 바뀌지 않는다.
  - 확장: "이전 캐릭터 지식 일부 계승" 같은 규칙은 handler(`succession.*`)나 향후 op로 데이터에서 켠다.
    세계 이동(멀티버스) 계승은 **별도 계약**으로 둔다. `succession`을 재사용하지 않는다 (D-16).
  - **첫 캐릭터는 succession을 건너뛴다(D-47)** — 이전 캐릭터가 없으므로 적용할 것이 없다.
- **사망이 일어난 그 `step()` 호출은 나머지 파이프라인(9~11단계: world 틱, trigger, `action.resolved`)을
  계속 진행한다** — `pending`이 설정된 채로 정상 반환될 뿐, 조기 종료하지 않는다(D-34를 step() 레벨에도
  같은 원칙으로 확장 적용, D-47). `startCharacter`는 **다음** `step()` 호출(별도 action)에서 처리된다.
- 게임 종료 상태(`status`)는 두지 않는다. 사망해도 게임이 끝나지 않는 C안이기 때문이다 (YAGNI).

---

## 10. 저장 (구현은 뒤로 미룸, 계약만 정함)

- 엔진은 저장소를 import하지 않는다. 저장은 UI 계층의 선택 기능이다.
  **초기 엔진 구현과 테스트는 저장소 없이 완결된다.**
- IndexedDB: DB 이름 `txtrpg_v2`, 스토어 `saves` (keyPath `slot`).
  V1의 `AnonymousChroniclesDB`와 그 스토어(`saves/meta/world/simulation`)는 사용하지 않는다.
- localStorage를 쓴다면(필요할 때만) 키 접두어는 `txtrpg_v2.`다.
  **V1 키 `anonymous_chronicles_save_v2`와 `anonymous_chronicles_*` 계열 이름은 쓰지 않는다.**
  V1 키의 "v2"는 V1 내부 저장 포맷 버전을 뜻하며 이 프로젝트의 V2와 무관하다.
- 저장 레코드:

  ```jsonc
  { "slot": "slot_1", "schemaVersion": 1, "worldId": "...", "dataRef": {...},
    "savedAt": "<UI가 기록한 실제 시간>", "state": { ... } }
  ```

  - savedAt은 엔진 밖의 값이며 엔진은 읽지 않는다.
- 로드 순서: `migrateState(raw)` → `validateState` → 오류가 있으면 로드를 거부한다 (자동 수정하지 않음).
  - **구현 상태**: `validateState`는 **구현됨**(D-55, §2.1). `migrateState`도 **구현됨**(D-63,
    V2-Core-21) — `schemaVersion:1`만 지원하며, 존재하지 않는 구버전 변환(v0→v1 등)은 발명하지 않는다.
    자세한 semantics는 D-63 참고.
  - **record 헤더의 provenance와 데이터팩 호환성 (V2-Core-26 확인, V2-Core-27 확정, D-66/D-68)**:
    로드 파이프라인이 통과시키는 것은 `record.state`뿐이다 — 헤더의 `schemaVersion`/`worldId`/
    `dataRef`는 `list()`를 위해 state에서 복사한 색인이고 **state가 권위**라서 로드 시 읽히지 않는다.
    저장소 adapter는 현재 팩을 모르므로 provenance를 판정하지 않는다. 그 state를 **현재 팩**과 함께
    써도 되는지는 별도의 순수 함수 `checkDataCompatibility(state, data)`가 판정하고(`migrateState`/
    `validateState`는 그대로), 현재 팩을 가진 caller가 로드 경계에서 `validateState` 다음에 호출한다.
    호환이 아니면 그 로드를 거부하며 save는 삭제/수정하지 않는다. 정책의 정확한 내용은 D-68 참고.
- **저장 계층 구현 상태 (D-64, V2-Core-21)**: `web/v2/storage/idb.js`가 이 절의 레코드 형식/DB
  이름/스토어/keyPath를 그대로 구현한다 — `web/v2/core/*`는 이 파일을 import하지 않으며(엔진은
  IndexedDB를 모른다), `idb.js`가 `web/v2/core/engine.js`의 `validateState`/`migrateState`/
  `SCHEMA_VERSION`을 그대로 재사용해 저장/로드 경계를 검증한다. `save(slot, state, metadata)` /
  `load(slot)` / `list()` / `remove(slot)` 4개 함수만 제공한다(Ponytail — repository/DAO 추상화
  없음). `savedAt`은 `metadata.savedAt`이 있으면 그 값을, 없으면 어댑터가 직접 `Date.now()`로
  기록한다 — 엔진은 이 값을 전혀 모른다. 자세한 semantics는 D-64 참고.
- V1 세이브 import는 구현하지 않는다.
  - 확장: 서버 저장소로 옮길 때도 같은 레코드 형식을 쓴다.

---

## 11. 데이터 형식

- **data JSON + core JS engine** 구조를 쓴다. 엔진은 JSON을 import하거나 fetch하지 않고, `data` 인자로 받기만 한다.
  - 브라우저에서는 UI 계층이 `fetch`로 JSON을 읽어 전달한다. Node 테스트에서는 `fs.readFileSync` + `JSON.parse`로 읽는다.
  - 이유: JSON module import 문법(`with {type:"json"}`)의 호환성 문제를 피하고, 엔진의 순수성을 유지한다.
  - **구현 상태 (V2-Core-22/23)**: 실제 첫 데이터팩(`web/v2/data/world.js`)은 `.json` 파일이 아니라
    `export const worldData = {...}` 형태의 ES 모듈로 작성됐다 — 이 절이 제안한 "JSON 파일 +
    fetch/`fs.readFileSync`" 대신, Node 테스트(V2-Core-22)와 브라우저 UI(`web/v2/ui/app.js`,
    V2-Core-23) 모두 `import { worldData } from "../data/world.js"`로 **동일하게 정적 import**한다.
    엔진은 여전히 이 값을 `data` 인자로만 받으며 JSON/fetch를 직접 다루지 않으므로 "엔진은 JSON을
    import/fetch하지 않는다"는 원칙 자체는 그대로 지켜졌다 — 바뀐 것은 UI가 데이터를 얻는 방식(제안된
    fetch+JSON.parse 대신 정적 ES import)뿐이다. 실제 콘텐츠가 `.js` 모듈로 작성되는 한 fetch 경로를
    새로 만들 필요가 없었다(Ponytail — 이미 되는 것을 다시 구현하지 않는다).
- data 최상위 형태 (모든 컬렉션은 **ID를 키로 하는 객체**, 순회할 때는 키 정렬):

  ```jsonc
  {
    "formatVersion": 1,
    "id": "pack_id", "version": "0.1.0",
    "world": { "id": "...", "growthSystemId": "...", "startTemplateId": "..." },
    "rules": { "check": {}, "rumor": {}, "relation": {}, "succession": [] },
    "growthSystems": {}, "characterTemplates": {},
    "locations": {}, "actions": {}, "choices": {}, "events": {}, "cases": {},
    "items": {}, "facts": {}, "rumors": {}, "npcs": {}, "orgs": {}, "texts": {}
  }
  ```

- **characterTemplate (D-47 resolved, V2-Core-11)**: 어디에도 예시가 없던 스키마였으므로,
  이미 확정된 Actor 스키마(2.1절)의 필드 이름을 그대로 재사용해 확정한다(새 필드 이름을 만들지 않음).
  actor의 `id`/`alive`는 항상 엔진이 계산하므로(`id="player_<n>"`, `alive=true`) 템플릿에는 없다.

  ```jsonc
  // data.characterTemplates[templateId]
  { "kind": "player", "locationId": "loc_start", "hp": { "max": 10 },
    "money": 0, "inventory": { }, "growth": { }, "tags": [ ] }
  ```

  - `hp.current`는 템플릿에 없다 — 새 캐릭터는 항상 `hp.max`로 시작한다(만피 시작, 그 외 규칙은
    없음). 나머지 필드가 생략되면 Actor 스키마의 자연스러운 기본값(2.1절 예시와 동일: `money:0`,
    `inventory:{}`, `growth:{}`, `tags:[]`)을 쓰고, `locationId`는 생략 불가(필수)다 — 위치 없는
    actor는 `move`/`location` 계열과 앞뒤가 맞지 않는다.
  - 템플릿은 정적 필드만 복사한다. 별도의 "생성 시 Effect 목록"은 두지 않는다(YAGNI) — 초기
    아이템/성장은 템플릿의 `inventory`/`growth` 필드로 표현하고, 필요해지면 그때 확장한다.
- **location (D-48 resolved, V2-Core-11)**: 이 역시 예시가 없었으므로, 3.3절이 이미 이름 붙인
  필드(`requires`, `links[].requires`)와 Resolvable의 `minutes` 필드 이름을 그대로 재사용한다.

  ```jsonc
  // data.locations[locId]
  { "requires": Condition,                          // 이 지역 자체에 대한 접근 조건 (생략하면 항상 허용)
    "links": [ { "to": "loc_b", "requires": Condition, "minutes": 30 } ] }  // 나가는 단방향 연결
  ```

  - `move` action은 `data.locations[to]`가 없으면 `unknown_location`으로 reject한다(2.5절 4단계).
  - 현재 위치에서 `to`로 가는 `links[]` 항목이 없으면(또는 있어도 `requires`가 거짓이면)
    `requirements_not_met`으로 reject한다 — location 자체는 존재하므로 `unknown_location`이 아니다.
  - 링크의 `minutes`(생략하면 0)는 Resolvable의 `minutes`와 같은 방식으로 Effect 적용 뒤에
    `time` Effect로 자동 추가된다.
- **data.events[id] (D-51 resolved, V2-Core-12)**: Resolvable(2.3절)에 `trigger`/`once`/`cooldown`을
  더한 형태다. 필드 이름은 §2.5 10단계 원문("trigger가 참이고 once/cooldown을 통과하면 발동")이 이미
  쓴 단어를 그대로 가져온 것이며 새로 지어내지 않았다.

  ```jsonc
  // data.events[eventId]
  { "trigger": Condition,   // world 문맥(3.3절)에서 평가
    "once": true,           // 생략하면 false: 매번 재평가·재발동 가능
    "cooldown": 1440,       // 생략하면 쿨다운 없음: 마지막 발동 후 최소 경과 분
    "effects": [Effect, ...], "outcomes": {...}, "check": CheckSpec, "minutes": 30 } // 나머지는 Resolvable 그대로
  ```

  - `state.fired[eventId] = { count, lastMinute }`(2.1절에 이미 있던 필드, 이번에 실제로 채운다)로
    once/cooldown을 판정한다: `once`면 `count>0`일 때 건너뛰고, `cooldown`이 있으면
    `현재 minute - lastMinute < cooldown`이면 건너뛴다.
  - `data.events`를 id 오름차순으로 한 번만 순회하며(§2.5), 트리거된 이벤트의 Effect는 같은 작업
    사본에 바로 적용되어 **그 다음 순번의 트리거 판정에 즉시 보인다** — 새 트리거 조건이 이번 순회
    "이전" 순번에서 이미 참이 되었어도 이번 순회에서는 재평가하지 않는다(한 바퀴만 돈다는 뜻 자체가
    1단계 연쇄 제한이며, 별도 카운터를 두지 않는다).
- 파일 분할(세계당 JSON 한 개인지 여러 개인지)은 콘텐츠가 생길 때 정한다. 여러 개로 나누면 UI 로더가 병합한다.
- **첫 실제 데이터팩 (V2-Core-22)**: `web/v2/data/world.js`가 이 계약으로 표현 가능한 콘텐츠만으로
  만든 첫 실제 세계관 데이터다 — world 1개, characterTemplate 1개, location 3개, action 5개(그중
  하나는 `choice`로 분기), growthSystem 1개(stat 1개 + proficiency 1개 + unlock 1개, 실제로 성장이
  새 행동 접근으로 이어지는 예시), item 2개, fact/rumor 각 1개, npc 2개 + org 1개(relation
  edge/tag의 참조 ID로만 쓰이며 `state.actors` 레코드는 없음 — NPC actor 생성 자체가 아직 엔진에
  없다, 대규모 NPC scheduler는 범위 밖). `handler`, D-09, `completeWhen`/relation rule 실행
  semantics, `data.facts[*].initial` 시딩(D-65)에는 의존하지 않는다. `tests/v2/data-world.test.js`/
  `tests/v2-data-world-browser.spec.js`로 검증했다.
  **V2-Core-25 추가 연결 (Issue #80, 새 semantics 없음)**: 같은 데이터팩에 이미 구현된 mechanics만
  더 연결했다 — Resolvable `minutes`(긴 action 2개), `location` Condition(마을 행동 2개),
  `data.events` 1개(폐허에서 `cooldown`으로 반복 발동, `hp` Effect), `rules.succession`(`money`+
  `narrate`). 자세한 판정과 근거는 D-66의 V2-Core-25 후속 노트, 검증은
  `tests/v2/data-world-lifecycle.test.js`/`tests/v2-ui-lifecycle-browser.spec.js` 참고.
  **V2-Core-29 추가 (Issue #88, 새 semantics 없음)**: `act_buy_lantern`은 `loc_market`, `act_investigate_ruins`는
  `loc_ruins`에서만 실행되도록 기존 `location` Condition을 `and`로 덧붙였고(잘못된 위치는
  `requirements_not_met`, view 노출은 기존 `showWhenLocked`/D-06/D-15 그대로), 회복 행동
  `act_rest_village`(마을, 60분, `hp` +4)를 추가했다. 회복은 기존 `hp` Effect의 양수 add와 max clamp만
  쓰며, 죽은 actor는 엔진의 pending/dead 게이트(`pending_new_character`/`actor_dead`)가 `perform`을
  막으므로 되살릴 수 없다(D-69의 "죽은 actor에게 hp를 더하면 alive는 false로 남는다"는 사실은 그대로이며
  부활 semantics는 여전히 미정). 팩 `version`은 `0.1.0`으로 유지했다: state 모양 변화가 없고 D-68이 정확
  일치를 요구하므로 올리면 기존 save가 불필요하게 막힌다(version을 올릴 시점은 팩 작성자 규율, D-68 (c)).
  canonical path: 새 게임 → 마을 살피기 x2 → 시장 이동 → 등불 구입 → 마을 → 폐허(도착 시 함정 -4) → 조사
  (체류 중 함정 -4) → 마을 → 휴식(+4) → 원로 대화/선택 → 대면(HP 10→6→2→6, 총 270분). 검증:
  `tests/v2/data-world.test.js`/`data-world-lifecycle.test.js`(기존 canonical path를 이동 단계 포함으로
  수정, 위치 제약/회복/clamp/죽은 actor 무부활/succession 유지 추가), `tests/v2-ui-canonical-browser.spec.js`.
  **V2-Core-30 추가 (Issue #90, 새 semantics 없음)**: 정보 흐름을 실제 플레이에 연결했다. 추적 결과 —
  `rumor` Effect는 `state.knowledge.<actor>.<rumor>`에 §8.2의 RumorEntry를 그대로 쓰고(`opt_ask_ruins`:
  confidence 60, `confirmations` 1, `sources:["npc_elder"]`), `view().knowledge`가 그 항목을 정확성 필드 없이
  그대로 돌려준다. `rumor` Condition(`{op:"rumor", rumor, minConfidence?}`)과 selector는 D-24로 이미 구현돼
  있고 player 문맥에서 허용된다(§8.4가 제한하는 것은 `fact`뿐). 그런데 데이터팩은 소문을 기록만 했고 어떤
  행동도 읽지 않았다 — 원로와 조사는 `fact_ruins_secret`을 가리키는 같은 문자열로만 이어져 있었다. 그래서
  (A) `act_investigate_ruins`의 `requires`에 `{op:"rumor", rumor:"rum_ruins_secret"}`을 더했다(위치/등불과
  겹치지 않는 별개의 정보 조건, 숨김 정책은 그대로 `showWhenLocked` 없음). 안부만 물으면(`opt_small_talk`은
  소문을 가르치지 않는다) 조사가 안 열리지만 `act_talk_elder`는 반복 가능하므로 막다른 길이 아니다.
  (B) 조사 성공 outcome에서 `fact`를 설정한 바로 뒤에 `rumor` 관찰 모드(`observe:true`,
  `source:"obs_loc_ruins"`)를 더해 그 fact 값을 claim으로 다시 배운다 — 같은 claim의 새 출처 재확인이라
  `confirmations` 2, `sources:["npc_elder","obs_loc_ruins"]`, `rumor.updated`(delta 0)가 된다. 순서가
  중요하다(관찰 모드는 fact가 아직 없으면 skip, §8.3). 실패 outcome은 소문도 fact도 바꾸지 않으며 조사는 다시
  시도할 수 있다. `data.rules.rumor`의 증감폭은 설정하지 않았다: confidence를 읽는 소비자가 없어 수치를 만들
  근거가 없다(그래서 확인은 `confirmations`/`sources`로만 나타난다). 대면(`act_confront_leader`)의 접근
  조건(flag + unlock)은 그대로 둔다 — 소문 조건을 더하면 flag와 겹쳐 의미가 없다. UI 확인: `web/v2/ui/app.js`는
  `rumor.*` 이벤트를 로그에 쓰지 않고 `knowledge`를 그리지 않는다 — 플레이어는 로그 문장(narration)과 행동
  노출 여부로만 정보를 얻는다(UI 기능 결정이며 core 결정이 아니라 이번에 만들지 않았다). D-68 확인: 팩
  `version`은 `0.1.0` 유지, 같은 id·version에서 내용만 바뀌므로 호환성 검사는 통과하고(D-68이 이미 C로
  남긴 "내용 변경 검출 없음"), 옛 팩으로 만든 폐허의 save는 `validateState`를 통과하며 소문이 없으면 조사가
  닫혀 있다가 원로에게 물은 뒤 열린다. canonical path: 새 게임 → 마을 살피기 x2 → 원로 대화/선택 → 시장 →
  등불 → 마을 → 폐허 → 조사(소문 확인) → 마을 → 휴식 → 대면(HP 10→6→2→6, 총 270분, 두 check는 같은 등급).
  원로와의 `relation`(+5/+1)은 명시적 Effect로만 기록되고 어떤 Condition도 읽지 않는다(콘텐츠 후보, 새
  semantics 아님). 검증: `tests/v2/data-world.test.js`(정보 흐름/저장·불러오기 테스트 추가),
  `tests/v2-ui-information-browser.spec.js`.
  **V2-Core-31 추가 (Issue #92, 새 semantics 없음)**: 정보 → 관계/선택 → 결과 경로를 추적했다. 확인한 사실 —
  `relation` Effect는 `state.relations["<from>:<to>"]`의 edge(`score`/`mode`/`lastDay`/`cooperationCount`/
  `conflictCount`/`tags`, §7.2)만 바꾸고 `relation.changed`에는 실제로 바뀐 필드만 담는다(`add`/`mode`/
  `tagAdded`). `view().relations`는 플레이어가 한쪽 끝인 edge를 돌려준다. `relation` Condition은 player 문맥에서
  쓸 수 있고(`from` 기본값 `target`, `to` 기본값 `self`, 리터럴 ID 가능, 없는 edge는 점수 0/`neutral`/태그 없음)
  선택지 `requires`(§3.3 표: player 문맥)와 행동 `requires`, `if.when`(world 문맥)이 읽을 수 있다. 그런데 데이터팩에서
  원로 relation(+5/+1)과 두목 relation(-10/-20)은 기록만 되고 아무것도 읽지 않았다. 선택지 `requires`가 거짓이면
  엔진은 `choose`를 `requirements_not_met`로 거부하고 `pending`은 그대로 남으며(다른 선택지로 계속 답할 수 있음)
  UI는 그 선택지를 그리지 않는다. `fact`는 world 문맥에서만 쓸 수 있으므로(§8.4) 플레이어 쪽 조건은 확인된 조사가
  남기는 `flag`(`ruins_secret_confirmed`)를 읽는다. 그래서 (A) `choice_elder_dialogue`에 세 번째 선택지
  `opt_report_findings`를 더했다 — `requires`는 그 flag이고(소문만 아는 것으로는 열리지 않는다), 효과는 원로 edge에
  `add:10, mode:"cooperation", tag:"confidant"`(기존 `relation` Effect의 네 필드 중 세 개)와 narrate다. (B)
  `act_confront_leader`의 success outcome 끝에 `if`(`when`: 원로 edge의 `tag:"confidant"`)를 더해 두목 edge에
  `-10`을 한 번 더하고 narrate한다. 같은 check/같은 case 결과/같은 시간에서 결과만 다르다(두목 edge -20 대 -10, 로그
  한 줄). 실패 outcome에는 붙이지 않았다. **점수가 아니라 태그를 읽는다**: `act_talk_elder`는 `minutes`가 없고 반복
  가능하며 `opt_ask_ruins`가 매번 +5라서(clamp 100) 점수 문턱은 정보를 하나도 얻지 않고도 넘을 수 있다 — 태그는 정보
  조건이 걸린 선택지로만 얻는다(probe와 Node 테스트로 확인). 쓰지 않은 것: relation의 check 보정(`useRelation` +
  `targetId`, `floor(score/25)`)은 이미 있지만 `act_confront_leader`에는 `targetId`가 없고 점수 5/1은 25에 못 미쳐
  아무 효과가 없다 — check를 건드리면 canonical seed의 결과가 흔들리므로 쓰지 않았다. `data.events`도 relation/flag를
  다시 사건에 연결할 수 있지만 이번 결과에는 필요하지 않았다. 대면의 접근 조건(flag + unlock)과 check는 그대로라서
  보고하지 않는 기존 canonical path의 결과는 변하지 않고, 기존 테스트는 수정 없이 통과한다. UI 확인: `renderChoice`가
  선택지 `requires`를 `evaluateCondition`으로 직접 평가한다(`view().pending`에는 선택지 목록이 없다) — D-67이 이미 다루는
  "UI가 view() 밖을 읽는" 경계이며 이번에 결정하지 않았다. D-68: 팩 `version`은 `0.1.0` 유지(state 모양 변화 없음,
  옛 팩의 save는 호환·유효). canonical path: ... 조사(소문 확인) → 마을 → 휴식 → (선택) 원로 대화/보고 → 대면(HP
  10→6→2→6, 총 270분, 두 check는 보고 여부와 무관하게 같은 등급). 검증: `tests/v2/data-world.test.js`(관계 결과/거부/
  파밍/실패 분기/재생/저장·불러오기 테스트 추가), `tests/v2-ui-consequence-browser.spec.js`.
  **V2-Core-32 추가 (Issue #94, 새 semantics 없음)**: 관계 → 조직 → 사건 경로를 추적했다. 확인한 사실 — 조직은
  별도 종류의 state가 아니다: `data.orgs`는 ID 형식만 검사되는 참조용 메타데이터이고 `state.actors`에 레코드가 없으며(D-65류
  NPC와 같다), 조직은 `state.relations`의 edge 끝일 뿐이라 NPC와는 ID 접두어(`org_`)로만 구분된다(§7.1). 조사 성공이 남기는
  `npc_bandit_leader:org_bandits`의 `member` 태그(`relation.changed`의 `tagAdded`)가 데이터팩이 지금까지 조직에 대해 기록하는
  전부였고 아무것도 읽지 않았다. `relation` Condition은 그 edge를 player 문맥과 world 문맥 모두에서 읽는다(없는 edge는 점수 0/
  `neutral`/태그 없음, 리터럴 조직 ID 가능). `view().relations`는 플레이어가 한쪽 끝인 edge만 돌려주므로 조직의 플레이어에 대한
  edge(`org_bandits:player_1`)는 보이고 두목의 소속 edge는 보이지 않는다. `data.events`: trigger 패스는 행동 Effect가 끝난 같은 작업
  사본에서 돌기 때문에 같은 step의 관계/태그 변화를 본다 — probe에서 임시 event(trigger: 두목의 `member` 태그)가 그 태그를 쓴
  바로 그 조사 step에서 발동했고(`once`로 다음 step에는 발동하지 않음), 실패한 조사(태그 없음)에서는 발동하지 않았다. 다만 이번
  결과에는 event가 필요하지 않아 콘텐츠로는 추가하지 않았다. 대면에 붙이는 조건으로 `member` 태그를 쓰지 않은 이유: 태그는 확인 flag와
  같은 조사 성공 outcome에서 함께 써지므로 대면이 열리는 모든 경로에서 이미 참이라 flag와 겹친다(V2-Core-30의 "겹치는 조건은 넣지
  않는다"). 그래서 (A) V2-Core-31의 뒷받침 분기(`if.then`)에 `{op:"relation", from:"org_bandits", to:"self", add:-10, tag:"cowed"}`
  한 줄을 더해 조직이 플레이어를 어떻게 보는지를 기록하고, (B) `choice_elder_dialogue`에 네 번째 선택지 `opt_bandits_disperse`를 더했다 —
  `requires`는 그 조직 edge의 `cowed`와 두목의 `member`(둘 다 기존 `relation` Condition, `and`), 효과는 두목의 `member`를 `untag`하고
  원로 relation +5와 narrate다. `untag`로 자신의 조건을 지우므로 한 번 쓰면 스스로 닫힌다(별도 flag 없이 재사용 방지). 뒷받침 없는 기존
  대면은 이벤트 목록까지 그대로이고(조직 edge 없음), 대면에 실패하면 조직 edge도 없다. 알려진 성질: 조사는 반복 가능하고 성공하면 `member`를
  다시 붙이므로 조직이 여전히 `cowed`이면 선택지가 다시 열릴 수 있다 — 효과는 원로 relation +5뿐이라 막지 않았다. UI 확인: `renderChoice`는
  V2-Core-31과 같이 선택지 `requires`를 직접 평가한다(D-67 경계, 결정하지 않음). D-68: 팩 `version`은 `0.1.0` 유지(state 모양 변화
  없음, 옛 팩의 save는 호환·유효). canonical path: ... 조사 → 마을 → 휴식 → (선택) 원로 보고 → 대면 → (뒷받침한 경우) 원로에게 도적단의
  처분을 맡김. 검증: `tests/v2/data-world.test.js`(조직 edge/선택지 노출·거부/스스로 닫힘/실패 분기/재생/저장·불러오기 추가),
  `tests/v2-ui-faction-browser.spec.js`.
  **V2-Core-33 추가 (Issue #96, 새 semantics 없음)**: 사건 결과의 지속성을 추적했다. 확인한 사실 — 관계 edge/태그, flag, case,
  `state.fired`는 모두 JSON state의 일반 필드이고 이를 시간에 따라 바꾸는 코드가 없다(relation rule은 미결정이라 감쇠도 없다):
  probe에서 결정 뒤 2040분을 기다리고 이동해도 `state.relations` 전체가 바이트 단위로 같았다. `data.events` trigger 패스는
  `wait`/`perform`/`move`/`choose`/`startCharacter` 모든 step의 끝(행동 Effect와 `time` 뒤)에서 그 시점의 state로 돌기 때문에
  이전 step에서 만들어진 결과를 다른 장소의 나중 step에서 읽는다 — 시장으로 `move`하는 step의 이벤트 순서는 `actor.moved`,
  `time.advanced`, event의 Effect(`money.changed`, `narration`), `trigger.fired`(internal), `action.resolved`다. `once`는
  `state.fired[id].count`로 세계 전체에 하나(캐릭터별이 아님)이고 `cooldown`은 필요하지 않았다. trigger가 거짓인 step은 `fired`
  기록을 남기지 않으며, `fired`는 state의 일부라 저장/불러오기 뒤에도 유지된다(불러온 뒤 두 번째 방문은 지급하지 않는다). 그래서
  `evt_market_reopens`(`once`)를 더했다 — trigger는 `location` 시장 ∧ `org_bandits`→self `cowed` ∧ ¬(두목→`org_bandits`
  `member`)이고(`not`은 Condition 하나를 `of`로 받는다), 효과는 `money` +3과 narrate다. `cowed`만으로는 원로의 결정 전에도 참이
  되므로 `¬member`가 결정(V2-Core-32의 `untag`)을 읽는다 — `cowed`는 대면에 성공해야 써지고 대면은 조사 성공(`member`를 붙임)이
  필요하니 `cowed ∧ ¬member`는 "결정했다"와 같다(조사를 다시 성공하면 `member`가 다시 붙어 trigger가 다시 거짓이 된다).
  같은 장소·행동(시장으로 이동)에서 이전 역사에 따라 결과가 갈린다: 대면 안 함/뒷받침 없는 대면/뒷받침했지만 결정 안 함은
  지급 없음, 결정한 경우만 지급(시장을 결정 전에 방문하면 지급 없고 이후에는 지급). 대면에 실패하면 남는 것이 없다. **캐릭터에
  묶임**: `relation` edge는 `player_<n>` ID로 키가 정해져 있고 `startCharacter`는 edge를 옮기지 않으므로 후계자(`player_2`)에게는
  `org_bandits:player_2`가 없어 `to:"self"`인 trigger가 거짓이다 — 세계 수준인 두목의 조직 이탈(`npc_bandit_leader:org_bandits`)은
  후계자에게도 남지만 이 event는 행동한 캐릭터의 태도(`cowed`)를 읽는다. 후계자도 받게 하려면 비플레이어 edge에 표식을 남겨야
  하는데(예: V2-Core-32의 `untag`와 함께 `tag`) 그것은 기존 선택지의 효과를 바꾸는 콘텐츠 결정이라 이번에 하지 않았다. 기존 테스트 중
  `data-world-lifecycle.test.js`의 "이 팩의 event 목록" 단정 한 줄만 새 event를 반영하도록 고쳤다(데이터 모양 단정이며 동작
  회귀가 아니다). D-68: 팩 `version`은 `0.1.0` 유지(state 모양 변화 없음, 옛 팩의 save는 호환·유효). 검증:
  `tests/v2/data-world.test.js`(지속/나중 event/역사별 차이/`once`/거부/실패/후계자/재생/저장·불러오기 추가),
  `tests/v2-ui-persistence-browser.spec.js`.
  **V2-Core-34 추가 (Issue #98, 새 semantics 없음)**: V2-Core-33이 "캐릭터에 묶임"으로 남긴 부분을 실제 state로 대조했고(분류와 근거는 D-70),
  기존 contract로 결정되는 B 한 가지만 구현했다 — 세계 상태만 읽는 elder 선택지 `opt_ask_bandit_news`. `requires`는 `case_ruins_mystery`가
  resolved이고(`case` Condition) 두목이 더 이상 `org_bandits`의 `member`가 아님(`not` + `relation` Condition)이다. 둘 다 끝에 캐릭터가 없는 세계
  상태이고, `cowed`(개인 edge)와 달리 후계자에게도 참이다. 이 쌍은 "결정했다"와 같다: `case` resolved는 대면 성공이 필요하고 대면은 조사 성공이
  남긴 `member`(같은 outcome의 flag와 함께)를 전제하므로 `¬member`는 원로의 결정(V2-Core-32의 `untag`) 없이는 참이 되지 않는다(조사를 다시 성공하면
  `member`가 다시 붙어 거짓이 된다 — V2-Core-32의 알려진 성질과 같다). 효과는 묻는 사람 자신의 원로 edge +1과 narrate뿐이며 세계 필드는 바뀌지 않는다.
  같은 장소/행동(원로와 대화)에서 이력에 따라 결과가 갈린다: 행동한 캐릭터와 그 후계자 모두 제안받고, 다른 어떤 이력에서도 제안받지 않는다.
  후계자에게는 개인 결정 `opt_bandits_disperse`(개인 `cowed`를 읽음)가 제안되지 않고 거부된다(`requirements_not_met`, choice는 pending 유지).
  쓰지 않은 것: 시장 event의 trigger를 같은 세계 쌍으로 바꾸는 것 — 후계자가 보상을 받게 되지만 보상이 캐릭터를 따라야 하는지 세계를 따라야
  하는지는 미정이므로(D-70의 C) 하지 않았다. 기존 테스트는 하나도 수정하지 않았다. D-68: 팩 `version`은 `0.1.0` 유지(state 모양 변화 없음, 옛 팩의
  save는 호환·유효). 검증: `tests/v2/data-world.test.js`(개인/세계 분류를 실제 state에서 단정, 후계자 경로, 다른 이력, 재생/저장·불러오기 추가),
  `tests/v2-ui-successor-browser.spec.js`(실제 사망 → "새 캐릭터로 시작" UI → 실제 IndexedDB).
  **V2-Core-35 추가 (Issue #100, 새 semantics 없음)**: D-70의 C(2)를 결정했다(근거와 기각한 후보는 D-70의 후속 노트). 소유부터: `flag`는 세계 단위라
  계약 위반이 아니라 팩 불일치였다. `opt_report_findings`와 `act_confront_leader`가 `ruins_secret_confirmed` 대신 `item_relic`(`{op:"item",
  item:"item_relic", min:1}`)을 요구한다 — `act_investigate_ruins`의 success outcome이 이미 조사한 캐릭터 자신의 인벤토리에 쓰던 아이템이라 새 state가
  없고, 실패/`partial`(fail outcome)은 쓰지 않으며, 후계자는 template에서 새로 만들어져 갖지 않는다. 조사한 캐릭터와 이번 변경 이전에 만든 조사한
  save는 그대로 통과한다. 같은 장소/행동에서 결과가 갈린다: 후계자는 세계의 역사(`opt_ask_bandit_news`)는 제안받지만 보고/대면은 자기 증표를 얻어야
  열린다(조사 없이는 관찰 4번의 unlock이 있어도 거부). 후계자가 직접 조사에 성공하면 보고가 수락되고 태그는 후계자 자신의 edge에만 붙는다. 소문
  confidence는 조사한 사람과 원로에게만 물은 사람이 같아(둘 다 60) 표식이 될 수 없다는 것을 테스트가 단정한다. 새 브라우저 spec
  `tests/v2-ui-successor-gate-browser.spec.js`. 기존 테스트는 하나도 수정하지 않았다.
  **V2-Core-36 추가 (Issue #102, 코드/콘텐츠 변경 없음, 새 semantics 없음)**: 후계자가 무엇을 받는지와 세계 보상이 누구에게 가는지를 실제 state로 대조했다(분류, 근거,
  선택 가능한 semantics는 D-71). 결과: 전 캐릭터에게서 후계자에게 넘어가는 것은 하나도 없고(고정 `money +3`만 — `ctx.targetId`를 읽지 않으므로 어떻게 죽은 전 캐릭터든
  후계자의 actor는 같다), 세계 필드는 succession이 하나도 바꾸지 않으며, 죽은 actor의 기록은 그대로 남는다. 시장 보상은 *현재 플레이어 자신의* `cowed` edge와 세계 전체의 `once`
  두 조건으로 정해진다: 전 캐릭터가 먼저 받았으면 후계자는 자기 edge가 있어도 못 받고, 전 캐릭터가 받기 전에 죽었으면 보상은 미수령으로 남아 후계자는 자기 edge를 직접 만들어야 받는다.
  전부 기존 contract(§3.3 같은 평가기, §7.1 `self`, §9, D-51 `once`)가 이미 결정하는 동작이라 구현은 바꾸지 않았고 테스트로 고정만 했다. 새 semantics(후계자가 받을 범위, 보상이
  캐릭터/세계 중 누구를 따르는지, `once`의 단위, 죽은 캐릭터 edge의 누적)는 결정하지 않았고 D-71에 선택지와 영향을 남겼다. 새 Node 테스트(`tests/v2/data-world.test.js`의
  24~26번: 후보별 귀속, 보상 매트릭스, 재생/저장·불러오기)와 새 브라우저 spec `tests/v2-ui-succession-browser.spec.js`, CI 단계를 추가했다. 기존 테스트는 하나도 수정하지 않았다.
  **V2-Core-37 추가 (Issue #104, 코드/콘텐츠 변경 없음, 새 semantics 없음)**: D-69가 C로 남긴 세 항목(`completeWhen`, `rules.relation.*.when`, `facts[*].initial`)을 각각
  계약 → validator → runtime 소비 코드 → 팩 → 테스트 → 실제 실행(Node probe, 실제 Chromium) 순으로 다시 추적해 세부 질문별로 A/B/C/D로 나눴다(D-72). 결론: 세 필드의 소비 코드는
  여전히 `validateData`뿐이고 실제 팩은 셋 모두 쓰지 않는다(`data.cases`/`rules.relation` 없음, `initial:"unknown"`은 문서용). `completeWhen`과 relation rule이 하려는 일 —
  "조건이 참이면 case를 옮기거나 관계를 바꾼다" — 은 기존 `data.events`(§2.5 10단계, D-51)가 이미 표현한다(한 step에서 id 순서로 연쇄 전이, 여러 case 동시 전이, `once`/`cooldown`,
  save/load/replay 결정론 모두 probe·테스트·브라우저로 확인). 그래서 실제 결정은 "event와 별도의 전용 경로를 둘 것인가"이고 그 전에는 전용 실행 semantics를 정할 수 없다.
  `facts[*].initial`은 시점/라벨/idempotence만 계약이고 seed 입력(worldSeed 문자열 / `rng.seed` / 숫자)이 미정이다 — Node와 Chromium이 세 입력에 대해 같은 숫자를 낸다는 것까지 확인했다.
  B(구현 가능)는 없어 구현하지 않았고, 세 항목의 결합도가 낮아 후속 이슈를 나누도록 권한다(D-72). 새 Node 테스트 `tests/v2/core-semantics-gap.test.js`(현재 동작의 pin)와 새 브라우저 spec
  `tests/v2-ui-core-semantics-browser.spec.js`, CI 단계를 추가했다. 기존 테스트는 하나도 수정하지 않았다.
  **V2-Core-38 추가 (Issue #106, 코드/콘텐츠 변경 없음)**: `completeWhen`의 semantics를 결정했다(D-73): **활성화하지 않는다.** 예약 필드로 두고 validator가 Condition 모양만 검사한다.
  `data.events` trigger + `case` Effect가 지금 그 일을 하고 엄밀히 더 표현력이 크다 — 전이에 붙는 Effect(돈/관계/서술 등), `check`/`outcomes`(gameplay 스트림), `once`/`cooldown`, 임의의 대상 stage를
  쓸 수 있는 반면 Condition 하나인 `completeWhen`은 "다음 stage"와 전이 Effect를 위해 새 필드가 필요해 event와 중복된다. 전용 evaluator는 §2.5의 연쇄 1단계 제한과 충돌하거나 event와 별개의 순서 규칙을
  만든다. 구현이 없으므로 평가 cadence는 event 경로의 것(10단계, 수락된 모든 step 종류 뒤, id 오름차순 한 패스)이고 `state`/save/replay는 그대로다. 새 Node 테스트 `tests/v2/case-completion.test.js`(결정이
  기대는 기존 semantics와 event의 표현력을 고정)와 새 브라우저 spec `tests/v2-ui-case-completion-browser.spec.js`(실제 Chromium + IndexedDB, 페이지 새로고침을 사이에 둔 불러오기), CI 단계를 추가했다.
  기존 테스트는 하나도 수정하지 않았다. relation rule `when`과 `facts[*].initial`은 이번에도 결정하지 않았다.
  **V2-Core-39 추가 (Issue #108, 코드/콘텐츠 변경 없음)**: relation rule의 semantics를 결정했다(D-74): **활성화하지 않는다.** `rules.relation`은 D-62의 모양만 검사하는 예약 필드로
  남는다. 실제 팩은 쓰지 않고(관계 쓰기 11곳은 모두 행동/선택지의 명시적 `relation` Effect, event는 관계를 읽기만 한다), 현재 콘텐츠는 오히려 관계가 시간이 지나도 변하지 않는 것에 기댄다
  (V2-Core-33). V1의 관계 규칙 모양(이름이 정해진 edge, 하루 한 번, 세계 상태에 따른 협력/갈등 분기)은 기존 `data.events` + `relation` Effect와 `day` selector·`signal` 카운터만으로 정확히
  표현되고(Node와 실제 Chromium이 같은 결과), event로 표현할 수 없는 것은 여러 edge에 걸친 규칙뿐인데 그 수요는 없다. 새 Node 테스트 `tests/v2/relation-rules.test.js`(결정이 기대는 사실과
  저작 패턴을 고정)를 추가했다. 엔진이 바뀌지 않고 같은 필드의 Chromium 동작은 `tests/v2-ui-core-semantics-browser.spec.js`가 이미 검증하므로 새 브라우저 spec은 만들지 않았다.
  기존 테스트는 하나도 수정하지 않았다. `facts[*].initial`은 이번에도 결정하지 않았다.
- `validateData(data)`는 다음을 검사하고 오류 목록을 반환한다: ID 형식, 참조 무결성, Condition/Effect op와 인자,
  handler 등록과 reason, player 문맥의 fact 사용 금지, Resolvable의 success/fail 필수 여부.
  **검증을 통과하지 못한 data로 step을 호출하는 것은 프로그래머 오류다.**
  - **구현 상태 (D-56, V2-Core-16)**: 6개 카테고리 모두 구현했으나, 각 카테고리는 계약 다른 곳에
    이미 구체적으로 확정된 스키마가 있는 부분으로만 좁혀져 있다 — 정확한 범위와 제외된 부분은
    D-56 참고. 특히 참조 무결성과 op/인자 검사는 전체가 아니라 이미 스키마가 고정된 위치만 검사한다.
    D-57(Effect/Condition op별 인자, V2-Core-17), D-58(choice/check.difficulty 참조 무결성,
    V2-Core-18), D-60(CheckSpec 자체 shape, characterTemplate.locationId 필수 여부, V2-Core-19)이
    범위를 이어서 넓혔다. `data.cases[*].stages[*].completeWhen`/`data.rules.relation.*.when`은
    D-59(V2-Core-19)에서 스키마 부재를 재확인해 blocker로 종결했으나, **D-61/D-62(V2-Core-20)에서
    두 필드 자체는 "Condition 하나, optional, world context"로 확정하고 validateData에 반영했다**
    — `stages`/`rules.relation`의 그 외 구조(전이 실행, effect, 우선순위, cadence 등)는 D-59가
    남긴 blocker 그대로다.
- JSON이 지나치게 복잡해지는 것이 실제로 확인되기 전까지 JS 데이터 모듈로 회귀하지 않는다 (DEVELOPMENT_RULES 9절).

---

## 12. (예약) 자아 / 멀티버스 확장 지점

- 자아: 별도 시스템을 두지 않는다. 확장 지점은 actor의 `tags`, trait, relation(타인의 시선), flag다.
  자아 상태 스키마는 세계관 설계 이후에 정한다 (D-17).
- 멀티버스: state는 한 세계를 뜻한다. 다음이 교차 세계 확장의 경계다:
  `worldId`, `dataRef`, `growth`가 성장체계 ID를 키로 하는 맵이라는 점, 계승 계약이 분리되어 있다는 점.
  다중 세계 컨테이너(여러 world state를 묶는 상위 구조)는 **구현하지 않는다.**

---

## 13. 테스트 계약

### 13.1 원칙

- `node:assert/strict`만 사용한다 (표준 라이브러리). 테스트 프레임워크는 추가하지 않는다.
- 테스트 fixture는 `tests/v2/fixtures/*.json`에 둔다. **추상 ID(`stat_a`, `loc_1`, `npc_a`)만 쓰는 합성 데이터이며 세계관 콘텐츠가 아니다.**
  - 이유: "세계관 창작 금지"와 "데이터 기반 엔진 테스트"를 동시에 만족시킨다.
- 입력 state와 data는 테스트에서 **재귀적으로 `Object.freeze`한 뒤** step에 넘긴다. mutation이 일어나면 strict mode에서 즉시 TypeError가 난다.

### 13.2 테스트 영역과 합격 기준

| 영역 | 합격 기준 |
| --- | --- |
| 금지 의존성 | `web/v2/core/*.js` 소스에 `Math.random`, `Date`, `window`, `document`, `indexedDB`, `localStorage`, `fetch`, `performance`, `crypto`가 없다 (정적 스캔) |
| deterministic repeatability | 같은 seed와 action 시퀀스를 2회 실행하면 모든 state와 events가 deepEqual이다. 중간에 JSON 왕복(저장/복원)을 넣어도 결과가 같다 |
| golden | 고정 seed와 고정 시퀀스의 최종 state 해시를 기록한다. 바뀌면 실패하며, 갱신은 의도된 변경일 때만 사유와 함께 한다 **구현됨(D-75, V2-Core-40)**: `tests/v2/golden.test.js`가 `tests/v2/fixtures/golden-path.json`(추상 ID 합성 팩, seed `golden-0`, action 39개)의 step별 `{state, events}`와 최종 state의 fingerprint(키를 정렬한 JSON의 `hashString`, 16진수)를 기록값과 비교하고, `tests/v2-ui-golden-browser.spec.js`가 같은 fixture를 실제 Chromium에서 실행해 지금의 Node 값·기록값과 맞춘다. 갱신은 `node tests/v2/golden.test.js --print`로 하고 사유를 커밋/PR과 D-75에 남긴다 |
| seed 차이 | 다른 seed이면 pickFrom fact 초기값 등 파생 스트림 결과가 달라진다 (fixture로 보장) **구현됨(D-76, V2-Core-43)**: `tests/v2/facts-initial.test.js`가 고정 seed 두 개의 서로 다른 `pickFrom` 결과와 seed 20개에서의 분포를 확인한다 |
| 파생 스트림 격리 | fixture에 NPC를 하나 추가해도 기존 NPC 초기값과 첫 check 결과가 바뀌지 않는다 **구현됨(D-76, V2-Core-43)**: world-generation 소비자는 아직 fact뿐이라 fact로 검사한다 — fact를 둘 추가해도(정렬상 앞과 뒤) 기존 fact의 초기값, `state.rng`, 첫 check 결과가 seed 10개에서 모두 같다(`tests/v2/facts-initial.test.js`). NPC 초기값을 시딩하는 기능이 생기면 같은 검사를 그 라벨로 추가한다 |
| immutability | 동결된 입력으로 step, view, check를 호출해도 예외가 없고, 입력은 호출 전과 deepEqual이다 **구현됨(V2-Core-42)**: `tests/v2/immutability.test.js`가 golden fixture의 모든 state(행동 종류 전부, check, events, 성장, 사망과 계승)와 실제 팩의 시작 state에서 state와 data를 재귀적으로 동결하고(§13.1) 그 단계의 `step`, `view`, data가 정의한 모든 check spec(opposed와 event의 것 포함)의 `check`를 호출해 예외가 없고 입력이 그대로이며 `step`/`view` 결과가 동결하지 않은 입력과 같은지 확인한다. 그 전에는 `view`/`check`가 호출 전후 deepEqual만 검사돼 입력에 썼다가 되돌리는 구현을 잡지 못했다 |
| JSON 안전성 | 모든 step 결과 state가 JSON 왕복 후 deepEqual이다 |
| invalid action | 9개 reason code 각각에서 state가 입력과 deepEqual이고, rng, time이 변하지 않으며, 이벤트는 `action.rejected` 1개다 (state에 `seq`가 없으므로 검사 대상도 아니다) **구현됨(V2-Core-41)**: `tests/v2/reject-codes.test.js`가 엔진에서 각 code를 내는 모든 분기(32개 경우 — 형식 오류, 부트스트랩 안 된 world의 `wait` 외 action, pending 없는 `startCharacter`, 없는 action·template·option·location과 정의가 사라진 pending choice, 링크 없음·링크 `requires` 거짓·목적지 `requires` 거짓·action과 option의 `requires` 거짓, pending 중의 다른 action 종류, 죽은 actor의 `perform`/`move`/`choose`와 actor 기록이 없는 경우)를 동결 입력(§13.1)으로 실행해 이 기준과 함께 `visibility:"player"`, 입력 시각의 `minute`, `requirements_not_met`의 `data`에 `code`만 있음(§2.6)을 확인하고, 엔진의 reject 호출 지점이 쓰는 code 집합이 §2.6의 고정 목록 9개와 같은지 정적으로 스캔한다. 반환 state의 객체 동일성과 다른 code의 `detail` 유무는 계약이 정하지 않아 고정하지 않는다 |
| Condition | 연산자마다 참, 거짓, 누락 참조 케이스를 검사한다. `and` 빈 배열은 참, `or` 빈 배열은 거짓이다. `always`/`never`는 인자 없이 고정값을 반환한다. `eq`/`neq`/`gt`/`gte`/`lt`/`lte`는 숫자·문자열·타입 불일치·selector 미해석(`undefined`) 케이스를 모두 검사한다. 알 수 없는 op/selector는 `false`로 평가된다(§3.1 — `validateData`가 이를 콘텐츠 오류로 잡아도, `evaluateCondition` 자체의 이 동작은 바뀌지 않는다, D-56). player 문맥의 `fact` selector는 항상 `undefined`로 해석되는지 검사한다 |
| Effect | 연산자마다 적용, clamp, visibility를 검사한다. Effect ↔ Event 매핑은 "변화 있으면 이벤트 1개, 없으면 0개" 규칙(4.1절 D-30)을 기준으로 검사한다. `if` 분기(when true/false, else 생략, nested)와 순차 적용(앞 결과를 뒤가 즉시 보는지, 같은 작업 사본 공유)도 검사한다. malformed Effect는 throw, `if.when`이 malformed면 `evaluateCondition`의 `false`를 정상 분기로 받아들여 throw하지 않는지 검사한다(D-28). subject 기반 op(`stat`/`hp`/`money`/`item`/`relation`/`skill`/`trait`/`unlock`)는 self/target/명시 ID 해석, 타입 오류→throw vs 해석 실패→skip(D-29), player/internal visibility(D-31)도 검사한다. `trait`의 exclusive 제거, `unlock`의 idempotent, `case`의 lazy 생성/같은 stage no-op도 검사한다. `flag`/`signal`/`time`/`if`/`stat`/`hp`/`money`/`item`/`relation`(add/mode/tag/untag 전체, D-43)/`skill`/`trait`/`unlock`/`case`/`exp`/`proficiency`(D-41/D-42 resolved, 6.4절)/`fact`(D-44)/`rumor`(D-45/D-14 resolved) 17개 구현됨 — exp/proficiency는 level/threshold cascade 순서, reward ctx의 actorId 재구성, 무한 재귀 불가능성(단조 증가+유한 상한)도 검사한다. relation은 mode 카운터가 값 불변에도 무조건 증가하는지, tag/untag의 idempotent·상쇄 케이스, 조건부 event data(`delta`/`mode`/`tagAdded`/`tagRemoved`)도 검사한다. fact는 lazy 생성, 같은 값 재설정 no-op, malformed(`set` 없음)도 검사한다. rumor는 학습/복사/관찰 세 모드, 같은 claim 재확인(신규/기존 출처), D-14 상충 claim 교체·동률 유지, `data.rules.rumor` 수치 부재 시 안전한 0-fallback, 존재하지 않는 참조 skip, `from`+`observe` 동시 지정 malformed, 정확성 미노출도 검사한다. `hp`는 D-34 resolved(V2-Core-10)로 §9 사망 트리거(alive→dead 전이에서만 1회 `actor.died`, 플레이어면 `pending` 설정, 이미 죽은 actor에게 이어지는 Effect도 평소대로 적용됨)도 검사한다. `move`(D-46, V2-Core-11)는 subject 기본값, 이미 같은 위치일 때 no-op, subject 기준 visibility도 검사한다. `choice`(D-35 resolved, V2-Core-12)는 subject 없음, `sourceId` 옵션, pending 덮어쓰기(나중 것이 이김), 동일 pending 재설정 no-op도 검사한다. `narrate`(D-52, V2-Core-13)는 no-op 없음(매번 이벤트), 상태 불변, subject 없음도 검사한다. `handler`는 의도적으로 미구현(4.4절 콜아웃, blocker 아님) |
| check | **구현됨(D-49, V2-Core-11)**. rng를 고정 주입해 tier 경계값(margin = 임계값, 임계값 - 1)을 검사한다. modifier 순서(stat→skill→proficiency→item→trait→relation→situational), opposed, 이름 difficulty, attempts와 retryPenalty, 누락 outcome 폴백, `data.rules.check` 부재 시 5.3절 제안값 fallback도 검사한다 |
| Growth | 경계를 넘는 exp에서 다중 레벨업과 levelRewards를 검사한다. proficiency 임계값이 한 번만 발동하는지, skill maxRank, trait exclusive, unlock idempotent, 여러 성장체계 공존도 검사한다 |
| RelationshipGraph | 방향성, lazy 기본값, clamp, mode 카운트, lastDay, tags 정렬, Condition 참조를 검사한다 |
| Fact/Rumor | view에 facts와 정확성이 없는지, `from` 복사가 틀린 claim을 보존하는지, 서로 다른 출처일 때만 confirmations가 오르는지, fact가 바뀌어도 지식이 유지되는지, observe가 현재 fact를 복사하는지 검사한다 |
| 사망 | **applyEffects 범위(V2-Core-10)**: hp 0 → died(전이 1회만), 플레이어 사망 시 pending newCharacter 설정, 사망 후에도 이어지는 Effect가 정상 적용됨, `alive` 필드 없는 fixture도 기본 alive로 처리. **step() 범위(D-47, V2-Core-11로 구현·테스트됨)**: `startCharacter` 외 action은 `pending_new_character`로 reject, 세계 상태(time/facts/relations/knowledge/cases) 유지, 옛 actor 기록 유지, 기본 succession(빈 배열)은 무계승, `data.rules.succession`이 있으면 적용, 사망이 일어난 step()이 나머지 파이프라인을 계속 진행함을 검사한다 |
| step integration | **구현·테스트됨(D-47/D-48, V2-Core-11 / D-35/D-50/D-51, V2-Core-12)**: `wait`/`perform`/`move`/`choose`/`startCharacter` 전체 경로(하나의 action 안에서 여러 Effect가 순차 적용되는지, RNG 소비, pending 생성/소비, 사망→pending→succession, day.started 경계, trigger once/cooldown/1단계 연쇄 제한) |
| view | **구현·테스트됨(D-53/D-15 resolved, V2-Core-13)**: `{actor,knowledge,relations,pending,actions}` 정확히 그 5개 필드만 반환하는지, facts/다른 actor의 knowledge가 절대 없는지, 원본 state 하위 객체와 참조를 공유하지 않는지(결과를 mutate해도 state는 그대로), RNG를 소비하지 않는지, 동일 (state,data)에 결정론적인지, JSON round-trip 안전한지, `showWhenLocked` 규칙(D-15), player 없는 world는 `null`을 검사한다 |
| V1 회귀 | `tests/*.js` 41/41 통과 (V2 작업이 V1을 건드리지 않았다는 증거) |

### 13.3 러너 규칙

- V2 테스트가 없는 상태를 성공으로 간주하지 않는다. `web/v2/core/`가 존재하는데 V2 테스트가 0개이면
  `tests/v2/run.js`는 **exit 1**이어야 한다. 첫 구현 작업(V2-Core-01)에서 러너를 수정한다. 파일 확장자는
  `.js` 그대로 두고(1.2절, Option B 확정), `package.json`은 추가하지 않는다.
- 브라우저 테스트(`*.spec.js`/`*.spec.mjs`)는 core 러너에서 제외하고 별도로 실행한다.

---

## 14. 구현 전에 반드시 결정해야 하는 사항

> D-01(Node ESM 방식)은 **확정됨** — Option B(자동 감지, `.js` 그대로, Node 22.12+). 1.2절 참고.

| ID | 결정 사항 | 제안 |
| --- | --- | --- |
| D-02 | RNG 알고리즘 | FNV-1a 시드 + counter 기반 fmix32 (2.7절) |
| D-03 | worldId 생성 방식 | `${world.id}_${hex(hashString(worldSeed))}`. 같은 seed는 같은 세계로 간주 |
| D-04 | handler registry 위치와 세계별 분리 방식 | `web/v2/core/handlers.js` 정적 export. 필요할 때 생성 |
| D-05 | 이벤트 로그 보관 위치 | state 밖(UI/저장 계층). 크기 상한을 둔 별도 레코드 |
| D-06 | `fact` Condition의 문맥 제한 | world 문맥에서만 허용. requirements_not_met에 상세 이유를 넣지 않음 |
| D-07 | `stat` Condition이 기본값을 볼지 보정값(아이템/특성 포함)을 볼지 | 기본값. 보정은 check에서만 적용 |
| D-08 | `level` Condition 부재 (레벨 비게이팅) | 두지 않음 |
| D-09 | modifier 합 상한(먼치킨 성장과 판정 의미 보존 사이의 균형) | **재검토(V2-Core-12), 여전히 미해결 — 초기 null 유지**: `check()`(D-49, V2-Core-11)가 이미 구현되어 실사용 데이터가 쌓일 수 있는 상태지만, 이 결정을 지금 강제로 내려야 할 이유(버그, 막힌 작업, 실제 밸런스 문제)가 없다. cap 방식(대칭? 절대값? 양수만?)을 정할 근거가 데이터 없이는 여전히 추측이므로, D-09가 스스로 요구하는 "밸런스 테스트 후 결정"을 앞당기지 않는다(YAGNI) — 이후 실제 콘텐츠에서 modifier 총합이 문제가 되면 그때 다시 연다. **재검토(V2-Core-14)**: 이번 라운드도 새 버그/밸런스 데이터가 없어 결론 그대로 유지한다 **재조사(V2-Core-28, D-69 (1))**: 여전히 D(의도적 미사용)다. 실제 runtime 근거(non-null 값이 무시됨, 실제 팩의 modifier 합은 0과 -1)와 cap을 활성화할 때 필요한 결정 목록을 D-69에 기록했다 |
| D-10 | 아이템 보정: 보유 기준인지 장착 기준인지 | 보유 기준으로 시작. 장착 슬롯은 필요해질 때 |
| D-11 | `attempts` Condition op 추가 여부 | maxAttempts가 실제 콘텐츠에 필요할 때 추가 |
| D-12 | 스탯 포인트 수동 배분 | 없음. 필요하면 levelRewards의 `choice`로 |
| D-13 | 조직 소속 표현 | `npc:org` edge의 `member` tag. 태도 전파 없음 |
| D-14 | 상충하는 claim 처리 | **확정(resolved, 8.3절, V2-Core-09)**: 들어온 claim의 confidence가 기존보다 **높을 때만** 전체 항목(claim/source/sources/confirmations/firstSeenDay)을 교체한다. 같거나 낮으면 기존을 그대로 유지한다(no-op) — 동률을 항상 "기존 유지"로 고정해 결정론을 지킨다. 두 claim을 모두 보관하는 방식은 채택하지 않는다(단일 항목 유지, 원안 그대로) |
| D-15 | 잠긴 행동의 view 노출 | **확정(resolved, §8.4/§1.4, V2-Core-13, D-53과 함께 구현)**: 이 행의 기존 "제안"(`showWhenLocked` 행동만, 이유 없이 표시)을 그대로 채택했다. `view()`의 행동 목록은 `requires`를 만족하는 모든 행동 + `requires`를 만족하지 못해도 정의에 `showWhenLocked:true`가 있는 행동만 `available:false`로 포함한다(둘 다 아니면 목록에서 제외). 실패 이유(`requirements_not_met`처럼 어떤 조건이 거짓인지)는 절대 넣지 않는다(D-06 원칙 재사용) |
| D-16 | 세계 이동 계승 계약 | 사망 계승(`succession`)과 분리. 멀티버스 설계 단계에서 결정 |
| D-17 | 자아 상태 최소 스키마 | 세계관 설계 이후 결정. 그전까지는 tags/trait/relation으로 대체 |
| D-18 | 첫 세계 판타지 **콘텐츠** 작성 주체와 승인 절차 | 사람이 작성하거나 승인. 엔진 작업과 분리 |
| D-19 | check 수치 기본값(2d10, tiers 6/0/-3, difficulties) | 제안값으로 시작해 분포 테스트로 확정 |
| D-20 | Effect ↔ Event 매핑 규칙 (1:1 고정 여부) | 고정하지 않음. 참고용 기본값(4.2절 표)만 두고, 실제 규칙은 Effect 구현 작업(15절 작업 3)에서 정함 (2.4절) |
| D-24 | `rumor` selector가 어떤 필드(confidence? claim?)로 해석되는지 | **보류(deferred, V2-Core-02~14)**. 지금은 recognized selector 키만 등재하고 resolver는 두지 않는다 — 항상 `undefined`로 해석되어 어떤 비교에서도 거짓이다 (D-25). Fact/Rumor 시스템(§8) 구현 시점에 다시 결정. **재검토 후 확정(V2-Core-15)**: §8이 구현된 지금(§8.2 RumorEntry 스키마 확정) 재검토한 결과, `claim`으로 확정한다 — `fact` selector가 이미 `.value`(메타데이터가 아닌 실질 내용)로 해석되는 것과 정확히 같은 역할을 `rumor`에서는 `claim`이 맡는다(`confidence`/`source`/`sources`/`confirmations`/`since`류는 모두 메타데이터). `fact`와 달리 `rumor`는 §8.4의 문맥 제한(D-06)을 받지 않는다 — Rumor는 애초에 행위자가 알고 행동할 수 있는 정보이기 때문이다(§8.4는 Fact만 숨긴다). 참조 대상이 없으면(모르는 rumor) 기존 selector들과 동일하게 `undefined`로 해석한다 |
| D-25 | 비교 연산자의 unresolved(`undefined`) 피연산자 처리 | **확정**: `eq`/`neq`/`gt`/`gte`/`lt`/`lte` 여섯 개 전부, `left`/`right` 중 하나라도 `undefined`면 예외 없이 거짓. `eq`/`neq`의 strict 비교 특례(둘 다 `undefined`일 때 `eq`가 참이 되는 경우)는 두지 않는다 (§3.2a) |

> D-21, D-22, D-23, D-25(Condition의 `always`/`never`, `and`/`or`, 범용 비교 연산자와 selector,
> unresolved 비교 규칙)은 **확정됨** — §3.2, §3.2a 참고. D-24도 V2-Core-15에서 **확정됨** (아래 D-24 행 참고).

| D-26 | `applyEffects` mutation 모델 | **확정**: 외부적으로 순수 함수(`effects`/`ctx`/`ctx.state` 불변, `result.state !== ctx.state`). 내부적으로는 `ctx.state`를 최초 1회만 clone해 만든 작업 사본을 지역적으로 mutate하며, 중첩 Effect(`if.then`/`else`)도 그 사본을 공유한다 (4.1절) |
| D-27 | RNG 원천 | **확정**: `state.rng` 단일 원천. `ctx.rng`, 반환값의 `rng`는 두지 않는다. RNG가 필요한 Effect/handler는 `ctx.state.rng`를 직접 다룬다 (4.1절, 4.4절) |
| D-28 | malformed Effect 처리 | **확정**: throw(프로그래머/콘텐츠 오류). Condition의 "false, 절대 throw 안 함"과는 다른 정책이다. 예외: `if.when` 자체가 malformed인 경우는 Condition의 `false`를 그대로 받아들이고 throw하지 않는다 (4.1절) |
| D-29 | 런타임 대상 부재 (actor 없음, `targetId` 없음, trigger/succession처럼 action 검증을 거치지 않는 경로) | **확정**: throw하지 않고 skip한다(state 불변, 이벤트 없음, 다음 Effect로 진행). subject/`from`/`to`의 타입이 틀리면(malformed) throw하는 것과는 다른 경로다. `flag`/`signal`/`time`/`if`는 영향받지 않는다 (4.3절) |
| D-30 | Effect ↔ Event 매핑 (D-20 해소) | **확정**: 실제로 state가 변경된 Effect 1개당 이벤트 1개, 변화 없으면(delta 0 포함) 이벤트 없음. `if` 자체는 이벤트 없음. 향후 이벤트를 묶거나 생략할 필요가 생기면 그때 op별 예외를 정한다 (4.1절) |
| D-31 | NPC(비플레이어) 대상 Effect의 visibility | **확정**: 대상 actor가 `state.player.actorId`와 같으면 `player`, 아니면 `internal`. `relation`은 `from`/`to` 중 하나라도 player면 `player` (4.2절) |
| D-32 | 수치 인자 검증과 상한 | **부분 확정** (`signal`/`time`/`stat`/`hp`/`money`/`item`): 정수이면서 유한하지 않으면(`Number.isInteger`가 false면) malformed → throw. `signal`/`money`/`item`은 `[0, Number.MAX_SAFE_INTEGER]`, `hp`는 `[0, actor.hp.max]`, `stat`은 데이터에 정의된 `[min,max]`(없으면 무제한)로 clamp. `relation.add`는 `[-100,100]`. 나머지 수치 op(`exp`/`proficiency`/`skill`)는 각각 구현할 때 재확인 |
| D-33 | `flags`/`signals`/`facts`/`relations`/`cases` 등 최상위 맵 부재 시 쓰기 | **확정** (`flags`/`signals`/`relations`/`cases`/`facts`): 첫 write 시 lazy 생성(`cases`는 V2-Core-05, `facts`는 D-44/V2-Core-08에서 이 패턴으로 확정됨). `actors`는 여전히 생성하지 않는다(actor가 없으면 D-29에 따라 skip할 뿐, 새로 만들지 않는다). `knowledge`(§8.2)는 `rumor` Effect(D-45, 블로커) 구현 시 재확인 |
| D-34 | 중첩 Effect 순서 / 목록 중간 사망 | **확정(resolved, 4.1절/4.2절/9절, V2-Core-10)**: 중첩(`if.then`/`else`)은 depth-first로 즉시 실행하며 작업 사본을 공유한다(기존 확정 유지). 사망은 Effect 리스트 처리를 **중단시키지 않는다** — 어떤 Effect도 "조건에 따라 나머지를 건너뛴다"는 로직이 없으므로(4.1절 순차 적용 원칙 그대로), 사망 트리거를 추가하면서 새 조기 종료 메커니즘도 만들지 않았다. 이미 죽은 actor에게 이어지는 Effect도 평소대로 적용된다(예: 죽은 actor에게 `stat`을 더해도 그대로 적용됨). `actor.died`는 alive→dead **전이 시점에만** 1회 발생하도록 `actor.alive !== false` 가드로 중복을 막는다 |
| D-35 | `choice`/`pending` 세부 (`sourceId` 출처, `pending` 충돌 우선순위) | **확정(resolved, 4.2절/11절, V2-Core-12)**: `pending.kind="choice"`는 `{kind:"choice", choiceId, sourceId?}`(2.1절 예시 그대로). `sourceId`는 콘텐츠 작성자가 `choice` Effect에 직접 넘기는 불투명 라벨이며 엔진이 호출 스택을 추론하지 않는다. 같은 Effect 리스트 안에서 `choice`(또는 사망으로 인한 `newCharacter`)가 여러 번 겹치면 나중 것이 이긴다 — 새 우선순위 규칙이 아니라 4.1절의 "Effect는 순서대로 적용되고 나중 쓰기가 이긴다"는 이미 있는 원칙 그대로다. `choose`는 `data.choices[pending.choiceId].options[]` 배열에서 `id === action.optionId`인 원소(Resolvable, `id` 필드는 6.2절 Growth 정의들과 같은 식별자 관례를 그대로 재사용)를 찾아 `perform`과 동일한 해석기(requires→check/effects→outcomes→minutes)로 처리한다(2.3절 "하나의 해석기"). 존재하지 않는 choice/option은 모두 `unknown_option`(고정 9개 reason 중 가장 가까운 것 재사용, 새 코드 없음). 만료(TTL) 개념은 계약에 없으므로 만들지 않는다 — 답할 때까지 무기한 유지된다. `choose` 성공 시 `state.pending = null`(D-47의 `startCharacter` 소비 패턴과 동일) |
| D-36 | Effect 구현 코드 위치 | **확정**: `web/v2/core/rules.js`에 둔다. 별도 `effects.js`를 만들지 않는다 (Ponytail — 파일 3개 계획, 1.3절) |
| D-37 | 인자 이름 통일 | **재검토 후 확정** (`flag`/`signal`/`time`/`stat`/`hp`/`money`/`item`/`relation`): 강제로 하나의 이름에 통일하지 않고, op마다 자연스러운 이름을 쓴다 — `flag.value`, `signal.add`, `time.minutes`, `stat.{stat,add,subject?,system?}`, `hp.{add,subject?}`, `money.{add,subject?}`, `item.{item,add,subject?}`, `relation.{from?,to?,add?}`. 모두 4.2절 표에 이미 있던 이름을 그대로 썼다. (당시 미구현이었던 `relation`의 `mode`/`tag`/`untag`는 D-43/V2-Core-07에서, `exp.amount`/`proficiency.id`는 D-41/D-42/V2-Core-06에서 각각 이 이름 그대로 구현·확정됐다 — "나머지 불일치는 각 op 구현 시 정리한다"던 이 행의 계획이 실제로 실행된 결과이며, 통일하지 않기로 한 원칙 자체는 그대로 유지된다.) |
| D-38 | 등록되지 않은 handler name | **정책만 정리, handler 자체는 미구현**: Condition의 `handler`는 Condition의 malformed 정책(false)을, Effect의 `handler`는 Effect의 malformed 정책(throw)을 따른다. 서로 다른 시스템이 각자의 기존 정책을 그대로 적용하는 것이므로 모순이 아니다 (4.4절) |
| D-39 | `time` Effect와 day 경계 | **확정**: `time` Effect는 `minute`만 전진시키고 `day.started`를 만들지 않는다. day 경계 판정은 `step()` 9단계의 책임이다 (4.2절) |
| D-40 | `engine.js`의 `wait`와 `applyEffects` 통합 여부 | **확정, V2-Core-03~10 범위 한정("이번엔 하지 않음")이었으나 V2-Core-11에서 해제됨**: V2-Core-03~10에서는 `engine.js`를 수정하거나 `step()`에 연결하지 않았다(`applyEffects`는 독립적으로만 존재). V2-Core-11부터 `engine.js` 보호가 해제되어 `step()`이 `applyEffectList`(rules.js에서 새로 export)를 재사용해 `perform`/`move`/`startCharacter`를 처리한다(D-47/D-48) |
| D-41 | `exp` Effect의 레벨업 cascade | **확정(resolved, 6.4.1절)**: `amount≥0`(음수 malformed→throw, 디레벨 없음), level = `expTable.filter(v=>exp>=v).length`를 `level.max`로 clamp(§6.1 기존 주석 그대로), `level:null`이면 exp만 누적하고 레벨 없음, exp 상한은 `Number.MAX_SAFE_INTEGER`. `levelRewards[oldLevel+1..newLevel]`을 순서대로 depth-first 적용(reward ctx는 §9 succession과 같은 패턴으로 `actorId`만 재구성), 레벨마다 `level.up{system,from,to}` 1개. 무한 재귀는 "amount 음수 금지 + 유한한 level.max"로 구조적으로 불가능해 별도 연쇄 제한 불필요 |
| D-42 | `proficiency` Effect의 clamp와 threshold cascade | **확정(resolved, 6.4.2절)**: `max`를 하드 clamp 상한으로 확정(`[0,max]`, 정의 없으면 상한 없음). `add≥0`(음수 malformed→throw) — 이 결정 하나로 감소/재진입/이미 넘은 threshold를 다시 넘는 문제가 전부 사라진다(단조 증가이므로 §6.4의 기존 "이전 값<at≤새 값" 규칙만으로 평생 1회 발동이 보장됨, 별도 추적 필드 불필요). `thresholds`를 `at` 오름차순 정렬 후 순서대로 depth-first 적용(reward ctx는 D-41과 동일 패턴). 무한 재귀는 D-41과 같은 이유로 구조적으로 불가능 |
| D-43 | `relation`의 `mode`/`tag`/`untag` 스키마, 카운터, lastDay, event data (D-37 나머지 해소) | **확정(resolved, 7.3절/4.2절)**: `mode`는 7.2절 enum(`neutral`/`cooperation`/`conflict`) 중 하나가 아니면 malformed→throw. `tag`/`untag`는 string이 아니면 malformed→throw. `mode`는 지정할 때마다 무조건 설정하고, cooperation/conflict이면 해당 카운터를 이전 값과 무관하게 +1 한다(V1 `npc-relations.js`의 "매일 재적용" semantics 유지 — "값이 실제로 바뀔 때만 카운터 증가"가 아니다). `tag`/`untag`는 `tags`(정렬된 고유 배열)에 대한 idempotent 추가/제거이며, 한 Effect 안에서 같은 문자열의 `tag`+`untag`가 상쇄되면 최종 배열 기준으로 변화 없음 처리한다. `add`/`mode`/`tag`/`untag`는 한 Effect 안에서 조합 가능하며, 그중 하나라도 실제 변화를 만들면 edge를 한 번만 lazy 생성/갱신하고 `lastDay`를 갱신하며 `relation.changed` 이벤트를 정확히 1개 낸다(필드별 이벤트로 쪼개지 않음, D-30을 Effect 단위로 유지) — `data`는 `{from,to}`에 실제로 바뀐 필드(`delta`/`mode`/`tagAdded`/`tagRemoved`)만 조건부로 추가한다. 이 "조건부 선택 필드" 방식은 새 이벤트 타입이 아니라 `trait.changed`의 `removedExclusive?` 패턴을 그대로 재사용한 것이다 |
| D-44 | `fact` Effect의 event data 모양과 no-op/lazy 생성 규칙 (D-33 "facts 재확인" 해소) | **확정(resolved, 4.2절)**: `set`이 없으면(필드 자체가 없으면, `undefined`) malformed→throw, 그 외 `null`/`false`/`0`/`""` 포함 어떤 JSON 값이든 허용(8.1절). `state.facts`는 `case`/`flag`/`signal`과 같은 패턴으로 첫 write 시 lazy 생성(D-33이 "해당 시스템 구현 시 재확인"이라고 미뤄둔 부분을 `case`의 실제 구현 선례를 따라 확정). 기존 값과 `set`이 같으면(JSON 값 비교) `case`의 "같은 stage" no-op과 동일하게 아무 것도 바꾸지 않는다(이벤트 없음, `since` 갱신 없음). `fact.changed` 이벤트의 `data:{fact, value}`는 새 스키마가 아니라 `flag.changed`(`data:{key,value}`)/`case.updated`(`data:{case,stage}`)의 "키 + 새 값" 패턴을 그대로 재사용한 것이다 |
| D-45 | `rumor` Effect 스키마/카운터/이벤트 | **확정(resolved, 8.3절/4.2절, V2-Core-09)**: `subject?`(수신자, 기본값 self, 4.1절 표준 규칙)를 추가했다. `from`은 필드가 있으면 복사 모드가 선택되므로 별도 기본값이 필요 없다(생략하면 다른 모드로 갈 뿐이다). `subject`/`from`은 `relation`의 from/to처럼 `resolveSubjectId`만 쓰고 `state.actors` 레코드 존재는 요구하지 않는다(`state.knowledge`가 `state.relations`와 같은 top-level ID-keyed 맵이기 때문). 재학습 confidence 증감폭은 `data.rules.rumor.relayLoss`/`newSourceGain`/`sameSourceGain`(모두 없으면 0)으로 데이터에 둔다(`stat`/`skill`의 "정의 없으면 clamp 없이 적용"과 같은 안전한 기본값 원칙 — 콘텐츠 밸런스 수치를 엔진이 새로 만들지 않는다). "관찰 시 기본 confidence가 높다"는 수치화하지 않고 `confidence`를 학습/관찰 모드 모두에서 항상 명시적으로 요구한다(생략 시 malformed→throw, `time`의 `minutes` 필수와 같은 태도). D-14(상충 claim)는 별도 행에서 확정. `rumor.learned`/`rumor.updated`의 `data:{rumor,factId,claim,confidence,delta}`(+조건부 `claimChanged`)는 `skill.changed`/`case.updated`의 "절대값+delta" 패턴을 재사용해 새로 확정했다. 존재하지 않는 rumor 정의/`from` 지식 항목/관찰 대상 fact는 모두 D-29류 skip(스키마 타입 오류만 D-28류 throw) |
| D-46 | `move` Effect의 subject/visibility/event | **확정(resolved, 4.2절, V2-Core-11)**: `move`는 4.1절의 "subject 무시" 목록에 없으므로 공통 subject 규칙(기본값 self, D-29)을 그대로 따른다. visibility는 표에 남아 있던 "player" 하드코딩을 skill/trait/unlock과 같은 이유로 D-31(subject 기준)로 갱신한다 — 새 규칙이 아니라 이미 있는 선례의 적용이다. `actor.locationId = to`로 직접 설정, 이미 같은 위치면 no-op(D-30), `data:{to}` |
| D-47 | characterTemplate 스키마, `createInitialState`의 첫 캐릭터 생성, `startCharacter`/succession 구현 | **확정(resolved, 9절/11절, V2-Core-11)**: characterTemplate은 Actor 스키마(2.1절)의 필드 이름을 그대로 재사용한다(`id`/`alive` 제외, 엔진이 계산). `hp.current`는 항상 `hp.max`(만피 시작). **첫 캐릭터는 `startCharacter`를 거치지 않는다** — `createInitialState({worldSeed, data})`가 `data?.world?.startTemplateId`와 그 템플릿이 모두 있을 때만 `player_1`을 직접 만든다(`player:{actorId:"player_1",characterCount:1}`, `pending:null`). `data`가 없거나 `startTemplateId`/템플릿이 없으면 V2-Core-01과 완전히 동일한 최소 state(플레이어/actors 없음)를 반환해 기존 테스트와 100% 호환된다. `startCharacter`는 오직 `pending.kind==="newCharacter"`일 때만(사망 후) 쓰이며, 이때만 `data.rules.succession` Effect(`ctx={actorId:새 캐릭터, targetId:이전 캐릭터}`)를 적용한다 — 첫 캐릭터는 이전 캐릭터가 없으므로 succession을 절대 적용하지 않는다. 사망이 일어난 `step()` 호출은 나머지 파이프라인(9~11단계)을 계속 진행하며 조기 종료하지 않는다(D-34를 step() 레벨로 확장). `startCharacter`의 `templateId`가 `data.characterTemplates`에 없으면 `unknown_action`으로 reject한다(3개 `unknown_X` 코드 중 "참조한 콘텐츠 정의가 없다"는 의미에 가장 가까운 것을 재사용, 새 reason code를 만들지 않음, D-48 참고). `pending.kind`가 `"newCharacter"`가 아닐 때 `startCharacter`를 시도하면 `invalid_action`으로 reject한다 |
| D-48 | `step()`의 action 게이트/대상 조회/reject 코드 매핑 (`perform`/`move`/`startCharacter`), location 스키마 | **확정(resolved, 2.5절/11절, V2-Core-11)**: reason code는 2.6절의 고정 9개(`invalid_action`/`unknown_action`/`unknown_option`/`unknown_location`/`requirements_not_met`/`pending_choice`/`pending_new_character`/`actor_dead`/`no_pending_choice`)만 쓰고 새로 만들지 않는다. `state.player`가 아예 없는(= `data`로 부트스트랩되지 않은) world에서 `wait` 외의 action은 전부 `invalid_action`이다(V2-Core-01 시절과 동일한 동작 — 이 world는 actor 시스템 자체를 지원하지 않는다는 뜻이지, 특정 actor가 죽었다는 뜻이 아니므로 `actor_dead`가 아니다). `state.player`가 있는 world에서는: `pending.kind==="choice"`인데 `choose`가 아니면 `pending_choice`, `pending.kind==="newCharacter"`인데 `startCharacter`가 아니면 `pending_new_character`, `choose`인데 `pending.kind!=="choice"`면 `no_pending_choice`, `startCharacter`인데 `pending.kind!=="newCharacter"`면 `invalid_action`(굳이 필요하지 않은 시점의 시도), `perform`/`move`/`choose`인데 현재 player actor가 `alive===false`(또는 존재하지 않음)면 `actor_dead`. 대상 조회: `perform`은 `data.actions[actionId]` 없으면 `unknown_action`, `move`는 `data.locations[to]` 없으면 `unknown_location`(11절 location 스키마 참고), 링크가 없거나 링크 requires가 거짓이면 `requirements_not_met`. `choose`/`data.choices` 해석은 이번 라운드에 구현하지 않는다(D-35 그대로, 이 단계까지 도달하는 코드 경로 자체가 없음 — 아무 것도 `pending.kind`를 `"choice"`로 설정하지 않기 때문) |
| D-49 | `check()`의 modifier 계산과 `data.rules.check` 기본값 | **확정(resolved, 5절, V2-Core-11)**: 5.3절의 "제안 기본값"을 문자 그대로 엔진의 실제 기본값으로 채택한다(`data.rules.check`에 없는 하위 필드만 이 기본값으로 대체, 있으면 데이터가 우선) — 5.3절 스스로 "제안 기본값이며 밸런스는 테스트로 확정"이라고 명시했으므로 이는 발명이 아니라 문서에 이미 적힌 값을 그대로 코드로 옮긴 것이다. item modifier는 트레잇의 이미 확정된 `modifiers:[{tags,value}]` 스키마(6.2절)를 그대로 `data.items[id].modifiers`에도 적용한다(5.4절이 "item: trait과 같은 방식"이라고 이미 말했으므로 같은 필드 이름을 재사용한 것뿐, 새 스키마 아님). 아이템은 "보유 기준"(D-10 제안 그대로: `actor.inventory[id] > 0`)으로 판정한다. `check(spec, ctx) -> {result, rng}`는 `ctx.state.rng`를 순수하게 소비하고 반환하며(D-27 예외로 이미 문서화됨), state를 직접 mutate하지 않는다 — 호출자(`step()`)가 반환된 `rng`를 작업 사본의 `state.rng`에 대입한다. `check.resolved` 이벤트는 player visibility로 낸다(check는 항상 현재 플레이어 자신의 판정이므로) |
| D-50 | `step()` 9단계(day.started) 구현 범위 | **확정(resolved, 2.5절, V2-Core-12)**: 모든 action 종류(`wait`/`perform`/`move`/`choose`/`startCharacter`)가 자신의 효과를 다 적용한 뒤, action 시작 시점의 `time.minute`과 종료 시점을 비교해 `floor(before/1440)`과 `floor(after/1440)` 사이에 걸친 day마다(0개일 수도, 여러 개일 수도 있음) `day.started` 이벤트를 하나씩 낸다(§2.4가 이미 internal로 고정한 이름을 그대로 씀). `data:{day}`(새로 지나간 day 번호) — 이 필드 이름 외에 다른 것은 계약에 없으므로 추가하지 않는다. NPC/경제 자율 틱은 여전히 연결하지 않는다(§2.5 9단계 자신이 "향후 연결 지점"이라고 명시) |
| D-51 | `step()` 10단계(trigger) 스키마와 구현 범위 | **확정(resolved, 11절, V2-Core-12)**: `data.events[id]`는 Resolvable + `trigger`(Condition, world 문맥)/`once`(불리언, 기본 false)/`cooldown`(정수 분, 생략하면 없음) — 세 필드 이름 모두 §2.5 10단계 원문이 이미 쓴 단어를 그대로 가져왔다. `state.fired[eventId]={count,lastMinute}`(2.1절에 이미 있던 필드)로 once/cooldown을 판정한다. id 오름차순 한 바퀴만 순회하며, 발동한 이벤트의 Effect는 같은 작업 사본에 즉시 적용되어 다음 순번의 트리거 판정에 보인다(이 한 바퀴 안에서의 가시성 자체가 있는 그대로의 순차 적용이지 새 기능이 아니다) — 이번 순회에서 이미 지나간 순번의 트리거가 뒤늦게 참이 되어도 그 순회에서는 재평가하지 않는다(이것이 "연쇄 1단계 제한"이며 다음 `step()`에서 자연히 재평가된다, 별도 카운터 불필요). `trigger.fired`는 §2.4가 이미 internal로 고정했다. trigger의 Resolvable도 `check`를 지원한다(perform/choose와 같은 해석기 재사용, 2.3절) |
| D-52 | `narrate` Effect의 no-op 여부와 event data | **확정(resolved, 4.2절, V2-Core-13)**: `textId`는 string(그 외 malformed→throw), `data.texts`를 조회하지 않는다(259줄 "이벤트는 textId만 참조한다"). 상태를 전혀 바꾸지 않으므로(4.2절 표 "상태 변화 없음") D-30의 "변화 없으면 이벤트 없음"을 적용할 대상 자체가 없다 — narrate는 `time.advanced`처럼 "매번 일어나는 사실"을 알리는 것이지 "값 설정"이 아니므로, 같은 `textId`를 반복해도 매번 이벤트가 난다(no-op 없음). 이벤트 `data:{textId}` |
| D-53 | `view(state, data)`의 정확한 PlayerView 스키마 | **확정(resolved, §8.4/§1.4, V2-Core-13)**: §8.4 원문이 나열한 항목만 그대로 옮긴다(새 카테고리 없음 — facts/cases/rumor 전용 필드/이벤트 로그는 원문에 없으므로 추가하지 않는다): `{actor, knowledge, relations, pending, actions}`. `actor`는 `state.actors[state.player.actorId]`의 깊은 복사(원본 참조 아님). `knowledge`는 `state.knowledge[playerActorId] ?? {}`의 깊은 복사(정확성 필드는 애초에 저장되지 않으므로 그대로 통과됨, §8.2). `relations`는 edgeKey를 `:`로 나눠 플레이어 actorId가 양쪽 중 하나인 항목만 깊은 복사해 필터링(방향 그래프, §7.1). `pending`은 `state.pending ?? null` 그대로. `actions`는 `Object.keys(data.actions).sort()` 순서로 순회하며 D-15가 정한 규칙(만족하는 것 + `showWhenLocked:true`인 잠긴 것)만 `{actionId, available}`로 담는다(requires 평가는 `contextKind:"player"`, `targetId` 없음). `state.player`/해당 actor 레코드가 없으면(부트스트랩 안 된 world) `view()`는 `null`을 반환한다. facts/다른 actor의 knowledge/internal 이벤트는 절대 포함하지 않는다(§8.4 원문 그대로). RNG를 소비하지 않고 `state`/`data`를 mutate하지 않는 순수 함수다 |
| D-54 | §3.2 "shorthand" Condition op 12종(`stat`/`flag`/`signal`/`skill`/`trait`/`item`/`relation`/`fact`/`day`/`location`/`unlock`/`case`)의 정확한 비교 인자 처리 | **확정(V2-Core-14)**: §3.1이 이미 선언한 공통 규칙("수치 비교 인자는 `min`/`max`(포함 범위)로 통일, 둘 다 없으면 존재/참 검사, 동등 비교는 `eq`")을 모든 op에 그대로 적용하는 `matchScalarArgs(value, args)` 헬퍼 하나로 처리한다 — op마다 다른 비교 문법을 새로 만들지 않는다. 값 해석은 기존 selector resolver(`resolveGrowthValue`/`resolveItem`/`resolveFact`)를 그대로 재사용한다(§3.2a 표와 필드 이름이 같은 `stat`/`skill`/`item`/`fact`/`trait`(selector엔 없지만 `resolveGrowthValue`가 이름 무관 범용 헬퍼라 `trait`/`unlock`에도 그대로 적용됨)/`unlock`). `flag`/`signal`은 shorthand op의 인자 이름이 `key`로 selector(`flag`/`signal`)와 다르므로 재사용하지 않고 직접 `state.flags`/`state.signals`를 읽는다. `skill`/`item`은 표에 명시된 대로("min 기본값은 1") 비교 인자가 전혀 없을 때만 `min:1`로 취급한다(다른 op는 이 기본값 없이 §3.1의 일반 존재/참 검사로 떨어진다). `trait`는 비교 인자 없이 보유 여부만 본다(`Boolean(...)`). `relation`은 `from`/`to`를 이미 확정된 Effect 규칙(D-43/7.3절, `from`=target·`to`=self 기본값)으로 해석해 edge(없으면 기본값 `{score:0,mode:"neutral",tags:[]}`)를 얻고, 준 `min`/`max`/`eq`(score)·`mode`·`tag` 중 실제로 준 것만 전부 AND로 검사한다 — **아무 인자도 안 주면(새로 결정한 좁은 규칙) 공허하게 참**으로 둔다(제약이 없으니 어긴 제약도 없다는 뜻일 뿐, "edge 존재 여부"라는 새 의미를 만들지 않는다). `day`는 day 부분(있으면 `matchScalarArgs`)과 `hourFrom`/`hourTo` 쌍(§3.2 원문 그대로 `hourFrom>hourTo`면 자정 넘김)을 독립적으로 AND한다 — 시각 경계는 `min`/`max`와 같은 "포함 범위" 관례를 그대로 확장 적용해 둘 다 inclusive로 정했다(새 관례가 아니라 이미 있는 범위 표기 관례의 재사용). `hourFrom`/`hourTo`는 반드시 둘 다 있거나 둘 다 없어야 하며, 하나만 있으면 malformed로 보아 거짓이다(새 reject 아님, §3.1 그대로 거짓). `location`은 `at`(동등)과 `in`(배열 포함) 중 준 것만 검사하며(`subject` 기본값 self, D-29와 동일 관례), 둘 다 없으면 거짓이다. `case`는 `stage`(동등) 또는 `in`(배열 포함) 중 준 것만 검사하며 둘 다 없으면 거짓이다. `money`는 selector의 `{money:true}` 마커 없이 `subject` 기준 금액을 바로 `matchScalarArgs`로 비교한다. `rumor`는 이번에도 **제외**한다 — D-24(rumor selector 미결정)가 이미 막아둔 문제 위에, shorthand 전용 `minConfidence` 필드와 `{"op":"rumor","fact":...}`(rumor→fact 역참조) 형태까지 새로 결정해야 해서 이번 라운드의 "가장 작은 결정" 범위를 벗어난다(C, 새 의미 결정 필요) — D-24가 풀릴 때 함께 다룬다. **후속(V2-Core-15)**: D-24가 `claim`으로 확정되면서 두 형태 모두 RumorEntry(§8.2)의 이미 고정된 필드(`factId`/`confidence`)를 그대로 읽는 기계적 구현으로 판명되어, D-24와 함께 구현했다(직접 조회는 존재 여부 + `minConfidence`, `fact` 역참조는 `factId` 일치 검색 — 정확성(`isAccurate`)은 계산하지 않는다, §8.2). `handler`는 이 표에 있지만 이미 §4.4/D-38로 "미등록 이름은 거짓"이 정책으로 확정돼 있고 handler 레지스트리 자체가 없으므로 기존 `default: false` 분기가 이미 정확한 동작이다(변경 없음). 새 selector나 새 이벤트를 만들지 않는다 — 이 op들은 모두 `evaluateCondition`이 boolean만 반환하는 기존 계약 안에서 끝난다 |
| D-55 | `validateState(state) -> string[]`의 정확한 검사 범위 | **확정(V2-Core-14)**: §2.1 "불변 조건" 5개 불릿을 그대로, 그러나 각 불릿이 실제로 이름 붙인 범위로만 좁혀 구현한다(새 검사 대상을 발명하지 않는다). (1) JSON 직렬화 안전: `state` 전체를 재귀 순회해 `undefined`/`NaN`/`Infinity`/`-Infinity`/`Map`/`Set`/`Date`/함수를 찾는다(라운드트립 비교 대신 정확한 위치를 보고할 수 있는 동등한 재귀 검사로 구현 — 결과는 "무엇이 어긋났는지"만 다르지 판정 자체는 같다). (2) 정수 검사는 불릿이 **글자 그대로 나열한 6개**(`hp`,`money`,`score`,`confidence`,`stat`,`exp`,`minute`)의 실제 스키마 위치에만 적용한다: `time.minute`, `actors[*].hp.current`/`.max`, `actors[*].money`, `relations[*].score`, `actors[*].growth[*].exp`, `actors[*].growth[*].stats[*]`, `knowledge[*][*].confidence`. `skill`/`proficiency`/`level`이나 `since`/`lastMinute`/`attempts`류 값은 이 불릿이 이름 붙이지 않았으므로 **의도적으로 검사하지 않는다**(범위를 넓히는 새 결정이 필요하면 그때 D-XX로 추가한다). (3) ID 형식(`^[a-z][a-z0-9_]*$`, `:` 금지)은 `state.player.actorId`, `state.actors`의 키, 각 actor의 `.id`(키와 일치해야 함), 각 actor의 `.locationId`에만 적용한다 — `worldId`는 §2.6이 별도의 합성 규칙(밑줄 결합)을 이미 갖고 있어 제외하고, `relations`의 edgeKey는 `:` 구분자가 설계상 포함되므로(§7.1) 애초에 이 검사 대상이 아니며, `flags`/`signals`/`facts`/`cases`/`knowledge`/`fired`/`attempts`의 키는 이 불릿이 이름 붙이지 않았으므로 제외한다. (4)+(5) "이벤트 로그를 두지 않는다"와 "`seq` 필드를 두지 않는다"는 같은 2.4절 근거를 공유하는 한 쌍으로 보고, 스키마에 실제로 존재하는 유일한 구체적 이름인 `state.seq`(own property) 하나만 검사한다 — 스키마에 없는 임의의 "이벤트 로그처럼 보이는 필드"를 찾는 휴리스틱은 새로 만들지 않는다. 추가로, 위 5개 불릿에는 없지만 `migrateState → validateState → 로드 거부`(§10)라는 validateState의 존재 이유 자체가 요구하므로 `state.schemaVersion !== SCHEMA_VERSION`도 오류로 담는다(그렇지 않으면 `step()`이 대신 throw하게 된다, §2.5 1단계) — 이는 새 불변 조건을 발명한 것이 아니라 이미 명시된 로드 순서 계약(§10)을 문자 그대로 지키기 위한 것이다. `state`가 plain object가 아니면 그 사실 하나만 담고 나머지 검사는 건너뛴다(순수 함수, 절대 throw하지 않는다). `migrateState(raw) -> state`는 이번 라운드에도 **의도적으로 미구현**으로 남긴다 — `schemaVersion:1`이 이 프로젝트에 존재했던 유일한 스키마 버전이라 마이그레이션할 실제 구버전이 없고, no-op passthrough를 지금 만드는 것은 `handler`와 같은 이유로 "쓸 내용이 없는 인프라"이기 때문이다(YAGNI, blocker 아님 — 두 번째 스키마 버전이 실제로 생기면 그때 구현한다) **후속(D-63, V2-Core-21)**: `migrateState`는 이후 D-63으로 구현됐다 — 위 "의도적으로 미구현" 문장은 그 이전 이력이다(V2-Core-24 조사에서 재확인, D-66) |
| D-56 | `validateData(data) -> string[]`의 정확한 검사 범위 (§11) | **확정(V2-Core-16)**: §11이 나열한 6개 카테고리를, 각각 계약 다른 곳에 이미 구체적으로 확정된 스키마가 있는 부분으로만 좁혀 구현한다(D-55와 같은 원칙 — 카테고리 이름만 있고 필드 단위 스펙이 없는 부분은 발명하지 않고 범위에서 뺀다). **(1) ID 형식**: §2.1이 이미 고정한 `^[a-z][a-z0-9_]*$`(`:` 금지) 정규식을 그대로 재사용해 `data.id`, `data.world.id`/`.growthSystemId`/`.startTemplateId`, `growthSystems`/`characterTemplates`/`locations`/`actions`/`choices`/`events`/`cases`/`items`/`facts`/`rumors`/`npcs`/`orgs`/`texts`의 키, `choices[*].options[*].id`, growth 정의 배열(`stats`/`proficiencies`/`skills`/`traits`/`unlocks`) 원소의 `.id`에 적용한다. **(2) 참조 무결성**: 이미 런타임이 실제로 역참조하는(또는 D-47처럼 부트스트랩 조건으로 이미 확정된) 대상만 검사한다 — `world.growthSystemId`→`growthSystems`, `world.startTemplateId`→`characterTemplates`(D-47), `characterTemplates[*].locationId`→`locations`(필수 필드, `resolveMove`가 실제로 쓰는 것과 같은 대상), `locations[*].links[*].to`→`locations`(`unknown_location` reject가 실제로 쓰는 대상), `growthSystems[key].id`가 있으면 키와 일치해야 함(있을 때만 검사 — §6.1 예시에 `id`가 있지만 테스트 fixture들은 생략하는 경우가 많아 필수로 만들지 않는다). Effect/Condition 안에서 각 op가 참조하는 개별 ID(아이템/성장/사건 id 등)의 존재까지는 검사하지 않는다(아래 (3) 참고, C). **(3) Condition/Effect op와 인자**: 두 switch문에 이미 고정된 op 이름 목록(Condition 25개 + `handler`, Effect 20개 + `handler`)에 없는 `op`을 "unknown op"로 신고하는 것과, §3.2/§4.1이 이미 구조를 명시한 `and`/`or`(`of`는 배열)/`not`(`of`는 단일 Condition)/`if`(`then`은 필수 배열)의 구조 검사까지만 한다. 20개 Effect·25개 Condition 각각의 세부 인자(정수 범위, enum 등)를 필드 단위로 전부 검사하는 것은 각 op마다 별도의 malformed 스키마를 새로 정의해야 하는 훨씬 큰 결정이라 **범위 밖으로 남긴다(C, blocker)** — 그 세부 검사는 이미 런타임(`applyOneEffect`/`evaluateCondition`)이 각자 D-28/§3.1 정책대로 처리한다. 순회 대상은 이미 스키마가 고정된 위치만 쓴다: `actions[*].requires`/`.effects`/`.outcomes.*`, `choices[*].options[*].requires`/`.effects`/`.outcomes.*`, `events[*].trigger`/`.effects`/`.outcomes.*`, `locations[*].requires`/`links[*].requires`, `rules.succession`, `growthSystems[*].levelRewards[*]`, `growthSystems[*].proficiencies[*].thresholds[*].effects`, `growthSystems[*].skills[*].requires`, `growthSystems[*].traits[*].requires`(마지막 두 개는 §6.2가 스키마를 이미 확정했고 §3.3이 world 문맥으로 이미 확정했다 — 런타임이 아직 이 필드를 읽지 않는다는 사실과는 무관하게 데이터 자체의 정합성은 검사한다), Effect 안의 `if.then`/`if.else`(재귀)와 `if.when`(Condition, 항상 world — rules.js의 실제 `if` 구현과 동일). `data.cases[*].stages[*].completeWhen`과 `data.rules.relation.*.when`(§3.3에 이름만 있고 필드 스키마가 어디에도 없음)은 **범위 밖(C, blocker)** — 무엇이 배열/객체인지조차 정해진 곳이 없어 구조를 지어내야 한다. **재검토(V2-Core-17)**: "20개 Effect·25개 Condition의 세부 인자는 op별 malformed 스키마를 새로 발명해야 한다"는 이 문단의 판단은 Effect에 대해서는 과했다 — `applyOneEffect`의 각 `applyXEffect` 함수가 이미 그 malformed 스키마를 실행 가능한 코드로 정확히 갖고 있으므로(발명이 아니라 이미 있는 코드를 그대로 옮기는 것), D-57에서 Effect 20개 전부를 구현했다. Condition은 §3.1의 "malformed는 항상 false, 절대 throw 안 함" 정책 때문에 런타임에 참고할 malformed 스키마가 없지만, D-54/D-24(V2-Core-14/15)에서 이미 직접 구현한 `relation`/`day`/`location`/`case`/`rumor`의 조합 조건과 각 op의 필수 필드 이름은 D-57에서 마찬가지로 코드를 그대로 옮겨 구현했다. **(4) handler 등록과 reason**: §4.4 원문("`reason`이 없는 handler 참조와 등록되지 않은 name을 오류로 처리한다")을 그대로 구현한다 — `op:"handler"`를 찾을 때마다 `reason`이 string이 아니면 오류, 그리고 `handlers.js` registry 자체가 없으므로(D-04) **지금은 예외 없이 모든 handler 참조가 "등록되지 않음" 오류**다(실제 registry가 생기면 그때 조회 로직으로 바뀐다). **(5) player 문맥의 fact 사용 금지**: §3.3 표에서 `contextKind:"player"`로 이미 확정된 4개 위치(`actions[*].requires`, `choices[*].options[*].requires`, `locations[*].requires`, `locations[*].links[*].requires`)의 Condition 트리 안에서 `{op:"fact",...}`나 `eq`/`neq`/`gt`/`gte`/`lt`/`lte`의 `left`/`right`에 쓰인 `{fact:"..."}` selector를 찾으면 오류(D-06/§8.4). §3.3의 나머지 4개 위치(퀘스트 완료/관계 규칙/성장 해금)는 world 문맥이므로 이 검사 대상이 아니다. `if.when`은 항상 world이므로(rules.js 확인) Effect 리스트 어디에 있든 이 검사에서 제외된다. **(6) Resolvable success/fail 필수**: §2.3 원문("check가 있을 때 outcomes 사용... success와 fail은 필수다")을 그대로 검사한다 — `check`가 있는 Resolvable(actions/choices 옵션/events)은 `outcomes.success`/`outcomes.fail`이 모두 배열이어야 하며, 아니면 오류. `great`/`partial` 누락은 이미 §2.3이 "런타임이 success/fail로 대체"라고 확정했으므로 오류가 아니다. 모든 검사는 `validateState`와 동일하게 **순수하고 절대 throw하지 않으며**(입력이 plain object가 아니면 그 사실 하나만 담고 종료), 기존 Effect/Condition 런타임 semantics는 전혀 건드리지 않는다(별도의 읽기 전용 순회일 뿐 `applyOneEffect`/`evaluateCondition`을 호출하지 않는다) |
| D-57 | validateData의 Effect/Condition **개별 op 인자** 검증 범위 (D-56 (3)의 후속) | **확정(V2-Core-17)**: 새 malformed 스키마를 발명하지 않는다 — Effect는 `applyOneEffect`의 각 `applyXEffect` 함수가 이미 `throw`로 구현해 둔 검사를, Condition은 D-54/D-24(V2-Core-14/15)가 이미 구현해 둔 필수 필드/조합 조건을, 코드 그대로 정적 버전으로 옮긴다(실행하지 않고 값과 타입만 본다). **Effect 20개**(원문 그대로, `subject`/`system`은 모든 항목에서 "있으면 string"): `flag`{`key`string 필수,`value`boolean 필수}. `signal`{`key`string 필수,`add`정수 필수(기본값 없음)}. `time`{`minutes`정수 필수, 0 이상}. `if`(D-56에서 이미 구현, 변경 없음). `stat`{`stat`string 필수,`add`정수 필수}. `hp`{`add`정수 필수}. `money`{`add`정수 필수}. `item`{`item`string 필수,`add`정수 필수}. `move`{`to`string 필수}. `relation`{`add`있으면 정수,`from`있으면 string,`to`있으면 string,`mode`있으면 `"neutral"`/`"cooperation"`/`"conflict"`(7.2절 enum),`tag`있으면 string,`untag`있으면 string — 전부 선택, `subject` 필드 자체가 없음}. `exp`{`amount`0 이상 정수 필수}. `proficiency`{`id`string 필수,`add`0 이상 정수 필수}. `skill`{`skill`string 필수,`add`있으면 정수(기본값 1)}. `trait`{`trait`string 필수,`remove`있으면 boolean}. `unlock`{`id`string 필수}. `case`{`case`string 필수,`stage`string 필수, subject 없음}. `fact`{`fact`string 필수,`set`반드시 존재(값 자체는 무엇이든 허용, `undefined`만 오류), subject 없음}. `rumor`{`rumor`string 필수,`subject`/`from`있으면 string,`observe`있으면 boolean,`source`/`confidence`있으면 각각 string/정수 — **추가로** `from`이 없으면(학습·관찰 모드) `source`와 `confidence` 둘 다 존재해야 하고, `from`이 있으면서 동시에 `observe:true`면 오류(`rules.js`의 실제 `applyRumorEffect` 순서 그대로)}. `narrate`{`textId`string 필수, subject 없음}. `choice`{`choice`string 필수,`sourceId`있으면 string, subject 없음}. `handler`는 D-56 (4)로 이미 구현. **Condition**: 각 op가 최소 하나의 필드가 없으면 항상 거짓으로만 평가되어 값을 갖지 못하는 경우를 검사한다 — `stat`{`stat`string 필수}, `flag`{`key`string 필수}, `signal`{`key`string 필수}, `skill`{`skill`string 필수}, `trait`{`trait`string 필수}, `item`{`item`string 필수}, `fact`{`fact`string 필수}, `unlock`{`id`string 필수}. `rumor`는 `evaluateRumorCondition`이 실제로 쓰는 우선순위 그대로 `rumor` 또는 `fact` 중 **최소 하나**가 string이면 되고 (둘 다 줘도 오류 아님, `rumor`가 우선), 둘 다 없으면 오류. `day`는 `evaluateDayCondition` 그대로 `hourFrom`/`hourTo`가 **둘 다 있거나 둘 다 없어야** 하며 하나만 있으면 오류. `location`은 `evaluateLocationCondition` 그대로 `at`(string) 또는 `in`(배열) 중 **최소 하나**가 있어야 한다. `case`는 `evaluateCaseCondition` 그대로 `case`(string 필수)와 함께 `stage` 또는 `in` 중 최소 하나가 있어야 한다. `relation`/`money`는 현재 구현이 모든 인자를 선택으로 허용하므로(빈 `{op:"relation"}`도 공허하게 참, D-54) 추가 필수 필드가 없다 — 새로 발명하지 않는다. `and`/`or`/`not`/`handler`는 D-56에서 이미 구현했으므로 변경하지 않는다. 이 검사들은 모두 값을 읽기만 하며 `applyOneEffect`/`evaluateCondition`을 호출하지 않는다(런타임 semantics 불변) |
| D-58 | validateData의 Effect/Resolvable **콘텐츠 ID 참조 무결성** 검증 범위 (D-56 (2)의 후속, `web/v2/core/*.js` 전체 재조사) | **확정(V2-Core-18)**: 판단 기준은 "코드가 그 필드를 문자열로 읽는가"가 아니라 **"참조 대상이 없을 때 계약이 이미 명시적으로 우아한 폴백(정의를 못 찾으면 그대로 진행)을 선언했는가"**다 — 선언되어 있으면 그 자체가 "존재하지 않아도 된다"는 계약이므로 검사하지 않는다(검사하면 오히려 이미 확정된 기능을 깨뜨리는 새 제약이 된다). 선언이 전혀 없고 결과가 이미 확정된 다른 메커니즘(reject code, pending 게이트)을 거쳐 추적 가능하면 검사한다(B). 조사 결과표: `stat`/`skill`/`trait`/`proficiency`/`unlock` Effect가 참조하는 `growthSystems[system].{stats,skills,traits,proficiencies,unlocks}` 정의 — **제외**(§4.2가 각각 "정의를 못 찾으면 clamp 없이 적용"/"상한 없음"/"exclusive 처리 없이 추가만"이라고 명시적으로 선언, 콘텐츠를 단계적으로 채워나가는 것을 의도적으로 지원하는 기능). `exp` Effect의 `levelRewards[level]`/`level.expTable` — **제외**(§6.4.1 "level-less growth system: exp only"가 이미 명시적 폴백이고, 특정 레벨에 보상이 없는 것도 정상). `rumor` Effect의 `rumor`→`data.rumors[rumor]` — **제외**(§8.3 원문이 "참조 대상이 없을 뿐 스키마 오류가 아니다"라고 이미 명시, D-29). `item` Effect의 `item`→`data.items` — **해당 없음**(`applyItemEffect`는 `ctx.data`를 전혀 읽지 않는다; `data.items`는 `check()`의 modifier 계산에서만, 그것도 액터의 실제 인벤토리 키를 순회하며 참조하는 동적 조회이고 정의가 없으면 `?? 0`/합 0으로 우아하게 폴백한다 — 정적으로 검사할 authored 참조 자체가 없다). `fact` Effect의 `fact`→`data.facts` — **해당 없음**(`applyFactEffect`는 `ctx.data`를 전혀 읽지 않는다; `data.facts[id].initial`은 §8.1에 스키마만 있고 이를 읽어 시딩하는 런타임 코드가 아직 없으므로 "사전 정의 필수"를 강제할 근거가 없다). `case` Effect의 `case`/`stage` — **해당 없음**(`data.cases[id]`에 대한 스키마 자체가 계약 어디에도 없다, D-56이 이미 확인). `relation`/`rumor`의 `from`/`to`/`subject`(actor 참조), `rumor`/`choice`의 `source`/`sourceId`(불투명 라벨, §4.2가 "엔진이 자동으로 추론하지 않는다"고 명시) — **제외**(둘 다 사용자 지시로 임의 결정 금지 대상). opposed check의 `difficulty.opposed.stat`/`.skill` — **제외**(growth 정의와 같은 `?? 0` 우아한 폴백, throw 없음). **검증하기로 확정한 두 가지(B)**: (1) `choice` Effect의 `choice` 필드 → `data.choices`에 그 키가 존재해야 한다. 명시적 폴백 선언이 어디에도 없고, 없을 때의 결과가 이미 확정된 메커니즘으로 완전히 추적된다 — `choice` Effect는 조건 없이 `state.pending={kind:"choice",choiceId}`를 설정하고(D-35), 이후 `step()`의 pending 게이트(D-48)는 `choose` 외의 모든 action을 거부하며, `resolveChoose`(D-35/D-51)는 `data.choices[choiceId]`가 없으면 `option`을 찾지 못해 항상 `unknown_option`으로 reject한다 — 즉 존재하지 않는 `choice` 참조는 플레이어를 영구적으로 벗어날 수 없는 pending 상태에 가두는, 이미 코드로 확정된 결과이지 새로 발명한 정책이 아니다. (2) Resolvable(`actions`/`choices[*].options[*]`/`events`)의 `check.difficulty`가 **string**이면, `rules.js`의 기존 순수 함수 `checkRules(ctx)`를 `{data}`만으로 그대로 호출해 **실제로 병합된** `difficulties` 객체(데이터가 `difficulties`를 통째로 제공하면 기본값 전체를 대체하고, 없으면 `{easy:8,normal:11,hard:14,extreme:17}`을 그대로 쓴다, §5.3/checkRules 원문)에 그 이름이 없으면 오류로 잡는다 — `resolveDifficulty`가 실제로 `throw`하는 조건(§5.5) 그대로이며, 병합 로직을 다시 구현하지 않고 기존 순수 함수를 그대로 재사용해 로직이 어긋날 위험이 없다. difficulty가 정수이거나 `opposed` 객체(동적 `subject` 포함)인 경우는 검사하지 않는다(정적으로 확정할 대상이 없거나 사용자 지시로 제외된 동적 참조). ID 형식 검사(D-56 (1))와 이번 참조 존재 검사는 **완전히 분리된 오류**로 남긴다 — 형식이 맞지 않는 ID는 이미 D-56이 별도로 잡으므로, 이번 검사는 형식이 유효한 ID가 실제로 target collection에 있는지만 본다(같은 오류로 합치지 않는다) |
| D-59 | `data.cases[*].stages[*].completeWhen`, `data.rules.relation.*.when` — 스키마 부재 확정 종결 (C, D-56/D-58에서 반복 확인된 항목의 재조사) | **재확인, 여전히 C(blocker)(V2-Core-19)**: 이번 라운드에서 CORE_CONTRACTS.md 전체를 `completeWhen`/`stages`/`data.rules.relation`으로 grep해 다시 훑었다 — 두 필드 모두 §3.3의 "사용처" 표(한 줄, `위치`/`contextKind` 두 칸)에 **각각 정확히 한 번**만 등장하며, 그 외 어디에도 JSON 예시, 필드 목록, "이유"/"확장" 설명이 없다. `stages`가 배열인지 객체인지, `s`가 인덱스인지 stage id인지, `completeWhen`이 하나의 Condition인지 여러 stage에 걸친 목록인지, `rules.relation`이 배열인지(§7.2 relation 값 자체와는 다른 무엇인지) 등 최소 구조조차 계약 어디에도 없다. `web/v2/core/engine.js`/`rules.js` 전체를 다시 grep해도 이 두 필드를 실제로 읽는 코드가 **전혀 없다**(런타임이 참고할 malformed 정책 자체가 없음 — D-57/D-58처럼 "이미 있는 코드를 그대로 옮긴다"는 방법을 쓸 수 없다). 테스트 fixture(`tests/v2/*.test.js`) 전체에도 사용 사례가 없다. 결론은 V2-Core-16/18과 동일: 최소 구조조차 지어내야 하므로 (C)다. **이 판단을 종결한다** — 실제 콘텐츠 작성이나 사건/퀘스트/관계 시스템 설계 시점에 `stages`/`completeWhen`/`rules.relation.*.when`의 구체적 스키마를 다루는 새 D-decision(§7/§9 관련 작업)이 먼저 필요하며, 그 전까지는 매 라운드 재조사해도 결론이 달라지지 않는다는 뜻이지 임의로 결정해도 된다는 뜻이 아니다. **후속(D-61/D-62, V2-Core-20)**: 두 필드 "자체"(completeWhen/when이 Condition 하나라는 사실)는 이후 확정됐다 — 아래 D-61/D-62 참고. 이 D-59가 종결한 것은 `stages`/`rules.relation`의 그 이상 구조(전이 실행 시점, effect, 우선순위, cadence 등)이며 그 부분은 여전히 blocker다 **재조사(V2-Core-28, D-69 (2)/(3))**: 두 항목 모두 여전히 C다. 소비 코드는 `validateData`뿐이며, 기존 event 파이프라인이 "조건이 참이면 stage 전이/관계 변경"을 이미 표현한다는 사실과 활성화 시 필요한 결정 목록을 D-69에 기록했다 **후속(V2-Core-38/39, D-73/D-74)**: 이 행이 blocker로 남긴 나머지 구조(stage 전이 실행, relation rule의 effect/우선순위/cadence)는 정의하지 않기로 결정했다 — 두 필드 모두 예약 필드이고 같은 일은 `data.events`로 쓴다. |
| D-60 | validateData의 **CheckSpec 자체 shape**과 **characterTemplate.locationId 필수 여부** — engine.js/`check()` 전수 재대조로 발견 (A) | **확정(V2-Core-19)**: D-57/D-58이 `applyOneEffect`/`evaluateCondition`/`resolveDifficulty`의 difficulty-이름 조회만 미러링했고, `check()`/`resolveDifficulty` 자신의 나머지 throw 조건과 `engine.js`의 `buildActorFromTemplate`은 아직 미러링하지 않았다는 것을 이번 라운드 전수 재대조(모든 `throw new` 위치 재확인)에서 발견했다 — 새 semantics가 아니라 이미 실행 가능한 throw 코드를 그대로 옮기는 것(D-57과 같은 방법). (1) **`resolvable.check`가 있으면 plain object여야 한다** — `check(spec, ctx)`의 첫 줄(`if (!isPlainObject(spec)) throw`) 그대로. (2) **`check.difficulty`는 정수 / 문자열(이름 존재 여부는 D-58이 이미 검사) / `{base:정수, opposed:object}` 중 하나여야 한다** — `resolveDifficulty`의 실제 분기(정수 반환 → 문자열 이름 조회 → `isPlainObject(d)&&isPlainObject(d.opposed)`면 `base` 정수 확인 → 셋 다 아니면 throw) 순서를 그대로 따른다. `opposed.subject`/`opposed.stat`/`opposed.skill`은 D-58과 같은 이유(동적 참조/우아한 폴백)로 검사하지 않는다 — `opposed.base`만 정수인지 본다(`resolveDifficulty`가 정확히 그것만 throw하므로). (3) **`characterTemplates[*].locationId`는 반드시 string이어야 한다** — `buildActorFromTemplate`의 첫 줄(`if (typeof template.locationId !== "string") throw`) 그대로. D-56/D-58은 "있으면 `data.locations`에 존재해야 한다"만 검사했고 "존재 자체가 필수"는 검사하지 않았던 gap이다 — 이번에 필수 여부(타입+존재)와 참조 무결성(대상 존재)을 하나의 조건문으로 합쳐 순서대로 검사한다(타입이 틀리면 참조 검사로 내려가지 않음, 같은 오류로 합치지 않는다는 D-58 원칙 유지). `kind`/`hp.max`/`money`/`inventory`/`growth`/`tags`는 `buildActorFromTemplate`이 전부 `?:` 우아한 기본값으로 처리해 throw하지 않으므로(D-58과 같은 "명시적 폴백은 검사하지 않는다" 원칙) 검사 대상에 넣지 않는다 |
| D-61 | `data.cases[id].stages[*].completeWhen` — 스키마 확정 (D-59가 blocker로 종결했던 두 항목 중 하나, 재검토) | **확정(V2-Core-20)**: `completeWhen`은 **Condition 하나**로 확정한다 — 생략 가능(생략하면 그 stage는 자동 완료 조건이 없다는 뜻), 존재하면 `evaluateCondition`이 그대로 받아들이는 Condition 객체여야 한다. 평가 문맥은 `contextKind:"world"`(§3.3 표, 사건 trigger/성장 해금과 같은 문맥)이므로 D-06의 player-context fact 금지는 적용하지 않는다 — `{"op":"fact",...}`가 그대로 허용된다. 새 quest-condition 시스템이나 새 Condition op를 만들지 않고 기존 `evaluateCondition`/`walkCondition`을 그대로 재사용한다. **이번 결정의 범위는 여기까지다**: `completeWhen`의 실제 평가 시점(언제 어떤 코드가 이 Condition을 부르는지), stage 전이/완료가 일어났을 때의 실행 semantics, `stages`가 배열이라는 것 외의 나머지 구조(각 stage의 다른 필드)는 새로 결정하지 않는다 — D-59가 이 부분에 대해 남긴 blocker는 그대로 유효하다(실제 콘텐츠/사건 시스템 설계가 필요하다) **후속(V2-Core-38, D-73)**: 실행 semantics를 결정했다 — 활성화하지 않는다(예약 필드, `data.events` + `case` Effect가 지원 경로). |
| D-62 | `data.rules.relation.*.when` — 스키마 확정 (D-59가 blocker로 종결했던 두 항목 중 나머지 하나, 재검토) | **확정(V2-Core-20)**: `data.rules.relation`은 ruleId를 키로 하는 객체이며, 각 rule의 `when`은 **Condition 하나**로 확정한다 — 생략 가능(생략하면 그 relation rule은 무조건 적용된다는 뜻), 존재하면 `evaluateCondition`이 그대로 받아들이는 Condition 객체여야 한다. 평가 문맥은 `contextKind:"world"`(§3.3 표)이므로 D-06의 player-context fact 금지는 적용하지 않는다. 기존 `evaluateCondition`/`walkCondition`을 그대로 재사용하고 새 Condition 체계를 만들지 않는다. **이번 결정의 범위는 여기까지다**: relation rule의 effect(무엇을 할지), 여러 rule이 동시에 참일 때의 우선순위, 실행 cadence(언제 평가되는지)는 새로 정의하지 않는다 — D-59가 이 부분에 대해 남긴 blocker는 그대로 유효하다 **후속(V2-Core-39, D-74)**: 실행 semantics를 결정했다 — 활성화하지 않는다(예약 필드, `data.events` + `relation` Effect가 지원 경로). |
| D-65 | `data.facts[id].initial`(§8.1)의 seed 기반 초기화 — 실제 시딩 코드 부재 확인 (V2-Core-22 첫 실제 데이터팩 작성 중 재발견) | **확인, 미해결로 유지(C, 그러나 blocker는 아님 — 콘텐츠가 우회 가능)**: `createInitialState`(engine.js) 전체를 재대조한 결과 `data.facts`를 읽는 코드가 어디에도 없다 — `state.facts`는 오직 `fact` Effect(D-44)로만 lazy 생성된다. §8.1이 문서화한 `initial`(고정값 또는 `{pickFrom:[...]}`로 seed 기반 선택)은 스키마만 있고 이를 읽어 `state.facts`를 채우는 런타임 코드가 없다. **이번 라운드는 이 gap을 메우지 않는다** — "콘텐츠 부족 때문에 새 엔진 기능을 발명하지 않는다"는 V2-Core-22의 원칙에 따라, 첫 데이터팩(`web/v2/data/world.js`)은 `initial`에 의존하지 않고 실제 플레이 경로 안의 `fact` Effect로 명시적으로 값을 설정한다(`fact_ruins_secret`은 `act_investigate_ruins`의 성공 outcome에서 설정됨). `initial`/`pickFrom` 시딩 자체는 향후 별도 라운드의 작업으로 남는다 **재조사(V2-Core-28, D-69 (4))**: 여전히 C다. 새로 확인한 사실 — `deriveSeed`에 넘길 seed(숫자 seed 그대로, 저장된 문자열 `worldSeed`, `rng.seed`)에 따라 결과가 셋 다 달라 seed 입력 결정이 `pickFrom`의 선택 결과를 실제로 바꾼다(§2.7 참고) **해결(D-76, V2-Core-43)**: 인간 결정(#117)으로 seed 입력은 C1, `createInitialState`가 시딩한다 |
| D-63 | `migrateState(raw)`의 현재 스키마 semantics (§1.4/§10, 이전까지 의도적으로 미구현) | **확정·구현(V2-Core-21)**: `SCHEMA_VERSION=1`만 지원한다. (1) `raw`가 plain object가 아니면(`null`/배열/원시값 포함) throw. (2) `raw.schemaVersion`이 정수가 아니면(누락 포함, `undefined`도 이 분기) throw. (3) `raw.schemaVersion === SCHEMA_VERSION`(현재 1)이면 `structuredClone(raw)`을 반환한다 — State shape 자체의 구조적 정합성은 이 함수의 책임이 아니라 §10 로드 파이프라인의 다음 단계인 `validateState`의 책임이다(새 중복 validator를 만들지 않는다, D-55/D-56과 같은 원칙). (4) 정수이지만 1이 아닌 `schemaVersion`(0, 2, 99 등)은 "지원하지 않는 버전"으로 throw — 존재한 적 없는 v0→v1 같은 가상 migration chain은 발명하지 않는다. 함수는 순수하고 결정론적이며 입력을 mutate하지 않는다(항상 `structuredClone`으로 새 객체를 만들어 반환, 원본과 참조를 공유하지 않음). 두 번째 실제 스키마 버전이 생기면 그때 실제 변환 단계를 추가한다 |
| D-64 | V2 저장 adapter (`web/v2/storage/idb.js`) — IndexedDB DB/스토어/레코드 형식과 최소 API (§10, 이전까지 "구현은 뒤로 미룸") | **확정·구현(V2-Core-21)**: DB 이름 `txtrpg_v2`, object store `saves`, keyPath `slot` — §10 원문 그대로, V1의 `AnonymousChroniclesDB`/`anonymous_chronicles_*`와 완전히 분리(전혀 참조하지 않음). 저장 record는 §10 원문 형식 `{slot, schemaVersion, worldId, dataRef, savedAt, state}` 그대로다. **API는 4개뿐이다**(Ponytail — repository/interface/DAO 계층 없음): `save(slot, state, metadata)`, `load(slot)`, `list()`, `remove(slot)`. `save`는 `validateState(state)`를 통과해야 쓰기를 진행하고(실패 시 명확한 오류로 reject, 조용히 성공 처리하지 않음), `schemaVersion`/`worldId`/`dataRef`는 `state` 자신에서 가져와 기록하며 `state`는 저장 전 `structuredClone`으로 깊은 복사한다(입력 mutate 금지). `load`는 없는 slot이면 명확한 오류로 reject하고(자동으로 빈 상태를 만들지 않음), 있으면 `record.state`를 `migrateState` → `validateState`(§10 로드 파이프라인 그대로) 순으로 통과시켜 오류가 있으면 로드를 거부한다(자동 수정 없음). `list()`는 `{slot, schemaVersion, worldId, dataRef, savedAt}` 메타데이터만 반환하고(`state` 전체를 담지 않음), IDB cursor/삽입 순서에 의존하지 않도록 `slot` 문자열 오름차순으로 정렬해 결정론적으로 만든다. `remove(slot)`은 해당 slot만 지우며, 존재하지 않는 slot을 지우는 것은 새 정책을 만들지 않고 IndexedDB 자신의 네이티브 `delete()` 동작(idempotent, 성공)을 그대로 둔다. `savedAt`은 `metadata.savedAt`이 주어지면 그 값을, 아니면 어댑터가 직접 `Date.now()`로 기록한다 — **엔진은 이 값의 존재조차 모른다**(`web/v2/core/*`는 이 파일을 import하지 않고, 이 파일은 IndexedDB/`Date.now`를 쓰는 유일한 V2 파일이다). 브라우저에서 실제 IndexedDB로 검증했다(DB/스토어 생성, save/load/list/overwrite/slot 격리/remove/missing-slot/malformed-record/future-schemaVersion/invalid-state/round-trip/반복 save-load, `tests/v2-storage-browser.spec.js`) — Node 테스트(`tests/v2/storage.test.js`)는 IndexedDB를 직접 건드리지 않는 순수 부분(`buildSaveRecord`/`parseLoadedRecord`)만 검증한다(새 npm mock 의존성을 추가하지 않기 위함) |
| D-66 | V2-Core-24 gap 조사 결과 (Issue #78) — `handler` / `migrateState` / case lifecycle / relation rules / `facts[*].initial` / D-09 / 실제 gameplay 대조 | **조사 기록, 새 semantics는 하나도 결정하지 않는다(코드 변경 없음)**: 계약 → runtime 소비 코드 → data pack → tests → 실제 실행 순으로 7개 항목을 재대조했다(임시 probe로 `evaluateCondition`/`applyEffects`/`step`/`check`/`migrateState`/`validateData`/`parseLoadedRecord`를 직접 호출해 확인했고 저장소에는 추가하지 않았다). 판정: A 이미 구현됨, B 기존 계약만으로 구현 가능, C 설계 결정 필요, D 의도적 미구현. **(1) `handler` — D**: `handlers.js`/registry 없음(D-04), 실제 사용 사례 0(`worldData`에 `"handler"` 없음), §4.4의 3조건 중 ① 미충족. 현재 동작은 그대로다: Condition의 미등록 handler는 `false`, Effect는 `Unknown Effect op` throw, `validateData`는 모든 handler 참조를 "등록되지 않음"으로 보고한다(D-38/D-56). **(2) `migrateState` — A**: D-63으로 구현 완료, `schemaVersion:1`만 통과(v0/v2는 throw, probe 확인), 구버전이 존재한 적 없으므로 migration chain의 근거가 없다. 저장 흐름 대조에서 하나 더 확인했다: `parseLoadedRecord`는 `record.state`만 `migrateState → validateState`하며 record 수준의 `worldId`/`dataRef`는 기록만 되고 로드 시 현재 데이터팩과 대조되지 않는다(probe: `dataRef.id`/`worldId`가 전혀 다른 record도 그대로 로드됨). §10은 대조 semantics를 정하지 않았으므로 C(낮은 우선순위 — 데이터팩이 1개뿐이라 지금 막힌 것은 없다; 필요한 결정은 "불일치 시 거부/경고/무시" 중 무엇인지, 그리고 `dataRef.version` 비교를 하는지 여부). **(3) Case lifecycle — 전이 자체는 A, `completeWhen` 자동 평가는 C**: `case` Effect(stage 직접 설정)와 `case` Condition은 구현·테스트 완료이며 canonical path가 `act_confront_leader`의 outcome에서 `case` Effect로 `resolved`를 설정해 실제로 쓴다(`data.cases`는 데이터팩에 없고 없어도 동작). 반면 `completeWhen`을 읽는 runtime 코드는 없고 `validateData`만 읽는다(항상 참인 `completeWhen`을 둔 data로 `wait` 3회 후에도 `state.cases`는 그대로, probe 확인). 필요한 최소 결정: (a) 평가 시점(§2.5의 몇 단계인지, 매 `step` 종료 시인지), (b) 참일 때 어느 stage로 어떻게 전이하고 어떤 이벤트를 내는지, (c) `stages`의 순서/`id`가 `case` Effect의 `stage` 문자열과 어떻게 연결되는지, (d) stage 전이에 붙는 effect/choice가 있는지(D-59/D-61 그대로). **(4) Relation rules — C**: `data.rules.relation.*.when`도 `validateData`만 읽는다(항상 참인 rule을 둔 data로 `wait`/`perform` 후에도 `state.flags` 변화 없음, probe 확인). 필요한 최소 결정: (a) rule의 effect 필드 스키마, (b) 평가 cadence, (c) 여러 rule이 동시에 참일 때의 우선순위/충돌 처리(D-59/D-62 그대로). canonical path는 `relation` Effect를 직접 쓰므로 막힌 것이 없다. **(5) `data.facts[*].initial` — C(D-65 재확인)**: `createInitialState`는 `data.facts`를 읽지 않아 `state.facts`가 비어 있다(probe: `initial` 고정값을 둔 data에서도 `fact` Condition은 false). `worldData.facts.fact_ruins_secret.initial`은 의도적으로 소비되지 않는 문서용 필드이며 canonical path는 `fact` Effect로 명시 설정한다. §2.7은 스트림(`deriveSeed(worldSeed, "fact:"+id)`, local cursor 0, idempotent)까지만 정했고 남은 결정: (a) `deriveSeed`의 seed 입력이 `worldSeed` 문자열인지 `state.rng.seed`(uint32)인지 — §2.7 표는 `worldSeed`, 공식은 `seed.toString(16)`이며 문자열에서는 radix 인자가 무시되므로 두 입력은 서로 다른 스트림을 만든다, (b) `pickFrom`의 인덱스 공식(예: `nextUint32(...).value % 길이`인지), (c) seed된 fact의 `since`, (d) `initial`의 `validateData` shape. 위 결정 전에는 구현하지 않는다. **(6) D-09 `maxTotalModifier` — D**: 계약 기본값 `null`(cap 없음)과 runtime이 일치한다. `checkRules`는 이 키를 읽지 않으며 `maxTotalModifier:2`를 준 data도 `validateData`는 `[]`, `check()`의 total도 동일하다(probe: 105 = 105) — 즉 null이 아닌 값은 조용히 무시된다. 이는 기존 graceful 동작이므로 validation error로 바꾸지 않는다. canonical path의 check별 modifier 합은 0과 -1(`stat:wit` -1, 등불 +1)이라 cap이 필요한 상황 자체가 없다. **(7) 실제 gameplay gap**: 플레이 루프를 막는 core gap은 **없다** — canonical path(관찰→구매→조사→대화→대면)는 UI 클릭만으로 끝까지 진행된다(V2-Core-23 browser spec). 다만 실제 콘텐츠와 대조해 다음이 확인됐다(모두 데이터팩/UI 쪽 문제이며 기존 계약으로 표현 가능해 core 변경은 필요 없다): ① 어떤 action에도 `minutes`가 없어 canonical path가 끝나도 `state.time.minute`은 0이다(`move`/`wait`만 시간을 쓴다, probe). ② action에 `location` Condition이 없어 `view().actions`가 위치와 무관하다(probe: 폐허에서도 `act_observe_village`/`act_talk_elder`가 수락됨) — 이동이 플레이에 영향을 주지 않는다. ③ `data.events`/`rules.succession`/HP를 바꾸는 Effect가 데이터팩에 전혀 없어 §2.5 9~10단계(day.started/trigger)와 사망/`newCharacter`/계승이 실제 콘텐츠에서 도달 불가다(probe: `state.fired`는 null, HP는 10/10 유지; 엔진 자체는 `tests/v2/core.test.js`/`effects.test.js`가 검증). ④ 그 결과 V2-Core-23의 `renderNewCharacter`는 어떤 browser spec으로도 실행된 적이 없다(UI 테스트 gap이지 core gap이 아니다). ⑤ NPC는 relation/rumor 참조 ID일 뿐 actor 레코드가 없다(D-50/Issue #74 범위 밖, D). **다음 issue 후보(우선순위 순)**: (i) ①~④를 채우는 최소 콘텐츠 변경 — 이미 구현된 Resolvable `minutes`/`location` Condition/`data.events`/`hp` Effect/`rules.succession`만 사용하며 구체적인 값은 콘텐츠 설계 결정이다(그때 `newCharacter` UI 경로의 browser 검증도 함께 가능해진다), (ii) D-67(view/UI 경계). (2)~(5)의 C 항목은 실제 콘텐츠가 그 기능을 필요로 할 때 각각 새 D-decision으로 연다 — 지금은 막힌 것이 없으므로 조사만 하고 구현하지 않는다 **후속(V2-Core-25, Issue #80)**: (7)의 ①~④ 데이터팩 gap을 기존 계약만으로 채웠다(`web/v2/core/*`/`storage/idb.js`/`rng.js` 코드 변경 없음, 새 semantics 없음, 새 D-decision 없음). ① 시간: `act_investigate_ruins`(60분)/`act_confront_leader`(30분)에 Resolvable `minutes`(§2.3)를 부여했다(canonical path 종료 시 `state.time.minute`은 90). 정확한 이벤트 목록을 단언하는 기존 테스트가 있는 action에는 부여하지 않았다. ② 위치: `act_observe_village`/`act_talk_elder`에 `location` Condition(`at:"loc_village"`, `contextKind:"player"`, D-54)을 연결했다 — 다른 위치에서 `showWhenLocked`가 없는 쪽은 `view()`에서 사라지고 `showWhenLocked:true`인 쪽은 `available:false`(사유 필드 없음, D-15)로 남으며 직접 시도하면 `requirements_not_met`로 reject된다(D-48). ③ 이벤트/HP/사망: `data.events.evt_ruins_hazard`(trigger `location at loc_ruins`, `cooldown:30`, `hp` -4와 `narrate`)가 §2.5 10단계(D-51)에서 실제로 실행되고, 세 번째 hit(clamp로 delta -2)에서 `hp` Effect의 사망 트리거(D-34)가 `actor.died`와 `pending:{kind:"newCharacter"}`를 낸다. 사망이 일어난 step은 나머지 파이프라인을 계속 진행하므로 그 step의 `narrate`도 실행된다(D-47). ④ succession — **B로 판정**: 소비자가 이미 있고(engine.js `resolveStartCharacter`) ctx(`actorId`=새 캐릭터, `targetId`=이전 캐릭터)가 D-47로 완전히 확정돼 있어 `rules.succession`으로 `money +3`과 `narrate`만 연결했다(subject 기본값 self가 새 캐릭터이므로 `money`가 새 캐릭터에게 적용됨을 Node/browser로 확인했다). 이전 캐릭터(`targetId`)의 아이템/관계를 물려주는 계승은 §9가 "무엇을 계승할지는 미정"이라고 남긴 콘텐츠 결정이라 연결하지 않았다. 검증: `tests/v2/data-world-lifecycle.test.js`(Node)와 `tests/v2-ui-lifecycle-browser.spec.js`(Playwright — 이동/잠금/시간/이벤트/HP/사망/`newCharacter` UI/succession/pending 상태의 save→reload→load; `renderNewCharacter`가 처음으로 실제 브라우저에서 실행됨). 조사 중 확인한 사실(모두 기존 동작이며 결정이 아님): 이벤트는 cooldown이 지난 뒤에만 재발동한다(29분 뒤 미발동, 30분 뒤 발동), 새 캐릭터는 마을에서 시작하므로 폐허 이벤트의 대상이 아니다, 사망한 캐릭터의 actor 기록과 time/`fired`는 유지된다(§9). **남은 것(콘텐츠 결정이며 C가 아님)**: `act_buy_lantern`/`act_investigate_ruins`에는 위치 제약을 주지 않았다 — canonical path(테스트 3종)가 마을에서 바로 조사하도록 되어 있어 제약을 주려면 그 path와 테스트를 함께 바꿔야 하기 때문이다. HP 회복 콘텐츠가 없어 HP는 회복되지 않는다. D-66 (2)(`dataRef`/`worldId` 불일치 load)와 D-67(view 경계)은 이번에도 결정하지 않았다 **후속(V2-Core-26, Issue #82)**: 저장 provenance(`dataRef`/`worldId`)를 save→load→migrate→state 복원 흐름 전체에서 실제 함수 호출로 추적했다(코드 변경 없음, 새 semantics 결정 없음). **확정된 사실(계약과 코드가 이미 정한 것)**: (a) `dataRef`는 state 생성 시점 데이터팩의 `{id, version}`이다(`data.id`가 string일 때만 존재, §2.1/engine.js). `worldId`는 D-03/§2.6의 `${world.id}_${hex(hashString(worldSeed))}`로, 팩의 world 정의와 seed를 합친 세계 인스턴스 식별자이며 `state.worldSeed`로 재계산할 수 있다. 둘은 서로 다른 것을 식별한다(같은 팩에 다른 seed면 dataRef는 같고 worldId는 다르다). (b) save record는 두 값을 state에서 복사해 헤더에 기록하고(D-64, data 없이 만든 bare state는 null) load는 `record.state`만 `migrateState → validateState`한다 — 헤더의 `schemaVersion`/`worldId`/`dataRef`는 읽지 않는다. (c) 책임 경계: `migrateState`는 `schemaVersion`만 다루고(D-63, 다른 버전은 throw, provenance는 그대로 통과), `validateState`는 데이터 없이 state 내부 불변 조건만 검사하며(D-55, provenance는 JSON 안전성만), `validateData`는 데이터만 검사한다. 세 함수 모두 인자가 하나라 state와 팩을 대조할 수 없고 §1.4의 공개 API 어디에도 state와 팩의 호환성을 검사하는 함수가 없다 — 즉 호환성 검사는 기존 어느 계층의 책임도 아니며 새 계층/API를 어디에 둘지의 결정이 필요하다. (d) 엔진은 어떤 팩으로 step해도 정합성 오류를 내지 않는다(probe: 다른 팩에 없는 action은 `unknown_action`, 없는 location은 `unknown_location`으로 reject되고 있는 action은 그대로 실행된다) — 불일치는 조용한 이상 동작으로만 나타난다. **C(미결정, 구현하지 않음)**: ① 비교 기준 — `dataRef.id`만 볼지 `version`도 볼지(동등/호환/semver 중 무엇인지), `worldId`는 world.id 접두만인지 seed까지 포함한 전체인지. ② 불일치 시 정책(거부/경고/무시/사용자 선택) — 임의로 throw, 자동 migration, save 삭제, fallback world 선택을 만들지 않는다. ③ `dataRef`/`worldId`가 없거나 타입이 틀린 save의 처리 — 부재 자체는 D-47의 bare state 때문에 정상이고 잘못된 타입은 현재 통과한다. ④ 헤더와 state 안의 사본이 서로 다를 때 어느 쪽이 권위인지. ⑤ 같은 schemaVersion에서 팩 `version`만 다를 때(콘텐츠가 고쳐진 뒤의 옛 save)에 D-63의 schemaVersion migration과 별개인 data migration이 필요한지. ⑥ 검사를 어디에 둘지(새 공개 함수, `load` 어댑터, UI). **새로 발견한 gap(C)**: `id`는 있고 `version`이 없는 팩은 `validateData`를 통과하지만 `createInitialState`가 `dataRef.version===undefined`를 만들어 §2.1의 JSON 안전 불변 조건을 어기고(`validateState`가 거부) 그 게임은 플레이는 되지만 저장할 수 없다(`tests/v2/save-compat-view.test.js`가 재현). 해결 방식(`version` 필수화, undefined 생략, null 기록)은 `dataRef`의 모양에 대한 결정이라 계약이 정하지 않았고, 실제 팩(`web/v2/data/world.js`)은 `version`을 가지므로 현재 영향은 없다. **문서 정정**: §2.1 예시의 `worldId:"fantasy_pack:3f2a91c0"`는 D-03/§2.6/D-55/실제 코드(`frontier_village_26726076`)와 다른 `:` 구분자였다 — 밑줄 결합으로 고쳤다. **회귀 테스트**: `tests/v2/save-compat-view.test.js`가 계약이 정한 부분(provenance의 의미, 일치하는 팩의 round-trip, schemaVersion 불일치 거부와 그 책임이 `migrateState`에 있다는 것, 책임 경계)만 고정하고, 미결정 부분(불일치 미검사, `version` 없는 팩)은 CHARACTERIZATION ONLY로 표시해 현재 동작을 재현 가능하게 기록했다 — D-66이 결정되면 그 구간을 결정된 정책의 테스트로 교체한다 **해결(V2-Core-27, Issue #84)**: 위 C 항목 ①~⑥과 `version` 없는 팩의 새 gap은 D-68에서 확정했다 — 비교 기준(`dataRef`는 id와 version의 정확한 일치, `worldId`는 그 state의 자신의 seed로 재계산한 값과 전체 일치), 불일치 정책(거부, 고치지 않음), 부재/형식 오류(불일치), 헤더 대 state(state가 권위), 검사 위치(별도의 순수 함수를 현재 팩을 가진 caller가 로드 경계에서 호출), `version` 없는 팩(허용, `dataRef:{id}`). ⑤(같은 schemaVersion에서 팩 version만 다른 save)는 "정확히 일치하지 않으면 불일치이며 옛 save는 보존되지만 불러올 수 없다"까지만 확정했고, version 범위나 data migration은 C로 남는다(D-68 (a)). V2-Core-26의 CHARACTERIZATION ONLY 테스트는 결정된 계약 테스트로 바뀌었다 |
| D-67 | `view()`와 UI의 경계 — V2-Core-23 UI가 `view()` 밖의 `state`/`evaluateCondition`을 직접 읽는 것을 어떻게 볼 것인가 (V2-Core-24 조사에서 발견) | **C, 미결정(아무것도 바꾸지 않음)**: D-53은 `view()`를 §8.4가 나열한 `{actor, knowledge, relations, pending, actions}`로 확정했고 여기에는 시각(`state.time.minute`)과 이동 가능한 링크가 없다. V2-Core-23의 `web/v2/ui/app.js`는 (a) 시각을 `state.time.minute`에서, (b) 플레이어 actorId를 `state.player.actorId`에서, (c) 이동 링크를 `evaluateCondition(link.requires, {state, data, ...})`로 전체 `state`와 `data`를 직접 읽어 얻는다 — 로컬 단일 클라이언트에서는 정상이고 D-06/D-15(잠금 사유 비노출)도 어기지 않지만, §8.1이 밝힌 확장 방향("서버로 전환하면 클라이언트는 view만 받는다")과는 긴장이 있다: 그 구조가 되면 UI는 전체 `state`를 갖지 못하므로 (a)~(c)를 `view()`가 제공해야 한다. 필요한 최소 결정: `view()`가 시각과 이동 가능 링크를 포함할지(포함한다면 D-53의 "새 카테고리 없음" 원칙을 어떻게 갱신하는지, 이동 링크의 잠금 사유를 비노출로 유지하는지). 지금은 서버 전환 계획이 없고 막힌 것이 없으므로 구현하지 않으며 UI를 바꾸지도 않는다 **후속(V2-Core-26, Issue #82)**: `web/v2/ui/app.js`가 `view()` 밖에서 읽는 것을 전수 대조했다(코드 변경 없음). **문서가 요구하는 모델(확인)**: 현재 프로토타입은 브라우저에서 엔진을 그대로 실행하는 local-client 모델이다 — DEVELOPMENT_RULES §13("프로토타입에서는 같은 엔진을 브라우저에서 실행하지만, 데이터 모델상 Fact와 플레이어 지식은 분리한다"), CORE_CONTRACTS §1.1(엔진을 브라우저/Node 테스트/향후 Node 서버에서 실행, 서버 권위 전환은 "호출 위치만 옮기면 된다"는 확장)과 §8.1의 "확장:" 표기, DEVELOPMENT_RULES §22(서버 구현은 지금 하지 않음). 서버 권위 모델(클라이언트는 view만 받음)은 문서상 미래 확장이지 현재 요구가 아니므로 현재 UI 구조는 문서와 충돌하지 않는다 — 이 D-67의 "충돌 가능성"은 현재 위반이 아니라 서버 전환 시점의 미결정이다. `view()`는 D-53대로 플레이어에게 보여도 되는 정보의 투영(진실, 타 actor 지식, internal 이벤트, 잠금 사유 비노출)이고 UI는 이 성질을 지킨다: 잠긴 항목은 사유 없는 비활성 버튼이며, 이동 링크와 선택지의 `requires`는 player 문맥이라 `validateData`가 `fact` 사용을 금지하므로(D-06) 전체 state로 평가해도 진실이 새지 않는다. **UI의 `view()` 밖 접근 목록(사실)**: (1) 시각 `state.time.minute`(view에 없음). (2) 플레이어 id `state.player.actorId`(`view().actor.id`와 같은 값이라 view로도 얻을 수 있다). (3) 이동 링크 가시성 — `data.locations[*].links[*].requires`를 전체 state로 `evaluateCondition`(view에 이동 링크가 없음). (4) 선택지 옵션 가시성 — `data.choices[id].options[*].requires`를 같은 방식으로 평가(`view().pending`은 `{kind, choiceId, sourceId}`뿐이라 옵션 목록이 없다; 이 항목은 D-67 최초 기록에서 빠져 있었다). (5) 엔진 소유 자체 — `createInitialState`/`step`/`storage.save·load`/`validateState`를 UI가 직접 호출한다(local-client 모델의 정의). 나머지 화면(HP/소지금/성장/소지품/잠금 목록/pending/knowledge)은 `view()`만으로 그려진다. **판정**: 현재 모델(B, local-client)은 문서와 일치하므로 UI와 `view()`를 바꾸지 않는다 — 기존 계약만으로 결정 가능한 최소 변경이 없다. **C(미결정)**: view-authoritative 모델(A)로 가려면 ① `view()`에 시각, 이동 가능 링크(이름 포함 여부), 선택지 옵션을 넣을지(D-53의 "새 카테고리 없음" 갱신), ② 이동/선택지에서도 잠금 사유 비노출을 유지하는 방식, ③ 클라이언트와 서버 사이 프로토콜(action 입력, view와 player 이벤트 출력)과 save의 소유, ④ UI의 `evaluateCondition` 직접 호출 제거 — 모두 서버/Worker 경계를 실제로 만들 때 함께 정할 사항이고 지금은 서버 구현을 하지 않으므로(YAGNI) 구현하지 않는다. **회귀 테스트**: `tests/v2/save-compat-view.test.js`가 `view()`의 카테고리(D-53), 시각/이동/선택지 옵션의 부재, `view().actor.id`, save/load 뒤 동일성, 사망/`newCharacter` 화면의 view 표현을 고정하고, `tests/v2-ui-view-boundary-browser.spec.js`가 화면과 `view()`의 일치, 요구조건 있는 이동 링크와 잠긴 action의 사유 비노출, 실제 IndexedDB reload+load 뒤 `view()` 동일성을 고정한다. `view()`에 시각/이동을 추가하는 결정이 나면 위 부재 단언이 실패해 의식적으로 갱신하게 된다 |
| D-68 | 저장 호환성 정책 — save를 현재 데이터팩과 함께 써도 되는가 (D-66의 C를 확정, Issue #84, V2-Core-27) | **확정·구현(V2-Core-27)**: **결정 근거**: 이 issue의 목적은 호환되지 않는 save를 잘못된 팩으로 조용히 실행하는 것을 막는 것이다. 금지 목록(자동 migration, save 삭제, fallback world, 임의의 repair, 팩 version 자동 변환, schemaVersion과 data version의 의미 혼합), §10의 "오류가 있으면 로드를 거부한다(자동 수정하지 않음)", §2.6이 결정론을 "같은 data일 때"로 정의한다는 사실을 함께 만족하는 정책은 "검출하고 거부한다, 고치지 않는다" 하나뿐이다(경고 후 진행은 조용한 실행이 남고 나머지는 금지). **정책**: state의 provenance(`dataRef`, `worldId`)가 "현재 팩과 그 state의 `worldSeed`로 `createInitialState`가 기록했을 값"과 같으면 호환이다. provenance 도출 규칙을 하나로 합쳐(`deriveProvenance`, engine.js 내부) `createInitialState`와 새 순수 함수 `checkDataCompatibility(state, data) -> string[]`(engine.js, §1.4 API에 추가)이 같은 규칙을 쓰게 했으므로 생성과 검사는 어긋날 수 없다. 빈 배열이면 호환이다. **각 질문의 결정**: (1) `dataRef`는 생성 시점 팩의 `{id, version}`이고 비교는 `id`와 `version` 모두의 정확한 일치다. `version`은 불투명한 label이라 순서, 범위, semver 의미를 두지 않는다(그런 의미는 새 versioning semantics의 발명이다). `null`과 빈 문자열도 정의된 값으로 취급해 서로, 그리고 부재와 구별한다. (2) `worldId`는 저장 식별자가 아니라 세계 인스턴스 식별자다(저장 식별자는 `slot`, D-64). D-03대로 `world.id`와 seed의 조합이고, 호환 검사에서는 그 state 자신의 `worldSeed`로 다시 계산한 값과 전체가 같아야 한다(world.id가 다르거나 worldId가 변조되면 불일치). (3) 다른 seed의 같은 팩은 호환이다 — state가 자신의 seed와 rng를 들고 있어 seed는 데이터 호환의 키가 아니다. (4) record 헤더(`dataRef`/`worldId`/`schemaVersion`)와 state 안의 값 중 **state가 권위**다. 헤더는 `list()`를 위해 state에서 복사한 색인이며(D-64), 불일치해도 로드와 호환 판정은 state만 본다(헤더를 믿고 통과시키지도, 헤더 때문에 막지도 않는다). 손상이나 변조를 막는 것은 목표가 아니다(§2.6: 안티치트 목적 아님). (5) 누락되거나 형식이 틀린 provenance는 불일치다(호환됨을 증명할 수 없다). 검사 함수는 어떤 입력에도 throw하지 않는다(`validateState`와 같은 계약). (6) `schemaVersion`은 별개의 축이다 — `migrateState`(D-63)만 다루고 호환 검사는 읽지도 않으며, 팩 `version`을 schemaVersion으로 취급하지도 않는다. **누가 언제 검사하나(후보 비교)**: storage adapter에서 검사하는 안은 adapter가 현재 팩을 모르고 팩 인자를 받게 하면 저장소가 콘텐츠에 묶이며 adapter API가 바뀌어 기각했다. `migrateState`/`validateState` 안에서 검사하는 안은 D-63/D-55의 데이터 무관 계약과 1인자 API를 깨서 기각했다. 검사를 두지 않고 caller 책임으로만 두는 안은 조용한 실행 위험이 그대로 남고 호출자마다 도출 규칙을 복제하게 되어 기각했다. **별도의 순수 함수를 현재 팩을 가진 caller가 로드 경계에서 호출**하는 안을 택했다(약 25줄, 새 추상화 없음). 이 앱에서는 UI의 `loadGame`이 기존 `validateState` 재검사 바로 뒤에서 호출하고, 불일치면 기존 오류 영역에 사유를 보여주며 불러오지 않는다(저장은 삭제/수정하지 않는다). `storage/idb.js`, `migrateState`, `validateState`, `step()`은 그대로다(step은 검사하지 않으며 강제는 로드 경계의 몫이다). **versionless 팩**: `validateData`를 통과하는, `id`는 있고 `version`은 없는 팩을 허용하고 `dataRef`는 `{id}`다(`version` 키 없음). `createInitialState`가 `version:undefined`를 만들면 §2.1의 JSON 안전 불변 조건을 어기는데(V2-Core-26에서 발견한 gap), `undefined`를 JSON이 하는 그대로 생략하면 그 위반이 사라지고 새 의미(필수화, sentinel)를 만들지 않는다. 버전이 있는 팩의 `dataRef`는 이전과 같다. **호환 판정표**: 정확히 일치는 호환. 같은 dataRef이고 다른 worldId(world.id 또는 변조)는 worldId 불일치. 다른 dataRef이고 같은 world는 dataRef 불일치. 둘 다 다르면 두 가지 모두 보고. schemaVersion 불일치는 이 함수의 대상이 아니며 migrateState가 throw한다. 누락이나 형식 오류는 불일치. versionless 팩은 자기 팩과는 호환이고 버전 있는 팩과는 양방향으로 불일치. **여전히 C**: (a) 팩 `version` 사이의 호환 범위나 data migration(옛 save를 새 팩으로 옮기는 것) — 정확한 일치만 인정하므로 팩 version을 올리면 그 이전 save는 삭제되지 않은 채 불러올 수 없게 된다. 이를 완화하는 것은 새 versioning/migration semantics라 별도 결정이 필요하다. (b) `version`의 형식/타입 제약 — `NaN` 같은 JSON 비안전 값은 여전히 저장할 수 없다(`tests/v2/save-compat-policy.test.js`에 CHARACTERIZATION ONLY로 재현). (c) id와 version이 같은데 내용이 바뀐 팩은 검출할 수 없다(팩 작성자가 version을 올리는 규율에 의존한다). (d) UI 외의 caller(향후 Worker/server)가 이 검사를 어떻게 호출하는지는 D-67의 경계 결정과 함께 정한다. **회귀 테스트**: `tests/v2/save-compat-policy.test.js`(Node)와 `tests/v2-ui-save-compat-browser.spec.js`(Playwright, 실제 IndexedDB) |
| D-69 | V2-Core-28 미결 core semantics 조사 (Issue #86) — D-09 `maxTotalModifier` / case `completeWhen` / relation rules / `facts[*].initial` / 실제 gameplay gap | **조사 기록. 새 semantics는 하나도 결정하지 않았고 코드, 데이터, 테스트도 바꾸지 않았다**: 각 항목을 계약 → runtime 소비 코드 → 데이터팩 → 테스트 → 실제 실행(Node probe와 실제 Chromium probe, 저장소에는 추가하지 않음) 순으로 대조했고, 기존 계약만으로 완전히 결정되는 항목(B)은 없었다. **(1) D-09 — D(의도적 미사용)**: 계약은 `maxTotalModifier: null`(§5.3)과 "향후 cap 적용 순서를 고정하기 위한 breakdown 순서"(§5.4)만 두었고 cap의 의미는 정하지 않았다. `checkRules`는 이 키를 읽지 않으며(주석: 기본값이 "cap 없음"이라 구현할 결정이 없다) 값이 없음/null/0/2/-5여도 `check()`의 total은 같다(probe: 모두 107, 실제 Chromium도 동일). `validateData`는 어떤 값이든 통과시킨다(`"x"` 포함). 즉 non-null 값은 조용히 무시되며 이것이 D-09가 정한 미구현의 귀결이다. 테스트에는 이 키가 없다. 실제 팩의 check 두 개의 modifier 합은 0과 -1이라 필요 없다. 다만 기존 mechanics만으로도 합은 커질 수 있다(wit 20, proficiency 100, item, relation 100, situational 3이면 +18이고, hard 난이도 14에서 최소 굴림 2를 더해도 20이라 great 임계값을 넘는다) — cap이 필요해지는 시점은 콘텐츠가 그 수치들을 실제로 키울 때다. 활성화할 때 필요한 결정: 무엇에 상한을 두는지(modifier 합인지 주사위를 포함한 total인지), 대칭/양수만/하한 여부, 값의 형식, 어떤 출처를 세는지(situational 포함 여부)와 §5.4 순서를 순차 절단으로 쓰는지 최종 clamp로 쓰는지, `check.resolved`의 breakdown에 절단분을 어떻게 남기는지, `retryPenalty`/difficulty와의 관계, 잘못된 값의 처리(무시/오류). **(2) `completeWhen` — C**: 계약은 "Condition 하나, optional, world 문맥"(D-61, §3.3)까지만 정했다. 소비 코드는 `validateData`뿐이다(probe: `completeWhen`이 참인 상태에서 wait/perform/move 뒤에도 `state.cases`는 그대로). 데이터팩에는 `data.cases`가 없고 `case_ruins_mystery`는 명시적 `case` Effect로만 움직이며 stage 이름은 어떤 정의와도 대조되지 않는다. 테스트는 검증 4개뿐이고 runtime 테스트는 없다. **새로 확인한 사실**: 기존 event 파이프라인이 "조건이 참이면 stage를 바꾼다"를 이미 표현한다 — `data.events`의 trigger에 조건, effects에 `case` Effect를 두면 조건이 참이 된 바로 그 step의 10단계(D-51)에서 `case.updated`가 나온다(probe, 실제 Chromium도 동일). 그러므로 첫 결정은 전용 필드가 필요한지 자체다. 필요하다면 평가 시점(step 종료/`case` Effect 시점/event와의 관계), 참일 때 어느 stage로 어떻게 전이하고 무엇을 완료로 보는지(stage인지 case 전체인지), 발생 이벤트, choice/event/succession과의 상호작용, 연쇄 제한을 정해야 한다. **(3) relation rules — C**: 계약은 `when`(Condition 하나, D-62)과 §11의 `rules.relation` 자리만 있고 rule의 effect 스키마가 없다. 소비 코드는 `validateData`뿐이다(probe: `when`이 참이어도 규칙의 효과가 나오지 않음). 데이터팩은 관계 변화를 명시적 `relation` Effect로 낸다. 테스트는 검증뿐이다. 참고 사실: event 파이프라인은 cadence(매 step 10단계)와 우선순위(id 오름차순, 앞 효과를 뒤가 즉시 봄, D-51)를 이미 정의한다(probe: 참인 trigger 둘이 id 순서로 발동해 관계가 5 다음 10으로 누적). rule에 필요한 결정: effect 스키마, 평가 시점과 횟수(매 step/관계 변경 시/불동점 반복), 동시에 참일 때의 우선순위와 충돌, event와의 관계. **(4) `facts[*].initial` — C(D-65 재확인)**: 소비 코드가 없다(probe: `initial`이 있어도 `state.facts`가 비고 `fact` Condition이 못 보며 `createInitialState`의 events는 빈 배열). 정해진 조각은 있다 — 시점은 `createInitialState`, 스트림은 라벨 `fact:<id>`에 local cursor 0인 world-generation 스트림(§2.7, 이미 초기화된 대상은 다시 하지 않음), `since`는 값이 설정된 minute이므로(probe: `fact` Effect가 `time.minute`을 기록) 생성 시점 0이 자연스럽다. 결정되지 않은 것: **seed 입력** — §2.7은 seed를 숫자로 전제(`toString(16)`, `getRandomValues`)하지만 구현은 `worldSeed`를 String으로 저장하고(UI는 `randomUUID`) `rng.seed`는 그 hash(uint32)다. 같은 게임에서 숫자 seed 그대로, 저장된 문자열, `rng.seed`를 `deriveSeed`에 넣으면 결과가 셋 다 다르고(probe), 문자열과 `rng.seed` 두 관례가 `pickFrom`에서 다른 항목을 고른 비율이 200개 seed 중 124개였다. 그 밖에 `pickFrom` 인덱스 공식, 생성 시 이벤트 유무, `validateData`의 `initial` shape, `pickFrom` 예약 키와 그 키를 가진 리터럴 객체의 구분, 미지원 형태의 처리, 고정값만 먼저 구현할지(나머지가 조용히 시딩되지 않는 함정이 생긴다)가 남아 있다. §13.2가 요구하는 "seed 차이 → pickFrom fact 초기값이 달라진다" 테스트도 시딩이 없어 아직 쓸 수 없다. **(5) 실제 gameplay gap(core와 콘텐츠 분리)**: canonical 플레이는 위 네 가지 중 어느 것도 필요로 하지 않는다 — case 진행, 관계 변화, fact 설정은 명시적 Effect로, 자동 진행은 event로 표현할 수 있으므로 core에 결정이 필요한 gap은 없다. 콘텐츠 gap: HP 회복은 `hp` Effect가 이미 회복과 max clamp를 한다(probe: 3에서 7, +99는 10) — 필요한 것은 회복 action/event와 그 수치(콘텐츠 결정)다. 주의: 이미 죽은 actor에게 `hp`를 더하면 hp만 오르고 `alive`는 false로 남는다(probe). §9가 "죽은 actor에게도 Effect는 평소대로 적용"이라고 했고 부활 semantics는 정하지 않았으므로 회복 콘텐츠는 죽은 actor를 대상으로 하지 않게 설계해야 하며, 부활을 정의할지는 C다. 추가 위치 제약은 `location` Condition이 이미 있고 canonical path와 테스트를 함께 바꿔야 하는 콘텐츠 결정이다. **판정 요약**: D-09 D, `completeWhen` C, relation rules C, `facts[*].initial` C. 각 항목은 실제 콘텐츠가 그 기능을 필요로 할 때 별도 D-decision으로 연다. **후속(V2-Core-34, D-70)**: (5)에서 남긴 "죽은 actor를 대상으로 하지 않게 설계"의 반대편 — 죽은 캐릭터와 그 후계자 사이에서 무엇이 개인의 것이고 무엇이 세계의 것인지 — 를 실제 state로 대조해 D-70에 기록했다 **후속(V2-Core-37, D-72)**: (2)(3)(4)를 같은 방법으로 다시 추적해 결론은 그대로 C이고 새로 확인한 사실만 D-72에 기록했다: validator가 검사하지 않는 것의 목록(stage id/중복/전이 대상/추가 필드, rule의 effect/cadence 필드, `initial`의 모양), `case` Effect는 `data.cases`와 대조하지 않는다는 것, `self`가 world 문맥에서 누구인지, Node와 Chromium이 세 seed 입력에 같은 숫자를 낸다는 것. |
| D-70 | V2-Core-34 개인 상태와 세계 상태의 경계, 계승 (Issue #98) | **조사 기록. 새 semantics는 결정하지 않았고 엔진/저장/UI/검증기도 바꾸지 않았다**: 계약(§2.1/§7.1/§8.2/§9) → runtime(`buildActorFromTemplate`, `resolveStartCharacter`, `view`, `evaluateRelationCondition`) → 데이터팩 → 테스트 → 실제 실행(Node probe와 실제 Chromium) 순으로, 한 캐릭터가 세계를 바꾸고 죽은 뒤 후계자가 시작하는 경로의 실제 state를 대조했다. **A(이미 세계 수준으로 동작)**: `time`, `rng`, `flags`, `signals`, `facts`, `cases`, `fired`(그래서 `once`/`cooldown`도 세계 전체에 하나다), `attempts`, 그리고 양 끝이 모두 세계 개체(NPC/조직)인 relation edge(`npc_bandit_leader:org_bandits`). 이 필드들은 state 스키마(§2.1)에서 actor ID를 키로 갖지 않는 최상위 맵이고, `startCharacter`는 새 actor를 만들고 `rules.succession`을 적용할 뿐 이 필드들을 하나도 바꾸지 않는다(probe: relations/flags/cases/fired/facts/knowledge/signals/attempts/time/rng가 사망 직후와 후계자 시작 직후에 모두 같고, 사망한 actor 기록도 그대로다). **D(캐릭터 귀속이 의도)**: `state.actors[id]`(items/money/hp/growth·unlock·proficiency/location/tags — `buildActorFromTemplate`가 매번 template에서 새로 만든다), `state.knowledge[actorId]`(§8.2 "행위자별 지식"), 한쪽 끝이 `player_<n>`인 relation edge(§7.1: 방향 그래프의 엔티티 ID이고 §9는 "NPC는 죽은 캐릭터와의 관계를 계속 기억한다"고 한다 — 기억되는 대상은 그 캐릭터다). 후계자의 `view()`는 `state.player.actorId` 기준이라 knowledge와 relations가 비어 보이고, 옛 edge는 `state.relations`에 그대로 남아 있지만 `self`가 새 ID로 해석되므로 조건으로는 닿지 않는다. **save/load와 succession의 차이**: 저장/불러오기는 state 전체를 바이트 단위로 보존하고(state가 권위, D-68), succession은 아무것도 지우지 않되 개인 귀속 부분이 후계자에게 닿지 않게 된다. **B(기존 contract로 최소 구현)**: 세계 상태만 읽는 선택지 `opt_ask_bandit_news`(`case_ruins_mystery`가 resolved이고 두목이 더 이상 `org_bandits`의 `member`가 아님 — 어느 쪽도 끝에 캐릭터가 없다). probe에서 이 쌍은 "뒷받침한 대면 뒤 원로에게 처분을 맡김" 한 이력에서만 참이고(player/world 문맥 모두) 나머지 이력(새 게임/조사만/뒷받침 없는 대면/뒷받침했으나 미결정)에서는 거짓이다. 후계자에게도 행동한 캐릭터에게도 제안되며, 효과는 묻는 사람 자신의 edge에만 닿고 세계 필드는 바뀌지 않는다. V2-Core-33의 `evt_market_reopens`(개인 `cowed` edge를 읽음)는 그대로다. **C(설계 결정 필요, 구현하지 않음)**: (1) 후계자가 무엇을 물려받는가(아이템/관계/지식/성장) — §9가 "아직 결정되지 않았다"고 직접 말하고 기본값은 빈 `rules.succession`이며 이 팩은 `money +3`만 쓴다. (2) 세계 수준 flag가 개인의 정보 관문으로 쓰이는 점 — `opt_report_findings`(V2-Core-31)와 `act_confront_leader`(V2-Core-22)가 `ruins_secret_confirmed`(flag는 세계 수준)를 읽으므로, 후계자는 조사를 한 번도 하지 않고 보고 선택지를 고를 수 있고(probe: 수락되어 `confidant` 태그가 생김) 관찰 4번으로 얻는 `unl_keen_eye`와 함께 대면 행동에 닿는다; "확인된 정보"가 개인의 것인가 역사의 것인가는 설계 결정이다(개인 표식의 후보: `data.rules.rumor`의 증감폭과 `minConfidence`, 또는 캐릭터에 묶인 relation 태그). (3) 세계 수준 보상의 수혜자 — 시장 event가 같은 세계 쌍을 읽게 하면 후계자가 받는다(probe: +3). 그러나 `once`는 세계 전체에 하나라 행동한 캐릭터가 먼저 받았다면 후계자는 받지 못하고(probe), 보상이 캐릭터를 따라야 하는지 세계를 따라야 하는지는 정해지지 않았으므로 바꾸지 않았다. (4) 죽은 캐릭터를 끝으로 하는 edge와 knowledge는 쌓이기만 한다 — 정리/감쇠는 relation rule(미결정)과 묶여 있다. 이번에도 `facts[*].initial`, relation rule, `completeWhen`, D-09, D-67은 결정하지 않았다 **후속(V2-Core-35, 이슈 #100)**: C의 (2)를 기존 contract로 결정해 해소했다. 소유 관계부터 확인했다 — §4.1은 `flag`를 "세계 단위(subject를 쓰지 않는다)"로 정의하고 §3.3은 행동/선택지 `requires`가 같은 평가기(contextKind는 `fact`만 제한)를 쓴다고 하므로, 세계 flag를 개인 관문으로 읽은 것은 엔진이나 계약의 위반이 아니라 **팩 콘텐츠의 불일치**였다(계약이 이미 결정하는 문제). 현상은 그대로 재현됐다: 현재 팩에서 조사한 적 없는 후계자가 보고 선택지를 고르면 수락되어 `confidant` 태그가 생기고, 관찰 4번의 `unl_keen_eye`로 대면 행동도 수행됐다. 수정은 두 관문(`opt_report_findings`, `act_confront_leader`)이 세계 flag 대신 그 캐릭터 자신의 증표 `item_relic`(`item` Condition)을 요구하게 한 것이다 — 성공한 조사만 이 아이템을 조사한 캐릭터 자신의 인벤토리에 쓰고(실패/`partial` 등급은 쓰지 않는다), 후계자는 새로 만들어져 갖지 않으며, 새 state·새 수치·새 op가 없다. flag는 여전히 쓰이며 세계의 기록으로 남는다(후계자가 읽을 수 있다). **기각한 후보**: 소문의 confidence(`data.rules.rumor.newSourceGain` + `minConfidence`) — 새 캐릭터에게는 통하지만(probe: 60→80) 이 변경 이전에 만든 save는 조사 뒤 이미 confidence 60에 관찰 출처가 기록돼 있어 다시 조사해 성공해도 같은 출처라 오르지 않아 **영영 보고/대면에 닿지 못하고**(probe: 재조사 성공 뒤에도 거부), 구제용 `sameSourceGain`은 원로에게 두 번 묻는 것만으로 80에 닿게 해 조사 없이 통과시킨다(probe). 증표는 옛 save에도 이미 들어 있어 아무도 갇히지 않는다(D-68 확인: 호환/유효, 조사한 옛 save는 그대로 보고/대면). 소문 confidence가 조사한 사람과 원로에게만 물은 사람을 구별하지 못한다는 것도 테스트로 단정했다. **C로 남은 것**: (1) 후계자가 물려받는 범위 (3) 세계 수준 보상의 수혜자(시장 event는 그대로) (4) 죽은 캐릭터의 edge/knowledge 누적. 증표가 나중에 소비/거래될 수 있게 되면 이 관문이 다시 흔들리므로 그때 개인 표식을 다시 정한다. `facts[*].initial`, relation rule, `completeWhen`, D-09, D-67은 결정하지 않았다 **후속(V2-Core-36, 이슈 #102)**: C의 (1)(3)(4)를 실제 state로 다시 대조했다 — 결정하지 않았고 선택지와 영향을 D-71에 기록했다. |
| D-71 | V2-Core-36 후계자 inheritance semantics와 세계 보상 귀속 (Issue #102) | **조사 기록. 엔진/저장/UI/검증기/팩 콘텐츠는 바꾸지 않았고 새 semantics는 결정하지 않았다**: 계약(§3.3/§7.1/§8.2/§9, D-47/D-51/D-70) → runtime(`buildActorFromTemplate`, `resolveStartCharacter`, `runTriggerStage`, `view`) → 팩 → 테스트 → 실제 실행(Node probe, 실제 Chromium + IndexedDB) 순으로, A가 조사·보고·대면·처분을 하고 죽은 뒤 B가 시작하는 경로의 실제 state를 필드별로 대조했다. **분류**: *World(succession이 하나도 바꾸지 않는다, A)* — `time`, `rng`, `flags`, `signals`, `facts`, `cases`, `fired`(`once`/`cooldown`은 세계 전체에 하나), `attempts`, 양 끝이 세계 개체인 edge(`npc_bandit_leader:org_bandits`), 죽은 actor의 기록. *Personal(캐릭터 귀속이 계약, D)* — `state.actors[id]`의 items(`item_relic` 포함)/money/hp·alive/growth·unlock·proficiency/location/tags, `state.knowledge[actorId]`, 한쪽 끝이 `player_<n>`인 edge(NPC edge `npc_elder:player_n`, 조직 edge `org_bandits:player_n`의 `cowed`). *Inherited(전 캐릭터에게서 후계자로 넘어간 것)* — **없음**. 후계자의 actor는 template + 고정 `money +3`(8 → 11)이고 `rules.succession`은 `ctx.targetId`를 읽지 않는다(테스트: 아무 일도 하지 않고 죽은 전 캐릭터와 모든 것을 한 전 캐릭터가 같은 후계자 actor를 낳는다). *Undecided* — 아래 C. **시장 보상(`evt_market_reopens`, +3)의 실제 귀속**: 조건은 *현재 플레이어 자신의* `org_bandits:<self>` `cowed` edge와 세계 edge(두목이 더 이상 `member`가 아님)이고 `once`는 세계 전체의 `state.fired`다. (V1) A가 받고 죽으면 B는 자기 edge가 없어 못 받고 A의 `fired`는 그대로다. (V2) A가 받기 전에 죽으면 보상은 미수령으로 남는다 — 죽은 A는 `pending_new_character`로 받을 수 없고 B는 자기 edge가 없으면 못 받으며 `fired`도 남지 않는다. (V3) B가 자기 증표→보고→대면→처분으로 자기 edge를 만들면 B가 받는다(A는 받지 못한다). (V3c) A가 먼저 받았다면 B는 자기 edge가 있어도 받지 못한다(`once`가 세계 전체). (V4) save→load와 JSON round-trip 뒤의 방문은 직접 이어 한 것과 byte 단위로 같고 같은 입력은 같은 결과다. **관찰(구현을 바꾸지 않음)**: (a) B의 성공한 조사는 A가 지운 `npc_bandit_leader:org_bandits`의 `member`를 다시 붙인다(V2-Core-32/34에 이미 기록된 성질) — 그러면 `opt_ask_bandit_news`는 모두에게 다시 닫히고 B가 다시 처분해야 한다. 개인 행동이 세계 edge를 되돌리는 것은 계약 위반이 아니라 콘텐츠가 쓴 것이다. (b) `wait` 중 사망한 step은 `action.resolved`로 끝나지 않는다 — `wait`는 애초에 `action.resolved`를 내지 않는 경로(V2-Core-01 계약)이고 사망과 무관하다; §9에 명확화 노트만 더했다. (c) `rules.succession`은 데이터만으로 고정 지급(아이템/돈), 조건부 지급(`if` + `subject:"target"` Condition), `rumor` 지식 복사까지 표현할 수 있고 `validateData`도 모두 통과한다(variant 팩 probe, 채택하지 않음) — 그러나 고정 아이템 지급은 V2-Core-35가 막은 증표 누수를 다시 연다(후계자가 조사 없이 `item_relic`을 받는다); 수량이나 edge 점수를 *복사*하는 op는 없다. 즉 엔진이 막아 주지 않으므로 어떤 계승도 "쓸 수 있는" 상태에서 무엇을 쓸지가 정해지지 않은 것이 C의 핵심이다. (d) 죽은 캐릭터 기록은 지워지지 않고 쌓인다(캐릭터 1명당 player 앵커 edge 몇 개와 knowledge 소유자 1개, 약 550 byte의 JSON). **분류 요약**: A(기존 contract가 결정, 테스트로 고정) — 위 World 전부, 보상 귀속의 현재 동작(V1~V4), 후계자는 전 캐릭터의 것을 받지 않음(기본값 빈 규칙 + 이 팩의 고정 지급), `wait` 사망 step의 event. B(기존 semantics로 구현 가능, 설계 불필요) — **없음**: 작은 불일치가 없어 코드/콘텐츠를 바꾸지 않았다. D(캐릭터 귀속이 의도) — 위 Personal 전부(`knowledge`/relation edge를 후계자가 자동으로 받지 않는다는 V2-Core-35의 원칙 유지). **C(설계 결정 필요, 구현하지 않음)**: (1) 후계자가 받을 범위(아이템/돈/HP/성장/지식/관계) — 선택지: 계속 없음(빈 규칙+고정 지급) / 고정 지급 확대 / 조건부 지급(`if`+`subject:"target"`) / 지식 일부 복사 / 새 op로 수량·edge 복사. 영향: canonical 플레이(고정 지급은 무료 증표·돈으로 조사/대면 난이도를 바꿈, 지식 복사는 V2-Core-35의 "후계자는 자기 증표를 얻는다"와 충돌), save 호환(팩 `version`/데이터 변경만이면 state 모양은 같아 옛 save 호환; 새 op는 데이터 호환성 D-68 대상), replay(결정론 유지, 다만 기존 replay의 결과가 달라진다). (2) 세계 보상의 귀속 — 선택지: 현재(현재 플레이어 자신의 edge, 이 경우 죽은 캐릭터의 미수령 보상은 영원히 미수령) / 세계 조건으로 읽기(후계자가 받되 먼저 받은 쪽이 있으면 못 받음 — V2-Core-34 probe) / `once`를 캐릭터별로(자기 edge를 가진 캐릭터마다 한 번) / 죽을 때 미수령 보상을 이관하는 효과. 영향: canonical(보상이 전 캐릭터를 따라가는 체감이 바뀜), save(`fired` 키 형식이 바뀌면 옛 save의 `fired`와 충돌하므로 D-68 대상), replay(`fired`의 단위가 바뀌면 같은 입력의 결과가 달라짐). (3) 세계 edge의 가역성 — 선택지: 현재(개인 행동이 세계 edge를 되돌릴 수 있음) / 조사 성공 outcome이 이미 처분된 세계에서 `member`를 다시 붙이지 않게 함(`if` + `case` Condition으로 데이터만으로 가능) / 영구 결과를 별도로 기록. 영향: canonical("다시 조사해서 조직을 되살리는" 플레이가 사라짐), save 호환 없음(데이터만), replay 변경. (4) 죽은 캐릭터 기록의 누적 — 정리/감쇠는 relation rule(D-59, 미결정)과 묶여 있고 지금은 크기만 늘 뿐 동작에는 영향이 없다. **보류 이유**: 네 항목 모두 canonical 콘텐츠가 실제로 요구하는 지점이 없다(첫 계승 이후의 긴 플레이가 아직 없다); 어느 쪽을 골라도 기존 save/replay의 결과가 달라지거나(데이터/`fired` 키) 다른 미결정(D-59 relation rule, D-09)과 묶이며; 추측을 계약으로 올리지 않는다. 이번에도 `facts[*].initial`, relation rule, `completeWhen`, D-09, D-67은 결정하지 않았다. 팩 `version`은 `0.1.0` 그대로다(state 모양 변화 없음, D-68). **후속(V2-Core-37, D-72)**: C의 (4) 죽은 캐릭터 edge의 누적은 relation rule의 "대상" 결정(rule이 죽은 캐릭터 edge에도 적용되는가)과 같은 질문이라 D-72의 relation rule C와 함께 다룬다. (1)~(3)은 이번에도 결정하지 않았다. **후속(V2-Core-39, D-74)**: relation rule을 활성화하지 않기로 했으므로 C의 (4) 죽은 캐릭터 edge의 정리/감쇠를 할 수단은 여전히 없다 — event는 여러 edge를 한꺼번에 다룰 수 없다. 여러 edge에 걸친 관계 규칙이 필요해질 때(D-74의 다시 열 조건) 함께 결정한다. **결정·구현 (3) 세계 edge의 가역성 (V2-Core-44, Issue #120, 인간 결정)**: 처분된 세계 edge는 캐릭터의 이후 행동으로 되돌아가지 않는다 — `act_investigate_ruins` success의 `member` 태그 Effect를 `if`(`case_ruins_mystery`가 `resolved`가 아닐 때만)로 감쌌다(같은 위치, 이전 경로의 이벤트 동일). 해산은 case가 resolved된 뒤에만 가능하므로 해산 뒤의 재조사(같은 캐릭터든 후계자든)는 membership을 다시 쓰지 않고, `opt_ask_bandit_news`는 계속 제안되며 해산은 다시 고를 수 없다. 데이터만 바꿨다: 엔진·state 필드·save migration 없음, 이미 되살아난 save는 고치지 않음, 팩 `version`은 `0.1.0` 그대로(D-68). (1) 계승 범위(아무것도 상속하지 않음)와 (2) 세계 보상의 귀속(현재 캐릭터 자신의 edge)은 인간 결정으로 현재 상태를 유지한다 — 그 결과 V3 시나리오에서 후계자는 자기 증표→보고→대면만으로 자기 `cowed` edge를 얻고(두 번째 처분 없음) 시장이 그 후계자에게 지급한다. 테스트: `tests/v2/data-world-history.test.js`, `tests/v2-ui-world-history-browser.spec.js`(실제 IndexedDB 저장→새로고침→불러오기→재조사); 이 결정 전 동작을 고정하던 `testRewardRecipient`(V3)와 `tests/v2-ui-succession-browser.spec.js`의 후계자 시나리오는 결정된 동작으로 바꿨다. |
| D-72 | V2-Core-37 미결 core semantics 재조사 (Issue #104) — `completeWhen` / relation rule `when` / `facts[*].initial` | **조사 기록. 엔진/저장/UI/검증기/팩 콘텐츠는 바꾸지 않았고 새 semantics는 결정하지 않았다**: 계약(§2.5/§2.7/§3.3/§4.2/§7.3/§8.1, D-51/D-59/D-61/D-62/D-65/D-69) → validator(`validateData`) → runtime 소비 코드(`createInitialState`/`step`/`rules.js`의 읽기 지점) → 팩(`world.js`) → 테스트 → 실제 실행(Node probe, 실제 Chromium + IndexedDB) 순으로 세 항목을 세부 질문별로 A(기존 contract가 결정)/B(기존 semantics 조합으로 가능)/C(새 설계 결정 필요)/D(의도적 미구현)로 나눴다. **공통 사실**: 세 필드를 읽는 코드는 `validateData`뿐이고 실제 팩은 셋 모두 쓰지 않는다(`data.cases`/`rules.relation` 없음, `facts.fact_ruins_secret.initial:"unknown"`은 어떤 Condition도 읽지 않는 문서용이다). 실제 팩에서 case는 `act_confront_leader` success의 `case` Effect로만, 관계는 `relation` Effect로만, fact는 `act_investigate_ruins` success의 `fact` Effect로만 움직인다. 기존 event 파이프라인이 "조건이 참이면 case/관계를 바꾼다"를 이미 표현한다 — `data.events`의 trigger + `case`/`relation` Effect가 매 step 10단계(§2.5, D-51)에서 id 오름차순으로 한 번 평가된다. **(1) `completeWhen`** — **A**: 스키마(Condition 하나, optional, world 문맥, D-61). validator가 검사하는 것은 그것뿐이고 stage의 `id`/중복/전이 대상/추가 필드, `stages`가 객체인 경우, `cases` 항목이 객체가 아닌 경우는 보고 없이 무시한다. `case` Effect/Condition은 `data.cases`와 대조하지 않는다 — 정의에 없는 case/stage도 수락되고 stage가 뒤로 가도 되며 같은 stage 재설정은 변화가 없어 event도 없다(D-30). `state.cases[id]={stage,since}`(§2.1). **B**: "조건 → stage 전이"는 `data.events` trigger + `case` Effect로 지금 된다. 평가 시점은 모든 step 종류 뒤의 10단계(action/choice/move/wait/startCharacter, day 경계는 9단계가 `day.started`만 내고 trigger는 같은 step의 10단계); 참이 되면 `case.updated`; 같은 step의 연쇄 전이는 앞 id의 효과를 뒤 id가 같은 패스에서 즉시 보므로 s1→s2→s3이 한 step에 끝나고, id 역순이면 다음 step에 끝난다(§2.5의 연쇄 1단계 제한); 여러 case는 event id 순서로 각각 전이하고 `once`로 한 번만 일어난다; save/load 뒤 같은 다음 step은 같은 결과다(probe·Node 테스트·Chromium 모두). **C**: 전용 `completeWhen` 실행 — 첫 결정은 전용 경로가 필요한가 자체다(event와 같은 일을 하는 두 번째 경로가 생긴다). 필요하다면: 평가 시점(10단계 안 vs 별도 case 단계), 참일 때 "다음 stage"가 무엇인지(`stages` 배열 순서인가 id인가 — `stages`의 나머지 구조가 없다), case 전체의 완료를 무엇으로 표현하는지(`resolved`는 팩의 관례일 뿐 어휘가 없다), 연쇄 허용 여부와 한 step 안의 반복 제한, 여러 case가 동시에 완료될 때 순서(`data.cases` key 정렬 vs event id), 발생 이벤트(기존 `case.updated`인지), stage 전이에 effect/choice를 붙일지(event와 겹친다), 정의에 없는 stage 이름의 처리(지금은 무대조). **D**: 미소비 자체는 버그가 아니다 — D-61이 "실행 semantics는 정하지 않는다"고 명시했다. **(2) relation rule `when`** — **A**: 스키마(Condition 하나, optional, world 문맥, D-62). validator는 그것만 검사하고 rule의 `effects`/cadence/priority 같은 추가 필드는 무시하며 `rules.relation`이 객체가 아니거나 rule 항목이 객체가 아니면 건너뛴다(`rules.relationModifier`는 check modifier(§5.4)로 이 필드와 무관하다). score/mode/tag/counter/lastDay를 어떻게 바꾸는지는 `relation` Effect(§7.3)가 이미 정한다: `add`는 clamp, `mode`는 지정할 때마다 해당 카운터 +1, `tag`/`untag`, 실제 변화가 있을 때만 `lastDay`와 이벤트 1개. **B**: 규칙은 event로 표현된다 — cadence는 매 step 10단계(once/cooldown이 없으면 조건이 참인 동안 매 step), 우선순위는 id 오름차순(뒤가 앞의 효과를 즉시 본다), 반복 제한은 `once`/`cooldown`(분 단위), Condition 문맥은 world이지만 Effect의 `self`는 현재 플레이어 캐릭터다(probe: `npc_a:player_1`에만 edge가 생김). 주의할 기존 성질: 매 step 적용하는 `mode: "cooperation"`은 적용마다 카운터가 오르므로 4 step 뒤 `cooperationCount`가 4다(probe) — per-step cadence는 카운터를 부풀린다. **C**: 전용 rule 실행 — rule의 effect 스키마(기존 Effect 목록 재사용인지 별도 필드인지, 재사용한다면 `self`가 world 문맥에서 누구인지), 평가 cadence(매 step / 매 day 경계 — day 경계 전용 trigger가 없고 `cooldown:1440`은 경계와 정렬되지 않는다 / 대상 relation 변화 시 — 불동점 반복은 연쇄 1단계 제한과 충돌), 읽는 context(actor가 없는 world 문맥에서 `self` 기준 `relation` Condition은 오류 없이 `false`다(probe) — 여러 캐릭터, 죽은 캐릭터, NPC↔NPC 중 누구에게 적용할지), 동시에 참일 때 순서와 충돌(`rules.relation` key 정렬 vs event id), 한 번 적용인지 지속 조건인지, event와의 관계(중복 경로), 잘못된 rule의 처리(지금은 추가 필드를 조용히 무시). 죽은 캐릭터 edge에 적용되는지는 D-71의 C(4)와 같은 질문이다. **D**: 미소비는 계약 기본값(D-62가 effect/cadence/priority를 정하지 않음)과 일치한다. **(3) `facts[*].initial`** — **A**: 시점은 `createInitialState`, 스트림 라벨은 `fact:<id>`, local cursor 0, cursor를 state에 저장하지 않음, 이미 초기화된 대상은 다시 하지 않음(§2.7/§8.1); `deriveSeed`가 (seed, label)의 순수 함수라(probe) 라벨 사이는 독립이고 fact를 더해도 다른 fact의 값은 바뀌지 않는다; `state.facts[id]={value,since}`는 `fact` Effect가 lazy 생성·덮어쓴다; fact는 view에 없다. 고정값과 `pickFrom`의 차이: 고정값은 RNG가 필요 없어 seed 결정과 독립이다. **C**: (a) seed 입력 — §2.7 공식은 숫자 seed를 전제하지만 state는 문자열 `worldSeed`와 그 hash `rng.seed`(uint32)를 가진다. 재검증: 같은 게임에서 문자열 `worldSeed`/`rng.seed`/숫자가 서로 다른 파생 seed를 만들고(`seed-1`: 1966658722 vs 1567532526), 숫자 `255`와 문자열 `"255"`도 다른 스트림이며(157932535 vs 3910629045), 200개 seed 중 143개에서 두 관례의 `pickFrom`(3) 선택이 달랐다(샘플 집합에 따라 달라지는 수치 — D-69의 124는 다른 샘플). 같은 입력은 Node와 Chromium에서 같은 숫자를 낸다. 사실만 적으면: `rng.seed`는 `toString(16)` 공식과 정확히 맞고 이미 state에 있으며, 문자열은 기수 인자가 무시되는 입력이다 — 어느 쪽을 고를지는 결정이고 첫 선택이 사실상 영구적이다(라벨 규칙: 기존 라벨의 소비를 바꾸면 호환을 깬다). (b) `pickFrom`의 인덱스 공식과 예약 키(`pickFrom`을 가진 리터럴 객체와의 구분), (c) 생성 시 이벤트 유무(지금 `createInitialState`의 events는 `[]`)와 `since`(값을 설정한 minute이므로 생성 시점 0이 자연스러우나 계약에 없다), (d) validator 정책 — 지금은 어떤 `initial` 모양도 통과한다(빈 `pickFrom`, 배열이 아닌 `pickFrom`, 다른 키가 섞인 객체, `null`, 생략 포함), (e) 첫 접근 시 생성은 `evaluateCondition`이 순수 읽기라 저장 없이 (seed, label)에서 계산해야 하므로 "설정된 fact"와 "기본값"의 구분이 생긴다 — 선택지로만 기록한다, (f) 고정값만 먼저 구현하면 `pickFrom`이 조용히 시딩되지 않는 함정이 남는다. **save/load/replay·호환**: 저장은 state 전체이므로 시딩 구현 이전에 만든 save에는 `facts`가 없고 구현 이후 같은 (seed, data)의 새 게임에는 있다 — 같은 `initial`을 선언한 팩에서 옛 save와 새 게임의 `fact` Condition이 달라지며(옛 save는 영원히 미시딩) 이는 D-68 (a)의 version 범위/data migration 결정과 묶인다; 같은 (worldSeed, data, actions)의 replay는 구현 전후로 `state.facts`가 생겨 결과가 달라진다. 실제 팩의 `initial:"unknown"`은 읽는 Condition이 없어 동작은 그대로지만 새 게임 state에 `facts.fact_ruins_secret` 키가 생겨 JSON 모양이 바뀐다(조사 성공의 `fact` Effect가 덮어쓴다). `completeWhen`/relation rule은 state 모양을 바꾸지 않지만 같은 `(state, action)`의 결과가 data에 따라 달라지므로 활성화는 기존 팩의 동작 변경이다(D-68). **판정 요약**: A 세 필드의 스키마와 validator 범위, `case`/`relation`/`fact` Effect의 의미, event 파이프라인의 cadence·순서·연쇄 제한, `facts`의 시점/라벨/idempotence. B 조건부 case 전이·관계 변화는 지금 `data.events`로 표현 가능(구현할 것 없음). C 전용 `completeWhen` 실행, 전용 relation rule 실행, `facts[*].initial` 시딩(seed 입력 포함). D 미소비 자체(버그 아님). 구현은 없다. **후속 분리 권고(결합도)**: `completeWhen`과 relation rule은 "event와 별도의 전용 경로를 둘 것인가"와 cadence/순서/연쇄 제한을 공유하므로 그 전제를 한 번에 결정하되 구현은 각각 독립 가능하다; `facts[*].initial`은 seed 입력과 호환 문제라 독립이다; D-67(view 경계)과 D-68(version 범위/migration)은 각각 별도다. 세 항목을 한 번에 구현하지 않는다. 이번에도 D-09/D-67은 결정하지 않았다. 팩 `version`은 `0.1.0` 그대로다(state 모양 변화 없음, D-68). **후속(V2-Core-38, D-73)**: (1) `completeWhen`의 첫 결정("event와 별도의 전용 경로를 둘 것인가")을 결정했다 — 두지 않는다. relation rule `when`과 `facts[*].initial`은 결정하지 않았다. **후속(V2-Core-39, D-74)**: (2) relation rule `when`의 첫 결정("event와 별도의 전용 경로를 둘 것인가")을 결정했다 — 두지 않는다. 남은 C는 `facts[*].initial`이다. **후속(V2-Core-43, D-76)**: (3) `facts[*].initial`도 결정·구현했다 — seed 입력 C1, 생성 이벤트 없음, validator가 쓸 수 없는 `pickFrom`을 보고. 이 행의 C는 모두 닫혔다. |
| D-73 | V2-Core-38 case completion semantics 결정 (Issue #106) — `data.cases[*].stages[*].completeWhen` | **결정: 활성화하지 않는다(D). 엔진/저장/UI/검증기/팩 콘텐츠는 바꾸지 않았다.** `completeWhen`은 D-61이 정한 모양(Condition 하나, optional, world 문맥)만 검사하는 **예약 필드**로 유지하고 실행 의미를 주지 않는다. "조건이 참이 되면 case를 옮긴다"는 `data.events`의 trigger + `case` Effect로 쓴다 — 새 Condition/Effect op, state, scheduler가 필요 없다. **비교(`completeWhen` vs `data.events` trigger + `case` Effect)**: 기존 event만으로 충분한가 — 예. event는 엄밀히 더 표현력이 크다: (1) 전이와 함께 임의의 Effect(돈/관계/서술/fact/flag…)를 적용한다, (2) `check`/`outcomes`를 가질 수 있어 gameplay 스트림을 쓰고 결과에 따라 다른 stage로 보낸다, (3) `once`/`cooldown`, (4) 임의의 대상 stage와 한 event에서 여러 case 변경(probe·Node 테스트·Chromium). Condition 하나인 `completeWhen`은 "다음 stage"가 무엇인지(`stages`의 구조가 없다), 전이 Effect, case 완료의 어휘를 위해 새 필드가 필요하고 그 필드는 event와 같은 것을 중복한다. 전용 evaluator는 (a) 고정점까지 반복하면 §2.5의 연쇄 1단계 제한(D-51)과 충돌하고 (b) 한 번만 돌면 event 패스와 별개의 순서 규칙(두 메커니즘의 상대 순서)을 만든다. 실제 콘텐츠 수요도 없다 — 실제 팩은 `data.cases` 없이 `case` Effect만 쓴다. 새 전용 case engine은 필요하지 않다(YAGNI). **결정한 세부**: **평가 시점** — `completeWhen` 자체는 평가되지 않는다. event 경로의 cadence는 §2.5 10단계다: 수락된 모든 step 종류(`perform`/`move`/`choose`/`wait`/`startCharacter`) 뒤에 한 번, id 오름차순. pending gate에서 거절된 action은 step이 아니라 평가되지 않고, `startCharacter`는 수락된 step이라 평가된다(Node 테스트). **전이 의미** — 자동 전이는 없다. 전이는 event의 `case` Effect가 하고, 대상 stage 이름은 자유이며(`data.cases`와 대조하지 않고 뒤로도 갈 수 있다) 같은 stage 재설정은 변화가 없어 이벤트도 없다(D-30). **동일 step** — 한 패스에서 앞 id의 효과를 뒤 id가 즉시 보므로 완료 event의 id가 진입 event의 id보다 뒤면 연쇄가 한 step에 끝나고, 앞이면 다음 수락된 step에 끝난다(고정점 반복 없음, §2.5). 여러 case는 case id가 아니라 event id 순서로 전이한다. **`once`/cooldown과의 관계** — 기존 semantics 그대로다: trigger가 떠나는 stage를 `case` Condition으로 가드하면 `once`가 필요 없고(그 stage에 머무는 동안 다시 발동하지 않는다) case가 그 stage로 재진입하면 다시 발동한다. **결정론/persistence** — `state.cases`와 `state.fired`(기존 필드)뿐이고 추가 state나 migration이 없다; save/load 뒤 같은 다음 step은 같은 결과이고 같은 입력은 같은 결과다(Node 테스트, 페이지 새로고침을 사이에 둔 실제 IndexedDB 불러오기). **저작자 주의(기존 성질, 새 규칙 아님)**: (a) 가드 없는 진입 event(`once`도 stage 조건도 없음)는 매 step stage를 되돌려 뒤의 완료를 지운다(테스트); (b) event의 Condition은 world 문맥이지만 `self`는 현재 플레이어라 세계 수준 case가 캐릭터 수준 Condition으로 완료될 수 있다(D-70) — 세계 수준 case는 세계 Condition으로 쓴다; (c) stage 이름은 어디에서도 검증되지 않는다. **영향**: canonical 플레이 없음, save 호환 없음(state 모양과 팩 `version` 그대로, D-68), replay 없음(구현 변화가 없다). **다시 열 조건(추측이 아니라 결정의 전제)**: 저작 비용이 실제로 문제가 되는 콘텐츠가 생기거나 `stages`의 나머지 구조(순서, 완료 어휘)를 정해야 하는 요구가 생기면 그때 새 D-decision으로 연다 — 그 전에는 validator의 stage 이름 대조 같은 도구 쪽 결정이 먼저다. relation rule `when`(D-62)과 `facts[*].initial`(D-65)은 이번에도 결정하지 않았다. |
| D-74 | V2-Core-39 relation rule semantics 결정 (Issue #108) — `data.rules.relation.*.when` | **결정: 활성화하지 않는다(D). 엔진/저장/UI/검증기/팩 콘텐츠는 바꾸지 않았다.** `rules.relation`은 D-62가 정한 모양(ruleId를 키로 하는 객체, 각 rule의 `when`은 Condition 하나, optional, world 문맥)만 검사하는 **예약 필드**로 유지하고 실행 의미를 주지 않는다. 관계는 `relation` Effect(행동/선택지/`data.events`/`rules.succession`)로만 바뀌고, "조건이 참이면 관계를 바꾼다"는 `data.events`의 trigger + `relation` Effect로 쓴다 — 새 scheduler/subsystem/state/op가 필요 없다(D-73과 같은 결론). **계약이 정한 것과 정하지 않은 것**: 계약에는 `when` 하나뿐이고(§3.3, §11, D-62) rule의 effect·cadence·우선순위·반복·대상 필드가 없다(D-59). 소비 코드는 `validateData`뿐이다 — `when`의 모양과 handler만 검사하고 rule 키 형식(D-56의 ID 형식 범위 밖), 추가 필드, 객체가 아닌 항목, `rules` 아래의 오타 키는 검사하지 않는다(rule에 `effects`를 써도 조용히 무시된다). **실제 수요(증거)**: (a) 실제 팩은 `rules.relation`을 쓰지 않는다. 관계 쓰기 11곳은 모두 행동/선택지 outcome의 명시적 `relation` Effect이고 관계 읽기 6곳 중 event는 `evt_market_reopens`의 trigger 하나뿐이다(event는 관계를 쓰지 않는다). 지금 콘텐츠는 오히려 관계가 시간이 지나도 변하지 않는 것에 기댄다 — `cowed` edge가 나중 시장 방문까지 남아야 보상이 나온다(V2-Core-33, 2040분 뒤에도 바이트 단위로 같음). 암묵적 감쇠 규칙은 이 설계를 깨뜨린다. (b) 시간 경과에 따른 감쇠·이동, 반복 조정, 사건 뒤 지연 변화의 요구는 현재 콘텐츠에 없다(무료·반복 원로 대화의 점수 누적은 콘텐츠 쪽 문제로 이미 기록돼 있고 태그를 읽어 우회한다). (c) V1의 관계 규칙(`web/core/npc-relations.js`)은 **이름이 정해진 NPC↔NPC edge 5개** 각각에 대해 하루 한 번(edge별 `lastDay` 가드), 세계 수치 조건에 따라 협력(+5, mode, 카운터)/갈등(−7, 3일에 한 번 부수효과)/중립(점수를 0에서 1씩 멀어지게) 중 하나를 적용한다 — 여러 edge를 일괄로 다루는 규칙이 아니다. **event로 충분한가(probe, Node 테스트, 실제 Chromium이 같은 결과)** — **A(기존 계약으로 완전히 표현)**: 이름이 정해진 edge의 조건부 변화(`self`는 현재 플레이어, 리터럴 id로 NPC↔NPC·NPC↔조직 세계 edge); 변화 방식(§7.3/D-43: `add`는 clamp, `mode`는 적용마다 카운터 +1, `tag`/`untag`, 실제 변화가 있을 때만 `lastDay`와 이벤트 하나); cadence(수락된 모든 step의 10단계 — once/cooldown이 없으면 조건이 참인 동안 매 step, 분 수와 무관); 순서(event id 오름차순, 앞 id의 효과를 뒤 id가 같은 패스에서 본다, 역순이면 다음 step — 고정점 반복 없음); 한 event 안의 여러 edge 변경(적힌 순서대로); 반복(`once`, `cooldown`(분), 조건이 거짓이 됐다가 다시 참이 되면 `once` 없는 event는 다시 발동); 관계 변화 직후의 반응(trigger의 `relation` Condition이나 score selector, 같은 step이며 id 순서 조건); 후계자 이후 `self`는 새 캐릭터이고 이전 캐릭터의 edge는 그대로 남는다(D-70); persistence/replay(`state.relations`/`fired`/`signals` 기존 필드뿐, save/load 뒤 같은 다음 step은 같은 결과). **A(기존 op만 쓰는 저작 패턴)**: V1 규칙 모양 그대로 — `day` selector와 edge별 `signal` 카운터를 비교하는 trigger(`gt({day:true}, {signal:"rel_day_ab"})`) + 효과에서 카운터 +1이면 **달력 하루에 정확히 한 번, 그날의 첫 수락 step에** 적용되고, 같은 카운터를 공유하는 두 event(협력/갈등)는 그날 하나만 발동한다(뒤 event가 같은 패스에서 갱신된 카운터를 본다). V1과의 차이: 한 step이 날짜 경계를 둘 이상 넘으면(`wait`는 최대 1440분이라 넘지 못하고, 1440분이 넘는 `minutes`의 행동/이동만 가능) 다음 수락 step에 한 번 더 발동해 따라잡는다(V1은 따라잡지 않는다). 더 단순한 근사 `cooldown: 1440`은 첫 발동의 시각에 고정되어 매일 같은 시각에 최대 한 번이다(날짜 경계 정렬이 아니다). `MAX_SIGNAL`은 `Number.MAX_SAFE_INTEGER`라 카운터는 포화되지 않는다(1100일 probe). 지연 변화("원인 N분 뒤"): 후속 event의 첫 발동은 자기 cooldown 시계만 시작하고(`if` + 카운터로 효과를 막음) 다음 발동이 변화를 적용한다(2880분, 테스트). **B(별도 규칙이 필요해 설계 판단이 필요한 것)**: 없음. **C(event로 표현할 수 없는 실제 요구)**: 확인된 것 없음 — event로 표현할 수 없는 것은 **여러 edge에 걸친 규칙**(모든 edge의 감쇠, 조직원 전체로의 전파, 죽은 캐릭터 edge의 정리 — Condition/Effect에 반복 구성이 없고 `relation` Effect는 edge 하나를 가리킨다)과 event 안에서 "이전 캐릭터"를 가리키는 것(event 문맥에 `target`이 없다)뿐인데, 현재 팩에도 V1 선례에도 그 수요가 없다. **저작 주의(기존 동작, 새 규칙 아님)**: (1) event 안의 `relation` Effect는 `from`을 명시한다 — §7.3 기본값 `from: target`은 event 문맥에서 아무것도 가리키지 않아 그 Effect가 조용히 건너뛰어진다(D-29: 오류·이벤트·validator 보고 없음, trigger는 발동한 것으로 기록된다). `to`를 생략하면 현재 플레이어다. (2) 매 step 적용되는 `mode`는 카운터를 부풀린다(D-43) — `once`/`cooldown`/하루 카운터로 가드한다. (3) 같은 step 안의 의존은 event id 순서로 정해진다. **선택지와 영향**: (i) 예약 유지(채택) — 영향 없음(엔진·state·save·replay·팩 `version` 그대로). (ii) rule을 event의 다른 문법으로 활성화 — effect 스키마, event와의 상대 순서, cadence를 새로 정해야 하고 event와 같은 일을 하는 두 번째 경로가 된다(D-73과 같은 이유로 기각). (iii) 여러 edge에 걸친 전용 관계 tick(V1처럼 엔진이 도는 일 단위 시뮬레이션) — 새 scheduler와 대상 선택 semantics, state 크기(죽은 캐릭터 edge 누적, D-71 C(4)), 기존 save의 결과 변화(같은 입력의 replay가 달라진다, D-68)를 결정해야 하는 새 subsystem이므로 수요 없이 만들지 않는다. **다시 열 조건**: 여러 edge를 한꺼번에 다뤄야 하는 콘텐츠(예: NPC 자율 관계망, 관계 감쇠, 조직 전파)나 엔진이 도는 NPC 자율 행동이 실제로 필요해질 때 — 그때는 relation rule만이 아니라 NPC 자율성/world tick 설계(새 scheduler이므로 설계 게이트 대상, 인간 결정)로 연다. D-71 C(4)도 그 결정에 묶여 계속 미결정이다. `facts[*].initial`(D-65), D-67, D-68 (a)는 결정하지 않았다. 팩 `version`은 `0.1.0` 그대로다(D-68). |
| D-75 | V2-Core-40 §13.2 golden 테스트 구현 — 고정 seed·시퀀스의 최종 state 해시, Node와 실제 Chromium (Issue #111) | **구현(테스트만, 엔진/저장/UI/검증기/팩 변경 없음)**: §13.2의 golden 행("고정 seed와 고정 시퀀스의 최종 state 해시를 기록한다. 바뀌면 실패하며, 갱신은 의도된 변경일 때만 사유와 함께 한다")은 계약이 내용을 정한 테스트였는데 지금까지 없었다. 같은 실행을 두 번 비교하는 기존 결정론 테스트는 엔진 변경이 두 실행을 똑같이 바꾸면 잡지 못한다 — 그러면 기존 save의 이어지는 진행과 replay가 조용히 달라진다(D-68은 팩 `version`만 비교한다). **정한 세부(계약의 범위 안)**: fingerprint = 키를 정렬한 JSON(값이 `undefined`인 키 제외, `localeCompare` 없는 기본 정렬 — §2.6)에 엔진의 `hashString`(FNV-1a 32bit, §2.7)을 적용한 값의 8자리 16진수다. 키를 정렬하므로 내용이 같고 키 생성 순서만 다른 리팩터는 golden을 바꾸지 않는다(변이로 확인). 기록값은 계약이 말하는 최종 state 해시(`finalStateHash`)와, 처음 어긋난 step을 알려 주는 진단용 step별 `{state, events}` fingerprint(`stepHashes`, `createInitialState` 포함 40개)다. **fixture**: `tests/v2/fixtures/golden-path.json`(§13.1과 DEVELOPMENT_RULES가 정한 fixture 위치, 추상 ID만). seed `golden-0`과 action 39개로 다음을 지난다 — check 네 등급(이름 난이도, opposed, skill·trait·item·relation·situational 수정자, `attempts`와 `retryPenalty`; `attempts`는 세계 수준이라 후계자의 재시도에도 누적된다), 이동·대기·하루 경계, choice(unlock을 요구하는 옵션 포함), `data.events`(`once`, `cooldown`, check를 굴리는 event, 같은 step 안의 id 순서 연쇄), relation/fact/rumor(학습·관찰)/case, 성장(exp 레벨 2·3과 levelRewards, proficiency 임계 unlock), 거절 4종(`no_pending_choice`/`requirements_not_met`/`pending_new_character`/`invalid_action`), 사망 → `startCharacter` + succession. 미결정 필드(`completeWhen`, `rules.relation`, `facts[*].initial`)는 넣지 않았다(예약 필드의 no-op을 golden으로 고정하지 않는다). 테스트는 fixture가 이 경로들을 계속 지나는지도 단정한다(fixture 퇴화 방지). **검증**: Node — fixture 유효성과 경로 단정, step별·최종 fingerprint, 중간(1/10/20/30/34번째 action 뒤)에서 save record → JSON → load로 끊었다 이어도 같은 최종 fingerprint. 실제 Chromium — 실제 엔진 모듈로 같은 fixture를 실행한 step별 fingerprint가 지금의 Node 값(Node golden 테스트의 `--print`를 자식 프로세스로 실행)과 기록값 모두와 같다. 이것이 §2.7의 "서버-클라이언트 결과 일치"를 처음으로 직접 검증한다: Chromium = Node ≠ 기록이면 golden 갱신이 필요한 것이고, Chromium ≠ Node이면 런타임 불일치다. 실제 IndexedDB에 저장 → 페이지 새로고침 → 불러오기 → 이어 실행해도 기록된 최종 fingerprint다. 변이: 주사위 굴림, trigger 패스 순서, Resolvable `minutes` 적용 순서, `attempts` 미증가, stat 수정자 공식을 바꾸면 모두 실패하고(trigger 순서 변이는 Chromium spec도 실패), 키 생성 순서만 바꾼 리팩터는 통과한다. **갱신 규칙**: 의도된 변경일 때만 `node tests/v2/golden.test.js --print`의 출력을 fixture의 `stepHashes`/`finalStateHash`에 붙이고, 사유를 커밋/PR과 이 행에 "갱신 기록"으로 덧붙인다. **한계(사실)**: golden은 fixture가 지나는 경로만 잠근다(예: relation score의 clamp 경계는 이 시퀀스에서 닿지 않는다). 합성 fixture라서 실제 팩 콘텐츠의 변경은 잠그지 않는다(D-68 (c)의 "같은 id·version인데 내용이 바뀐 팩" 검출은 이 테스트의 일이 아니다). §13.2의 "seed 차이"와 "파생 스트림 격리" 행은 world-generation 스트림의 소비자가 없어(D-65/D-72) 여전히 쓸 수 없다. **갱신 기록 1 (V2-Core-43, D-76)**: fixture의 `facts`에 `fact_fixed`(고정값 `"start"`)와 `fact_seeded`(`pickFrom` 5개)를 추가했다. `createInitialState`가 둘을 시딩하므로 step 0부터 모든 fingerprint가 바뀌었다(의도된 변경: world-generation 시딩의 도입). `node tests/v2/golden.test.js --print`로 갱신했고 `finalStateHash`는 `15b8206a`다. 이제 golden이 C1 seed 입력을 잠근다 — 입력을 C2로 바꾸면 step 0부터 실패한다(변이로 확인). |
| D-76 | `facts[*].initial` 시딩과 world-generation seed 입력 — #117 결정 1 (Issue #118, V2-Core-43) | **인간 결정(#117)**: seed 입력은 **C1**(저장된 `state.worldSeed` 문자열)로 시작하고, **C2**(`state.rng.seed`)로 가는 경로를 만든다. **구현**: `createInitialState`가 `data.facts[id].initial`을 한 번 시딩한다(§8.1). 계약이 이미 정한 것은 시점(`createInitialState`), 라벨 `fact:<id>`, local cursor 0, idempotent, view 비노출이다(§2.7/§8.1). 이번에 정한 최소 세부: `pickFrom`을 가진 객체는 `pickFrom[nextUint32({ seed: deriveSeed(state.worldSeed, "fact:"+id), cursor: 0 }).value % pickFrom.length]`(`rollDie`와 같은 나머지 패턴); 그 밖의 값(문자열·숫자·`null`·배열·`pickFrom` 없는 객체)은 그대로 복사; `since`는 생성 시각(0); 생성 이벤트는 없다(`createInitialState`는 첫 캐릭터 생성에도 이벤트를 내지 않는다; fact 이벤트는 어차피 internal); `state.facts`의 키는 정렬 순서(§2.6); `initial`이 없거나 `undefined`인 fact는 지금처럼 lazy(D-44)이고 시딩할 것이 없으면 `facts` 키 자체가 없다(기존 state 모양 유지). `validateData`는 배열이 아니거나 빈 `pickFrom`, `pickFrom` 옆의 다른 키를 보고하고, 엔진은 쓸 수 없는 `pickFrom`을 시딩하지 않는다. gameplay `state.rng`는 시딩의 영향을 받지 않는다. `rng.js`는 바뀌지 않았다(문자열의 `toString(16)`은 문자열 그대로). **호환성**: 팩 `version`은 그대로(`0.1.0`). 실제 팩의 `fact_ruins_secret.initial:"unknown"`이 새 게임의 시작 값이 됐다. 이 값을 읽는 Condition은 없고 조사 성공이 이전처럼 `bandit_hideout`으로 바꾸므로(`fact.changed`의 data에는 이전 값이 없다) 이벤트는 같다. 이 결정 전의 save(`facts` 없음)는 D-68 검사를 그대로 통과하고, 실제 팩의 시작 state에서 모든 action이 같은 이벤트와(시딩된 값을 뺀) 같은 state를 낸다(테스트). golden fixture는 의도적으로 갱신했다(D-75 갱신 기록 1). "시딩 없음"을 고정하던 characterization 테스트(`core-semantics-gap.test.js`, `data-world.test.js`의 세 단정, `tests/v2-ui-core-semantics-browser.spec.js`)는 결정된 동작으로 바꿨다. **C2로 가는 경로**: seed 입력은 `engine.js`의 `worldGenerationSeed(state)` 한 곳에서만 정한다. 바꾸는 절차는 (1) 그 함수가 `state.rng.seed`를 돌려주게 하고, (2) C1을 고정한 테스트(`tests/v2/facts-initial.test.js`의 `testSeedInputIsC1`, `core-semantics-gap.test.js`와 core-semantics browser spec의 기대값)를 C2로 바꾸고, (3) golden을 `--print`로 갱신해 사유를 D-75에 남기고, (4) 이 행과 §2.7/§8.1을 갱신하는 것이다 — C2 전환을 엔진 한 줄만 바꿔 몰래 할 수는 없다(그 한 줄 변이가 위 세 테스트 파일을 실패시킨다). 영향: 새로 만드는 world의 `pickFrom` 결과만 바뀐다. 시딩된 값은 state에 저장되므로 기존 save는 그대로이고 D-68 검사도 그대로 통과한다. 같은 seed 문자열로 다시 만든 world와 replay/fixture는 다른 world가 된다. C2의 알려진 성질: 서로 다른 seed 문자열 둘이 32bit 해시에서 충돌하면 world-generation도 같아진다(C1은 문자열 전체를 라벨과 함께 해시한다). **주의(지금은 해당 없음)**: §2.7의 "이후 새 콘텐츠 도입 시점" 시딩(로드한 옛 save에 새 fact를 시딩)은 아직 없다. 그것을 만든다면 그 시점의 입력도 `worldGenerationSeed`를 쓰고, C1과 C2가 한 세계에 섞이지 않게 할지(state별 입력 표식 같은 새 state semantics)는 그때 설계 게이트로 정한다. **예상 계기**: seed를 숫자(uint32)로 주는 서버/외부 입력이 생기거나 문자열 `worldSeed` 없이 `rng.seed`만 전달되는 경로가 생길 때. 그 전까지 C1은 §2.7 표와 맞고 저장된 문자열로 재계산된다. **§13.2**: "seed 차이"와 "파생 스트림 격리"를 fact로 구현했다. 검증: `tests/v2/facts-initial.test.js`(시딩, C1 고정, seed 차이, 스트림 격리, validator, 실제 팩과 옛 save), golden(Node·Chromium). 변이: 입력을 C2로, cursor 1, 시딩이 gameplay rng를 소비, `since` 1, validator 끄기, 시딩 제거 — 모두 실패한다. |

---

## 15. 구현 단계의 첫 작업 (제안. 승인 후 진행)

**작업 1 = V2-Core-01: "결정론 기반 + 빈 step"** (범위는 2.0절)

1. `tests/v2/run.js` 수정: `web/v2/core`가 존재하는데 테스트가 0개이면 실패하게 한다. 확장자 수집 규칙은
   바꾸지 않는다 (`.js` 그대로, D-01 Option B 확정 — `package.json`을 추가하지 않는다).
2. `web/v2/core/rng.js`: `hashString`, `deriveSeed`, `nextUint32`, `rollDie`.
3. `web/v2/core/engine.js`: `SCHEMA_VERSION`, `createInitialState`(2.0절 최소 state: schemaVersion,
   worldSeed, rng, time), `step`. 이 단계의 step은 `wait`와 invalid action reject만 지원한다.
4. 테스트: 금지 의존성 스캔, RNG 결정론과 golden, immutability(동결 입력), JSON 안전성, invalid action
   reason code, wait의 시간 전진.
5. V1 회귀 41/41 재확인.

- 이 작업은 Condition, Effect, check, Growth, 콘텐츠를 **포함하지 않는다.**

**작업 2 = V2-Core-02: `rules.js` Condition** (`validateData`는 포함하지 않음 — 별도 결정 시 추가)

- 연산자: `always`/`never`/`and`/`or`/`not`/`eq`/`neq`/`gt`/`gte`/`lt`/`lte` (D-21~D-23, D-25).
- `stat`/`skill`/`proficiency`/`item`/`money`/`relation`/`flag`/`signal`/`day`/`fact`/`rumor` selector
  해석(§3.2a)을 `evaluateCondition` 내부에서 구현했다. `rumor`는 D-24로 보류.

**작업 3 = V2-Core-03: 순수 `applyEffects` + world 단위 최소 Effect subset**

- 연산자: `flag`/`signal`/`time`/`if` 4개만 (D-26~D-40, 4.1절/4.2절).
- `web/v2/core/rules.js`에 `applyEffects(effects, ctx) -> {state, events}` 추가. `engine.js`에는
  연결하지 않는다(D-40). RNG는 쓰지 않는다(D-27 — 이번 4개 op는 RNG가 필요 없다).
- `perform`/`move`처럼 actor를 다루는 나머지 Effect(`stat`/`hp`/`money`/`item`/`relation`/`rumor`/
  `fact`/`exp`/`proficiency`/`skill`/`trait`/`unlock`/`case`/`narrate`/`choice`/`handler`)와
  Resolvable/actors 연결은 다음 작업으로 미룬다.

**작업 4 = V2-Core-04: subject 해석 + 대상 기반 Effect 5종**

- 연산자: `stat`/`hp`/`money`/`item`/`relation`(`add`만) 5개 (D-29, D-31, D-32/33/34/37 일부 확정,
  4.1절/4.2절/4.3절/7.3절/9절).
- subject/`from`/`to` 해석과 "타입 오류→throw, 해석 실패→skip"(D-29)을 5개 op가 공유한다.
- `relation`의 `mode`/`tag`/`untag`, `hp`의 사망 트리거(§9)는 이번에도 미룬다.
- `move`, Resolvable/`perform`/`move` action 연결, `check`는 여전히 다음 작업이다.

**작업 5 = V2-Core-05: Growth Effect 4종 (`skill`/`trait`/`unlock`/`case`)**

- 연산자: `skill`, `trait`(exclusive 처리 포함), `unlock`, `case` (D-31을 같은 카테고리에 확장 적용).
- `exp`, `proficiency`는 **블로커로 미구현** (D-41, D-42) — §6.4의 레벨업/임계값 cascade가 재귀적
  Effect 적용과 여러 미정 사항을 요구해서, 계약이 명확해지기 전까지 구현하지 않기로 했다.
  (이후 V2-Core-06에서 D-41/D-42를 resolved로 확정했다 — 6.4.1/6.4.2절. 코드는 여전히 미구현이며
  작업 8에서 구현한다.)

**다음 작업 후보**(순서대로, 각 작업은 사람의 승인 후 진행):

  - 작업 6: `move`, Resolvable과 `perform`/`move` action을 `step()`에 연결(D-40 재검토), 사망 트리거
    §9 연결과 D-34(목록 중간 사망) 해결. **사망 트리거와 D-34는 V2-Core-10에서 `hp` Effect(rules.js)
    확장만으로 확정·구현했다.** **나머지 전부(`move` Effect, Resolvable 해석, `perform`/`move` action의
    `step()` 연결, `startCharacter`, succession)는 V2-Core-11에서 `engine.js` 보호를 해제하고
    완료했다(D-46/D-47/D-48). 작업 6은 완료됐다** — D-40(engine.js를 건드리지 않는다는 결정)은 이번
    라운드부터 더 이상 적용되지 않는다(사용자가 명시적으로 보호를 해제함)
  - 작업 7: check — **완료됐다(D-49, V2-Core-11)**. `data.rules.check`의 5.3절 제안 기본값을 그대로
    채택해 modifier 합산·tier 판정·opposed·attempts/retryPenalty를 구현했다
  - 작업 8: `exp`/`proficiency` 구현 (계약은 D-41/D-42로 확정됨, 6.4.1/6.4.2절 — V2-Core-06에서 완료)
  - 작업 9: `relation`의 `mode`/`tag`/`untag` (D-43로 확정, V2-Core-07에서 구현), Fact/Rumor의
    `fact` Effect(D-44, V2-Core-08)와 `rumor` Effect(D-45/D-14, V2-Core-09)를 모두 구현해 작업 9는
    완료됐다. **`rumor` selector(§3.2a, D-24)는 당시 보류였다** — `rumor` Effect는 `state.knowledge`에
    쓰기만 할 뿐 Condition의 `rumor` selector를 새로 resolve하지 않아 D-24 해소와는 무관했다
    (D-24는 이후 V2-Core-15에서 확정·구현했다, 아래 작업 12 참고)
  - 작업 10: 사망 계승 세부(`startCharacter`, succession Effect 적용)는 V2-Core-11에서 완료했다
    (D-47). `view(state, data)`는 V2-Core-13에서 D-53/D-15로 확정·구현했다 — 작업 10도 완료됐다.
  - D-35(`choice`/`pending` 세부)는 `choice` Effect와 `choose`/`day.started`/trigger를 함께
    V2-Core-12에서 구현하며 확정했다(D-35/D-50/D-51). 작업 6/7은 이제 전부 완료됐다.
  - `narrate`(D-52)는 V2-Core-13에서 구현했다. `handler`는 실제 사용 사례가 없어 의도적으로
    미구현으로 남긴다(4.4절 콜아웃, blocker 아님) — 나머지 모든 Effect op와 공개 API가 구현된
    지금, 사실상 §4/§9의 계약 구현은 (handler 제외) 모두 끝났다.
  - 작업 11 = V2-Core-14: §3.2 Condition shorthand op 12종(`stat`/`flag`/`signal`/`skill`/`trait`/
    `item`/`relation`/`fact`/`day`/`location`/`unlock`/`case`)과 `money`를 D-54로 확정·구현했다.
    `engine.js`의 `validateState`를 D-55로 확정·구현했다. `migrateState`는 실제 구버전이 없어
    의도적으로 미구현(D-55, blocker 아님, `handler`와 같은 이유). D-09(modifier 합 상한)는
    재검토했으나 새 정보가 없어 그대로 미해결·null 유지. `rumor` shorthand op는 D-24 미해결 위에
    추가 결정(`minConfidence`, fact 역참조)이 필요해 이번에도 제외했다(§3.2 D-54 콜아웃 참고).
  - 작업 12 = V2-Core-15: §4.2/§6.4의 stale "코드 미구현" 표기(exp/proficiency, 실제로는
    V2-Core-06부터 구현됨)를 정정했다. D-24(`rumor` selector)를 재검토해 `claim`으로 확정·구현했다
    (`fact` selector의 `.value`와 같은 "메타데이터 아닌 실질 내용" 역할, §8.4 문맥 제한은 적용되지
    않음). D-24가 풀리면서 막혀 있던 `rumor` shorthand Condition op(직접 조회 + `minConfidence`,
    `fact` 역참조 두 형태 모두)도 함께 구현했다 — 둘 다 RumorEntry(§8.2)의 이미 고정된 필드를 읽는
    기계적 구현으로 판명되어 새 필드를 발명하지 않았다. `handler`/`migrateState`/D-09는 재검토했으나
    여전히 새 정보가 없어 그대로 유지한다(각각 4.4절 콜아웃/D-55/D-09 참고) — 실제 사용 사례나
    밸런스 데이터가 없는 상태에서 값을 지어내지 않는다. `validateData`도 재검토했으나, §11절이
    "ID 형식/참조 무결성/Condition·Effect op와 인자/handler 등록/..."를 필드 단위로 나열하지 않고
    상위 카테고리로만 언급해 `validateState`(§2.1의 5개 불변 조건처럼 필드 단위로 확정된 목록)와
    달리 아직 D-decision 없이 구현하기엔 근거가 부족하다고 판단해 이번에도 미구현으로 남긴다(C,
    새 의미 결정 필요 — 특히 "Condition/Effect op와 인자" 검사는 20개 Effect·16개 Condition op마다
    별도의 malformed 스키마를 새로 정의해야 하는 큰 결정이라 이번 라운드 범위를 벗어난다).
    (이후 V2-Core-16에서 D-56으로 6개 카테고리 모두 부분 구현했다 — 아래 작업 13 참고.)
  - 작업 13 = V2-Core-16: `validateData(data)`를 D-56으로 확정·구현했다. 6개 카테고리(ID 형식/참조
    무결성/Condition·Effect op와 인자/handler 등록과 reason/player 문맥의 fact 사용 금지/Resolvable
    success·fail 필수)를 각각 계약 다른 곳에 이미 스키마가 확정된 부분으로만 좁혀 구현했다(D-55와
    같은 원칙). Effect/Condition의 op별 개별 인자(정수 범위 등) 검사와, 스키마 자체가 어디에도 없는
    `data.cases[*].stages[*].completeWhen`/`data.rules.relation.*.when`은 D-56이 명시적으로 범위
    밖(C, blocker)으로 남겼다.
  - 작업 14 = V2-Core-17: D-56이 "op별 malformed 스키마 발명 필요"로 범위 밖에 뒀던 Effect/Condition
    개별 인자 검증을 재검토해 D-57로 확정·구현했다 — `applyOneEffect`의 각 함수가 이미 그 스키마를
    throw 코드로 갖고 있고, D-54/D-24가 이미 Condition의 필수 필드 로직을 갖고 있어 발명이 아니라
    코드를 정적으로 옮기는 것이었다. Effect 20개 전부와 Condition의 필수 필드가 있는 op를 구현했다.
  - 작업 15 = V2-Core-18: D-56이 범위 밖에 뒀던 "Effect가 참조하는 콘텐츠 ID의 존재"를 재검토해
    D-58로 확정·구현했다. 판단 기준을 "계약이 이미 명시적 우아한 폴백을 선언했는가"로 세워
    growth/item/rumor/fact/case 관련 참조는 전부 제외하고, 명시적 disclaimer가 없고 결과가 이미
    확정된 메커니즘(pending 게이트, reject code)으로 완전히 추적되는 `choice`→`data.choices`와
    `check.difficulty`(문자열)→`data.rules.check.difficulties` 두 가지만 구현했다.
  - 작업 16 = V2-Core-19: `data.cases[*].stages[*].completeWhen`/`data.rules.relation.*.when`을
    재조사해 D-59로 "스키마 부재, blocker 종결"을 재확인했다(§3.3 표 한 줄 외 어떤 필드 스키마도
    없음, 실제 콘텐츠/설계 결정이 먼저 필요). 같은 기준으로 `web/v2/core/*.js`의 모든 `throw` 위치를
    전수 재대조해 D-57/D-58이 놓친 두 가지를 D-60으로 확정·구현했다: `characterTemplates[*].locationId`
    필수 여부(`buildActorFromTemplate`의 첫 줄 throw)와 Resolvable `check` 자체의 shape(`check()`/
    `resolveDifficulty()`의 나머지 throw 조건 — `check`는 plain object여야 하고 `difficulty`는
    정수/문자열/`{base:정수,opposed:object}` 중 하나여야 함).
  - 작업 17 = V2-Core-20: D-59가 blocker로 종결했던 `data.cases[*].stages[*].completeWhen`/
    `data.rules.relation.*.when`을 재검토해, "그 필드 자체가 Condition 하나라는 사실"만 D-61/D-62로
    확정했다(D-59가 남긴 그 이상의 구조 — stage 전이 실행, relation rule effect/우선순위/cadence —
    는 여전히 blocker). `validateData`에 두 위치를 위한 새 순회를 추가해 기존 `walkCondition`을
    그대로 재사용했다: `data.cases[id].stages`가 배열이면 각 stage의 `completeWhen`을, `data.rules.relation`의
    각 rule의 `when`을 각각 `contextKind:"world"`로 검사한다(둘 다 §3.3이 이미 world로 고정한 위치이므로
    D-06의 player-context fact 금지는 적용하지 않는다). 새 Condition op/evaluator/파일은 만들지 않았다.
  - 작업 18 = V2-Core-21: §10 저장 계약을 처음으로 실제 구현했다. `engine.js`에 `migrateState(raw)`를
    D-63으로 추가했다(`SCHEMA_VERSION=1`만 지원, 구버전 변환 chain 미발명, `structuredClone`으로 순수
    복사). `web/v2/storage/idb.js`를 신설해 D-64의 IndexedDB adapter(`save`/`load`/`list`/`remove`
    4개 함수만)를 구현했다 — `web/v2/core/*`는 이 파일을 전혀 import하지 않고, 이 파일만 IndexedDB와
    `Date.now`를 쓴다(엔진은 `savedAt`을 모른다). `tests/v2/storage.test.js`(Node, 순수 함수만),
    `tests/v2-storage-browser.spec.js`(Playwright, 실제 IndexedDB — 신설 harness `web/v2/storage/smoke.html`
    경유)로 검증했고, 후자에 §10이 요구하는 장기 round-trip(여러 step 사이에 save/load를 끼워도
    저장 없이 실행한 대조군과 상태가 완전히 같음: rng/time/actors/facts/knowledge/relations/cases/
    fired/attempts/pending 전부)을 포함했다. CI의 "Unit & regression"에 `node tests/v2/run.js`
    (V2 전체 회귀), "Browser smoke"에 이 신설 spec을 추가해 매 PR마다 실제로 검증되게 했다(이전
    라운드들은 로컬 실행 결과만 PR 본문에 기록했을 뿐 CI 자체가 V2 코드를 검증하지 않던 gap을
    이번에 이 파일들에 한해 메웠다). README의 저장 계층 "미구현" stale 문구를 갱신했다.
  - 작업 19 = V2-Core-22: 첫 실제 V2 세계관 데이터팩(`web/v2/data/world.js`)을 만들어
    `data → createInitialState → step → view → save/load` 전체 계약을 실제 콘텐츠로 관통시켰다.
    콘텐츠 작성 전 `createInitialState`/`resolveGrowthValue`/`computeCheckModifiers`/`resolveChoose`를
    재대조해 두 가지를 확인했다: (1) `data.facts[*].initial` 시딩 코드 부재(D-65로 기록, 콘텐츠는
    `fact` Effect로 명시 설정해 우회), (2) `resolveChoose`의 ctx에는 `targetId`가 전혀 없어(선택지
    Effect가 `relation`의 `from:"target"` 기본값에 의존하면 조용히 skip된다) `choice` 옵션의 relation
    Effect는 반드시 `from`을 명시해야 한다는 것 — 둘 다 새 semantics를 발명하지 않고 기존 코드
    그대로에 맞춰 콘텐츠를 설계하는 방식으로 해결했다. 데이터팩은 world 1개/location 3개/action
    5개(`choice` 1개 포함)/growthSystem 1개(stat+proficiency+unlock, 성장이 실제로 새 행동
    `act_confront_leader`의 접근을 여는 예시)/item 2개/fact·rumor 각 1개/npc 2명·org 1개(relation
    참조 ID로만 존재)로 구성했으며 `handler`/D-09/completeWhen·relation rule 실행 semantics/
    `data.cases[*].stages`/`data.facts[*].initial` 중 어느 것에도 의존하지 않는다. `validateData`는
    수정 없이 그대로 통과했다(`[]`). `tests/v2/data-world.test.js`(Node — import/validateData/
    createInitialState/전체 플레이 경로/invalid·locked action/deterministic replay/JSON round-trip/
    `web/v2/storage/idb.js`의 순수 함수를 재사용한 save-load round-trip)와
    `tests/v2-data-world-browser.spec.js`(Playwright — 기존 `web/v2/storage/smoke.html` harness에
    실제 데이터팩 import를 추가해 재사용, 실제 IndexedDB로 같은 시나리오 재검증)로 검증했고, CI
    "Browser smoke"에 이 신설 spec을 추가했다. `web/v2/core/*`, `web/v2/storage/idb.js`,
    `tests/v2/run.js`, `web/v2/core/rng.js`는 수정하지 않았다.
  - 작업 20 = V2-Core-23: `web/v2/index.html` + `web/v2/ui/app.js`로 첫 실제 브라우저 진입점을
    만들어 `worldData → createInitialState → step → view → save/load` 흐름을 실제 사용자 입력/화면에
    연결했다. `app.js`는 `createInitialState`/`step`/`view`/`validateState`(engine.js)와
    `evaluateCondition`(rules.js), `save`/`load`/`list`(storage/idb.js)만 호출하는 얇은 adapter이며
    Condition/Effect/check semantics를 다시 구현하지 않는다 — 특히 `view()`가 다루지 않는 이동
    링크(`data.locations[*].links[*].requires`) 가시성 판단에 기존 `evaluateCondition`을 그대로
    재사용했다(새 evaluator 없음). UI가 보유하는 상태는 Issue #76이 명시한 만큼만이다: 권위(authoritative)
    `state` 자체, 현재 save slot, 표시용 로그(파생 데이터, engine state의 사본이 아님) — 매 렌더링마다
    `view(state, worldData)`를 새로 계산하며 별도 게임 상태를 복제하지 않는다. 잠긴 action의 잠금
    이유는 표시하지 않는다 — 이는 우회가 필요한 gap이 아니라 D-06/D-15가 이미 의도적으로 정한
    설계(진실 비노출)를 그대로 지킨 것이다. 콘텐츠를 실제로 읽을 수 있게 하기 위해
    `web/v2/data/world.js`의 location/action/choice option에 `name`(순수 표시용, 어떤 엔진 코드도
    읽지 않는 inert 필드, 이미 item/npc/org에 쓰인 것과 같은 패턴)을 추가했다 — `validateData`는
    수정 없이 그대로 통과한다(`[]`). §11에 UI가 실제로 데이터를 얻는 방식(fetch+JSON 대신 정적 ES
    import, 이미 Node 테스트가 쓰던 것과 동일)을 구현 상태로 기록했다. `tests/v2-ui-browser.spec.js`
    (Playwright, 실제 Chromium)로 entry point 로딩, canonical playthrough(관찰→구매→조사[check]→
    대화[choice]→대면[check, growth-gated]) 전체가 버튼 클릭만으로 진행되는지, save→reload→load
    동일성과 slot 격리, 잠긴/존재하지 않는 action 처리, 375px 좁은 viewport에서 가로 스크롤 없이
    핵심 UI가 동작하는지를 검증했다. CI "Browser smoke"에 이 신설 spec을 추가했다. `web/v2/core/*`,
    `web/v2/storage/idb.js`, `tests/v2/run.js`, `web/v2/core/rng.js`는 수정하지 않았다.
  - 작업 21 = V2-Core-24: 새 기능이 아니라 **실제 gameplay gap 조사**다(Issue #78). README/§15가 "남은
    것"으로 기록해 온 항목(`handler`/`migrateState`/case lifecycle/relation rules/`facts[*].initial`/
    D-09)과 실제 플레이 경로를 계약 → runtime 소비 코드 → data pack → tests → 실제 실행 순으로 대조했고,
    각 항목을 A/B/C/D로 판정해 D-66에 기록했다. 코드/데이터/테스트는 하나도 바꾸지 않았다 — B(기존
    계약만으로 완전히 결정되는 구현 gap)로 판정된 항목이 없었기 때문이다. 핵심 결과: (1) `handler`·D-09는
    D(의도적 미구현, 계약 기본값과 runtime 일치), `migrateState`는 A(D-63), case `completeWhen` 자동
    평가·relation rules·`facts[*].initial` 시딩은 C(각각 필요한 최소 결정을 D-66에 열거, 아직 결정하지
    않음), (2) 플레이 루프를 막는 core gap은 없고 실제 gap은 데이터팩 쪽이다 — action에 시간/위치
    제약이 없고 `events`/HP/`succession` 콘텐츠가 없어 §2.5 9~10단계와 사망·`newCharacter` 경로가 실제
    콘텐츠에서 도달 불가다, (3) 새로 발견한 C: `dataRef` 불일치 save가 그대로 로드됨(D-66 (2)), UI가
    `view()` 밖의 `state`를 직접 읽는 경계(D-67). 이 판정은 임시 probe 스크립트로 실제 함수 호출을 확인한
    결과이며 저장소에는 추가하지 않았다. 함께 정정: 작업 20의 "인증 `state`"는 "권위(authoritative)
    `state`"를 잘못 옮긴 표현이었다.
  - 작업 22 = V2-Core-25: D-66이 실제 gap으로 확인한 데이터팩 쪽 빈틈(시간 진행 없음, 위치 제약 없음,
    `events`/HP/`succession` 콘텐츠 없음, 그래서 사망·`newCharacter` 경로가 도달 불가)을 **이미 구현된
    mechanics만으로** 채웠다(Issue #80). `web/v2/data/world.js`에 `minutes`(2개 action)/`location`
    Condition(2개 action)/`data.events` 1개/`rules.succession`을 추가하고 `characterTemplates`는
    그대로 재사용했다 — `web/v2/core/*`, `storage/idb.js`, `rng.js`, `tests/v2/run.js`, `web/v2/ui/app.js`는
    수정하지 않았다(UI는 이미 `newCharacter`/잠금 표시를 렌더링하고 있었고, 그 경로가 실제 콘텐츠에서
    도달 불가라 한 번도 실행되지 않았을 뿐이다). 기존 canonical path와 그 정확한 이벤트 목록을 단언하는
    기존 테스트(V2 Node 5개 파일, 기존 browser 테스트 9개)는 수정 없이 그대로 통과한다(그래서 그 action에는 `minutes`를 주지 않았고 `location`
    조건도 canonical path가 머무는 마을 행동에만 연결했다). 새 검증: `tests/v2/data-world-lifecycle.test.js`
    (Node, `run.js`가 자동으로 포함)와 `tests/v2-ui-lifecycle-browser.spec.js`(Playwright, CI "Browser
    smoke"에 추가). 두 파일 모두 데이터의 cooldown/location gate/succession을 일부러 깨뜨려 실제로 실패
    하는지 확인했다. 새 D-decision은 없고 D-66의 V2-Core-25 후속 노트로 판정(succession=B)과 남은 콘텐츠
    결정을 기록했다. D-66 (2)/D-67은 이번 issue의 명시적 범위 밖이라 그대로 열려 있다.
  - 작업 23 = V2-Core-26: 남아 있던 두 경계 문제 D-66(save provenance)과 D-67(`view()`/UI 경계)을
    실제 runtime/contract/UI 흐름으로 조사했다(Issue #82). 코드/데이터는 바꾸지 않았고(엔진, 저장
    어댑터, UI 모두 그대로) 테스트와 문서만 추가했다 — 기존 계약만으로 완전히 결정되는 구현이 없었기
    때문이다. **D-66**: `dataRef`/`worldId`의 의미, 저장 record→load 흐름, `migrateState`/
    `validateState`/`validateData`의 책임 경계는 계약과 코드에서 확정된 사실로 기록했고, 비교 기준·불일치
    정책·부재/오류 처리·헤더와 state의 권위·팩 version 차이의 처리·검사 위치는 C로 남겼다. 새 gap도
    하나 찾았다: `version`이 없는 팩은 플레이는 되지만 저장할 수 없다(해결 방식이 `dataRef` 모양의
    결정이라 C). §2.1 예시의 `worldId` 구분자(`:`)는 코드/D-03과 다른 stale 표기라 정정했다. **D-67**:
    문서는 현재 프로토타입을 local-client 모델로 기술하고 서버 권위 모델을 미래 확장으로만 두므로 현재
    UI는 문서와 일치한다(변경 없음). `view()` 밖 접근 5가지를 열거했고(그중 선택지 옵션 평가는 이전
    기록에 빠져 있었다), view-authoritative 모델로 가는 데 필요한 결정은 C로 남겼다. 새 D-decision
    번호는 만들지 않았고 D-66/D-67의 후속 노트로 기록했다. 새 검증: `tests/v2/save-compat-view.test.js`
    (Node, `run.js`가 자동 포함)와 `tests/v2-ui-view-boundary-browser.spec.js`(Playwright, CI "Browser
    smoke"에 추가). 두 파일 모두 계약이 정한 부분과 미결정 부분(CHARACTERIZATION ONLY로 표시)을 구분해
    작성했고, 일부러 코드를 깨뜨려(worldId 구분자, view 키, `migrateState` 검사, load 시 provenance 비교,
    UI의 금액 표시, 이동 링크 요구조건) 실제로 실패하는지 확인한 뒤 복원했다.
  - 작업 24 = V2-Core-27: D-66이 C로 남긴 저장 호환성 정책을 확정하고 최소 구현했다(Issue #84, 새
    D-decision D-68). 결정은 근거 없이 만들지 않고 issue의 목적("호환되지 않는 save를 조용히 실행하는
    위험 방지")과 금지 목록, §10의 거부/무수정 원칙, §2.6의 결정론 정의에서 유도했다 — 그 조합을 만족하는
    정책은 "검출하고 거부한다, 고치지 않는다" 하나였다. 구현: engine.js에서 provenance 도출 규칙을 하나로
    합쳐(`deriveProvenance`) `createInitialState`가 그 규칙을 쓰게 하고(동작은 같음, 단 `version` 없는
    팩은 `dataRef:{id}` — V2-Core-26의 "저장 불가" gap 해소), 같은 규칙으로 현재 팩의 provenance를 다시
    도출해 비교하는 순수 함수 `checkDataCompatibility(state, data)`를 추가했다. `web/v2/ui/app.js`의
    `loadGame`이 기존 `validateState` 재검사 뒤에 이를 호출해 불일치면 사유를 보여주고 불러오지 않는다.
    `migrateState`(D-63), `validateState`(D-55), `storage/idb.js`(D-64), `step()`, `rng.js`, `tests/v2/run.js`,
    `web/v2/data/world.js`, V1 경로는 수정하지 않았다. 확정하지 않고 C로 남긴 것: 팩 version 사이의 호환
    범위/data migration, `version`의 형식 제약, 같은 id·version의 내용 변경 검출, UI 외 caller의 호출
    방식(D-67과 함께). 검증: `tests/v2/save-compat-policy.test.js`(Node), `tests/v2-ui-save-compat-browser.spec.js`
    (Playwright, 실제 IndexedDB, CI "Browser smoke"에 추가), V2-Core-26의 `save-compat-view.test.js`는 결정된
    부분을 계약 테스트로 바꿔 갱신했다. 일부러 코드를 깨뜨려(version 생략 규칙, worldId 비교, id만 비교,
    seed를 키로 사용, 예외 방어 제거, schemaVersion 혼합, UI 호출 제거, UI가 worldId를 무시) 각각 테스트가
    실패하는지 확인한 뒤 복원했다. D-67(view 경계)은 이번에도 결정하지 않았다.
  - 작업 25 = V2-Core-28: 남아 있던 미결 core semantics 네 가지(D-09 `maxTotalModifier`, case
    `completeWhen`, relation rules, `facts[*].initial`)를 계약 → runtime 소비 코드 → 데이터팩 → 테스트 →
    실제 실행(Node와 실제 Chromium probe) 순으로 다시 조사했다(Issue #86). 기존 계약만으로 완전히
    결정되는 항목(B)이 없어 코드, 데이터, 테스트는 바꾸지 않았고(조사만이라 테스트 파일도 추가하지 않음)
    판정과 증거를 D-69에 기록했다: D-09 D, `completeWhen` C, relation rules C, `facts[*].initial` C. 핵심
    새 사실: (1) 기존 event 파이프라인이 "조건이 참이면 stage 전이/관계 변경"을 이미 표현하므로
    `completeWhen`/relation rule은 전용 필드가 필요한지부터 결정해야 한다, (2) `facts[*].initial`의 `pickFrom`은
    `deriveSeed`에 넘길 seed 입력에 따라 결과가 세 가지로 갈리는데(계약은 숫자 seed를 전제하지만 구현은
    String으로 저장) 그 선택이 실제 선택 결과를 바꾼다(§2.7 정정 노트), (3) 죽은 actor에게 `hp`를 더하면
    hp만 오르고 `alive`는 false로 남는다(부활 semantics 미정, 회복 콘텐츠 설계 시 주의). canonical
    플레이는 네 항목 중 어느 것도 필요로 하지 않으며 HP 회복과 추가 위치 제약은 core가 아니라 콘텐츠
    결정이다. D-09/D-59/D-65 행에는 D-69로 가는 재조사 노트를 붙였다. D-67은 이번에도 결정하지 않았다.
  - 작업 26 = V2-Core-29 (Issue #88): canonical world-data content 확장 — 위치 제약과 HP 회복. 엔진/저장/UI
    코드와 `validateData` 등 검증기는 바꾸지 않았고(`web/v2/data/world.js`와 테스트/문서/CI만) 새 D-decision도
    없다. 등불 구입/폐허 조사에 기존 `location` Condition을 붙이고 기존 `hp` Effect로 마을 휴식 행동을
    추가했다. 사전 probe로 canonical seed(`frontier-canonical-4`)에서 이동/휴식/함정을 넣어도 두 check가
    같은 등급이고(RNG는 check만 소비) 총 270분임을 확인했다. 기존 테스트 중 canonical path를 밟는
    `data-world.test.js`, `data-world-lifecycle.test.js`, `v2-data-world-browser.spec.js`,
    `v2-ui-browser.spec.js`(테스트 2)는 이동 단계를 넣도록만 고쳤고 다른 V2 브라우저 spec은 그대로 통과한다.
    새 브라우저 spec `tests/v2-ui-canonical-browser.spec.js`와 CI 단계를 추가했다. 일부러 코드를 깨뜨려(구입/
    조사/휴식 위치 제약 제거, 회복량 0, 회복량 과다로 clamp 확인) 각각 Node와 브라우저 테스트가 실패하는지
    확인한 뒤 복원했다. `version`을 올리지 않은 이유는 §11 참고. D-09/`completeWhen`/relation rules/
    `facts[*].initial`/D-67은 결정하지 않았다.
  - 작업 27 = V2-Core-30 (Issue #90): 정보·소문 기반 gameplay slice. 엔진/저장/UI 코드와 검증기는 바꾸지 않았고
    (`web/v2/data/world.js`와 테스트/문서/CI만) 새 D-decision도 없다. 원로 대화 → 소문 → 지식 → 조사 →
    fact/flag → 대면 흐름을 계약(§8/§3.2) → runtime(`applyRumorEffect`, `evaluateRumorCondition`) → 데이터 →
    테스트 → 실제 실행(Node probe와 실제 Chromium) 순으로 추적해, 소문을 소비하는 기존 Condition이 있는데 데이터팩이
    쓰지 않는다는 것이 gap임을 확인했다. `act_investigate_ruins`에 `rumor` Condition을 붙이고 성공 outcome에
    관찰 모드 `rumor` Effect를 더했다(자세한 판단은 §11). 사전 probe로 canonical seed에서 두 check가 같은 등급이고
    총 270분/HP 6임을 확인했다. canonical path를 밟는 기존 테스트(`data-world.test.js`,
    `data-world-lifecycle.test.js`, `v2-data-world-browser.spec.js`, `v2-ui-browser.spec.js` 테스트 2,
    `v2-ui-canonical-browser.spec.js`)는 원로 대화 단계를 앞으로 옮기도록만 고쳤고 나머지 V2 브라우저 spec은
    그대로 통과한다. 새 브라우저 spec `tests/v2-ui-information-browser.spec.js`와 CI 단계를 추가했다. 일부러 코드를
    깨뜨려(소문 조건 제거, 확인 Effect 제거, 원로 선택이 소문을 안 가르침, 안부 선택이 소문을 가르침, 관찰이 fact
    설정보다 앞섬, 잘못된 소문 조건, 실패도 확인) 각각 Node 테스트가 실패하는지 확인한 뒤 복원했다(브라우저 spec은
    canonical seed가 항상 성공이라 마지막 변형 하나를 잡지 못한다 — 실패 분기는 Node가 검증). `version`은 올리지
    않았다. `facts[*].initial`(D-65: 소문을 배워도 fact는 설정되지 않는다)/relation rule/`completeWhen`/D-09/D-67은
    결정하지 않았다.
  - 작업 28 = V2-Core-31 (Issue #92): 정보·관계 기반 consequence slice. 엔진/저장/UI 코드와 검증기는 바꾸지 않았고
    (`web/v2/data/world.js`와 새 테스트/문서/CI만) 새 D-decision도 없다. 정보(확인된 조사) → 선택(원로에게 보고) →
    관계(`confidant` 태그) → 결과(대면 성공 시 추가 타격) 경로를 계약(§7/§3.3) → runtime(`applyRelationEffect`,
    `evaluateRelationCondition`, `resolveChoose`, `applyIfEffect`) → 데이터 → 테스트 → 실제 실행(Node probe와 실제
    Chromium) 순으로 추적해, 소비할 수 있는 기존 Condition이 있는데 데이터팩이 읽지 않는다는 것이 gap임을 확인했다(자세한
    판단은 §11). 원로 대화가 무료·반복 가능해 relation 점수를 파밍할 수 있다는 사실을 probe로 확인하고 태그를 읽는
    설계를 택했다. 기존 테스트는 하나도 수정하지 않았다(보고하지 않는 경로가 그대로 유효). 새 브라우저 spec
    `tests/v2-ui-consequence-browser.spec.js`와 CI 단계를 추가했다. 일부러 코드를 깨뜨려(보고 선택지의 `requires` 제거,
    소문만 요구하도록 변경, 태그/`cooperation` 제거, 점수 문턱으로 변경, 잘못된 edge 읽기, 추가 타격 제거, 실패에도
    적용) 각각 Node 테스트가 실패하는지 확인한 뒤 복원했다 — 이 과정에서 "소문만 요구" 변형이 처음에는 살아남는 테스트
    빈틈을 발견해(거부 검사가 소문을 배우기 전에만 있었다) 고쳤다(브라우저 spec은 파밍/실패 분기를 잡지 못한다 — 둘은
    Node가 검증). `version`은 올리지 않았다. `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지
    않았다.
  - 작업 29 = V2-Core-32 (Issue #94): faction·관계·사건 consequence slice. 엔진/저장/UI 코드와 검증기는 바꾸지 않았고
    (`web/v2/data/world.js`와 새 테스트/문서/CI만) 새 D-decision도 없다. 관계(원로의 뒷받침) → 조직(`org_bandits` edge) →
    선택(원로의 네 번째 선택지) → 결과(두목의 조직 소속 제거) 경로를 계약(§7/§11) → runtime(`applyRelationEffect`,
    `evaluateRelationCondition`, `resolveChoose`, `runTriggerStage`) → 데이터 → 테스트 → 실제 실행(Node probe와 실제 Chromium) 순으로
    추적해, 조사가 남기는 조직 소속 태그를 읽는 곳이 없다는 것이 gap임을 확인했다(자세한 판단은 §11). event가 같은 step의 관계 변화를
    보는지는 probe로 확인만 하고 콘텐츠로는 쓰지 않았다. 기존 테스트는 하나도 수정하지 않았다. 새 브라우저 spec
    `tests/v2-ui-faction-browser.spec.js`와 CI 단계를 추가했다. 일부러 코드를 깨뜨려(조직 edge 미기록, 태그 미기록, 선택지가 조직 edge를
    안 읽음, 소속을 안 읽음, 소속을 안 지움, 잘못된 edge, 뒷받침 없는 대면에도 기록, 실패 대면에도 기록) 각각 Node 테스트가 실패하는지 확인한 뒤
    복원했다(브라우저 spec은 canonical seed가 항상 성공이라 실패 분기 하나를 잡지 못한다 — Node가 검증). `version`은 올리지 않았다.
    `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지 않았다.
  - 작업 30 = V2-Core-33 (Issue #96): 사건·상태 변화 기반 후속 consequence slice. 엔진/저장/UI 코드와 검증기는 바꾸지 않았고
    (`web/v2/data/world.js`와 테스트/문서/CI만) 새 D-decision도 없다. 결정(V2-Core-32의 조직 edge와 `untag`)이 시간이 지난 뒤
    다른 장소에서 드러나는 경로를 계약(§2.5 10단계/§11 `data.events`/§7) → runtime(`runTriggerStage`, `resolveStartCharacter`,
    `evaluateRelationCondition`) → 데이터 → 테스트 → 실제 실행(Node probe와 실제 Chromium) 순으로 추적해, 결과가 state에 그대로
    남는데도 나중 step의 event가 읽지 않는다는 것이 gap임을 확인했다(자세한 판단은 §11). 후계자 확인 probe는 처음에 이미
    지급된 뒤라 결과를 가렸다(시장을 먼저 방문한 경로)는 것을 발견해 시장을 방문하기 전에 사망하는 경로로 다시 확인했다.
    `data-world-lifecycle.test.js`의 event 목록 단정 한 줄을 새 event를 반영하도록 고쳤고 다른 기존 테스트는 수정하지 않았다.
    새 브라우저 spec `tests/v2-ui-persistence-browser.spec.js`와 CI 단계를 추가했다. 일부러 코드를 깨뜨려(cowed 조건 제거, 이탈
    조건 제거, 장소 조건 제거, `once` 제거, 보상 변경, 잘못된 edge, 첫 캐릭터 ID를 리터럴로 읽기, 지급이 관계를 건드림) 각각
    Node 테스트가 실패하는지 확인한 뒤 복원했다(브라우저 spec은 후계자를 다루지 않아 리터럴 변형 하나를 잡지 못한다 — Node가
    검증). `version`은 올리지 않았다. `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지 않았다.
  - 작업 31 = V2-Core-34 (Issue #98): 세계 수준 consequence와 후계자 지속성 조사. 엔진/저장/UI 코드와 검증기는 바꾸지 않았고
    (`web/v2/data/world.js`와 새 테스트/문서/CI만) 기존 테스트도 하나도 수정하지 않았다. 계약(§2.1/§7.1/§8.2/§9) → runtime → 데이터 → 테스트 →
    실제 실행(Node probe와 실제 Chromium) 순으로 개인 귀속 상태와 세계 귀속 상태를 A/B/C/D로 분류했고 근거와 함께 D-70에 기록했다(새 semantics는
    결정하지 않은 조사 기록). B 한 가지(세계 상태만 읽는 elder 선택지 `opt_ask_bandit_news`)만 구현했고 C 네 가지(후계자가 물려받는 범위, 세계 수준
    flag의 개인 정보 관문 사용, 세계 수준 보상의 수혜자, 쌓이기만 하는 죽은 캐릭터의 edge)는 구현하지 않았다. 조사 중 예상 밖의 사실을 발견했다:
    세계 수준 flag `ruins_secret_confirmed`를 개인 정보 관문으로 쓰던 V2-Core-31의 `opt_report_findings`는 후계자가 조사 없이도 고를 수 있다(C로 기록,
    고치지 않음). 새 브라우저 spec `tests/v2-ui-successor-browser.spec.js`와 CI 단계를 추가했다. 일부러 코드를 깨뜨려(세계 상태 대신 개인 `cowed`를 읽음, 두
    조건 중 하나씩 제거, 잘못된 방향의 edge, 선택지 효과가 옛 캐릭터의 edge에 씀, 선택지가 세계를 바꿈, 개인 결정이 조직의 태도를 요구하지 않음) 각각 Node
    테스트가 실패하는지 확인한 뒤 복원했다(브라우저 spec은 새 게임 이력과 개인 결정 변형 두 개를 잡지 못한다 — Node가 검증). `version`은 올리지 않았다.
    `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지 않았다.
  - 작업 32 = V2-Core-35 (Issue #100): 후계자 정보 누수와 세계 결과 귀속 경계. 엔진/저장/UI 코드와 검증기는 바꾸지 않았고(`web/v2/data/world.js`와
    새 테스트/문서/CI만) 기존 테스트도 하나도 수정하지 않았다. V2-Core-34가 C로 남긴 "세계 flag가 개인 정보 관문으로 쓰이는 점"을 계약(§4.1/§3.3) →
    runtime → 데이터 → 테스트 → 실제 실행(Node probe와 실제 Chromium) 순으로 다시 검증했다: 계약 위반이 아니라 팩 불일치라 기존 contract로 결정된다.
    후보 둘을 실제 state로 비교해 `item_relic`(개인 소유)을 택하고 소문 confidence는 기각했다(옛 save가 갇히고, 구제 수치는 우회를 연다 — D-70 후속).
    C의 나머지(후계자가 물려받는 범위, 세계 수준 보상의 수혜자, 죽은 캐릭터 edge의 누적)는 결정하지 않았다. 일부러 코드를 깨뜨려(보고/대면 관문을 세계
    flag로 되돌림, 소문을 증표로 인정, 후계자에게 죽은 캐릭터의 relation을 노출, 세계 edge를 개인 edge로 변경, 실패 branch에서도 증표 생성, 관문 제거) Node
    테스트가 모두 실패하는지 확인한 뒤 복원했다(브라우저 spec은 실패 branch 변형 하나를 잡지 못한다 — 브라우저 seed는 항상 성공이라 Node가 검증). 그 과정에서
    `partial` 등급이 fail outcome으로 들어가 증표를 주지 않는다는 사실도 확인했다. 새 브라우저 spec과 CI 단계를 추가했다. `version`은 올리지 않았다.
    `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지 않았다.
  - 작업 33 = V2-Core-36 (Issue #102): 후계자 inheritance semantics와 세계 보상 귀속 조사. 엔진/저장/UI 코드와 검증기와 팩 콘텐츠(`web/v2/data/world.js`)는 바꾸지 않았고
    새 테스트/문서/CI만 더했으며 기존 테스트도 하나도 수정하지 않았다. 계약(§3.3/§7.1/§8.2/§9) → runtime → 데이터 → 테스트 → 실제 실행(Node probe와 실제 Chromium) 순으로
    A가 세계/개인 변화를 만들고 죽은 뒤 B가 시작하는 경로의 실제 state를 필드별로 대조해 World/Personal/Inherited/Undecided로 분류하고(D-71), 시장 보상이 누구에게 가는지를
    (A가 받음/받기 전에 죽음/B가 자기 edge를 만듦/A가 먼저 받은 뒤 B가 자기 edge를 만듦/save→load) 기존 contract가 결정하는 현재 동작으로 고정했다. B(구현 가능) 항목은 없었다.
    C 네 가지(후계자가 받을 범위, 세계 보상의 귀속과 `once`의 단위, 개인 행동이 세계 edge를 되돌리는 것, 죽은 캐릭터 기록의 누적)는 선택지와 영향만 D-71에 기록했고 구현하지 않았다.
    `rules.succession`이 데이터만으로 고정/조건부 지급과 지식 복사를 표현할 수 있다는 것(그리고 고정 증표 지급은 V2-Core-35의 누수를 다시 연다는 것)을 variant 팩 probe로 확인했지만 채택하지 않았다.
    `wait` 중 사망한 step이 `action.resolved`로 끝나지 않는 것은 `wait`의 기존 성질이라 §9에 명확화 노트만 더했다. 새 브라우저 spec `tests/v2-ui-succession-browser.spec.js`와 CI 단계를 추가했다.
    일부러 코드를 깨뜨려(`once` 제거, 보상 조건을 세계 flag로 바꿈, 후계 규칙이 증표를 지급) Node와 브라우저가 모두 실패하는지 확인한 뒤 복원했다. `version`은 올리지 않았다.
    `facts[*].initial`/relation rule/`completeWhen`/D-09/D-67은 결정하지 않았다.
  - 작업 34 = V2-Core-37 (Issue #104): 미결 core semantics 재조사(`completeWhen`/relation rule `when`/`facts[*].initial`). 엔진/저장/UI 코드와 검증기와 팩 콘텐츠(`web/`)는 바꾸지 않았고
    새 테스트/문서/CI만 더했으며 기존 테스트도 하나도 수정하지 않았다. 계약 → validator → runtime 소비 코드 → 팩 → 테스트 → 실제 실행(Node probe와 실제 Chromium) 순으로 세 항목을 세부 질문별로
    A/B/C/D로 나눠 D-72에 기록했다(새 semantics 결정 없음). 세 필드의 소비 코드는 `validateData`뿐이고 실제 팩은 쓰지 않으며, 같은 일을 하는 `data.events`(10단계, id 순서, 연쇄 1단계 제한)가 이미
    있어 전용 경로가 필요한가가 첫 결정이다. `facts[*].initial`은 시점/라벨/idempotence만 계약이고 seed 입력은 미정이다(Node와 Chromium이 세 입력에 같은 숫자를 낸다는 것까지 확인). B(구현 가능)는
    없어 구현하지 않았고, 결합도가 낮아 후속 이슈를 나누도록 권했다. 새 Node 테스트 `tests/v2/core-semantics-gap.test.js`(현재 동작 pin — 해당 semantics가 결정되면 그 필드의 pin을 함께 교체한다)와
    새 브라우저 spec `tests/v2-ui-core-semantics-browser.spec.js`와 CI 단계를 추가했다. 일부러 validator를 깨뜨려(`completeWhen`/relation `when` 검사 제거) Node 테스트가 실패하는지 확인한 뒤 복원했다.
    `version`은 올리지 않았다. D-09/D-67은 결정하지 않았다.
  - 작업 35 = V2-Core-38 (Issue #106): `completeWhen` semantics 결정. 엔진/저장/UI 코드와 검증기와 팩 콘텐츠(`web/`)는 바꾸지 않았고 새 테스트/문서/CI만 더했으며 기존 테스트도 하나도 수정하지 않았다.
    `completeWhen`과 `data.events` trigger + `case` Effect를 probe로 비교했다(전이 Effect, `check`/`outcomes`, `once`/`cooldown`, 같은 step 연쇄와 id 순서, stage 가드와 재진입, 가드 없는 진입
    event의 되돌림, pending gate, 세계 case를 캐릭터 Condition으로 완료하는 경우). event가 엄밀히 더 표현력이 크고 전용 evaluator는 연쇄 1단계 제한과 충돌하거나 별개의 순서 규칙을 만들어, 활성화하지
    않기로 결정했다(D-73, 예약 필드 유지). 구현하지 않으므로 현재 semantics를 고정하는 테스트만 추가했다: `tests/v2/case-completion.test.js`와 새 브라우저 spec
    `tests/v2-ui-case-completion-browser.spec.js`(실제 Chromium + 실제 IndexedDB, 페이지 새로고침 포함), CI 단계. 일부러 엔진을 깨뜨려(trigger 패스를 한 번 더 실행, `once` 무시) Node와 브라우저가
    실패하는지 확인한 뒤 복원했다. `version`은 올리지 않았다. relation rule `when`/`facts[*].initial`/D-09/D-67은 결정하지 않았다.
  - 작업 36 = V2-Core-39 (Issue #108, Master Goal #109의 첫 하위 작업): relation rule semantics 결정. 엔진/저장/UI 코드와 검증기와 팩 콘텐츠(`web/`)는 바꾸지 않았고 새 Node 테스트와 문서만 더했으며
    기존 테스트도 하나도 수정하지 않았다. 계약(§3.3/§7/§11, D-59/D-62/D-72) → validator → runtime 소비 코드 → 실제 팩 → V1 관계 규칙(`web/core/npc-relations.js`, 읽기만) → 테스트 → probe(Node와 실제
    Chromium) 순으로 relation rule과 `data.events` + `relation` Effect를 cadence/문맥/순서/once·cooldown/같은 step/반복/여러 rule 순서/관계 변화 방식으로 비교했다. 실제 수요는 없었고 V1 규칙 모양은 `day`
    selector와 edge별 `signal` 카운터로 정확히 표현됐으며, event로 표현할 수 없는 것은 여러 edge에 걸친 규칙뿐이라 활성화하지 않기로 결정했다(D-74, 예약 필드 유지). 조사 중 event 안의 `relation` Effect에서
    `from`을 생략하면 기본값 `target`이 없어 조용히 건너뛰어진다는 기존 동작을 확인해 저작 주의로 기록했다(버그가 아니라 §7.3 + D-29). 새 테스트 `tests/v2/relation-rules.test.js`. 일부러 엔진을 깨뜨려
    (`rules.relation`을 event처럼 실행, event에 target 부여, trigger 패스 두 번, cooldown 무시) 새 테스트가 모두 실패하는지 확인한 뒤 복원했다(target 부여는 기존 테스트로는 잡히지 않는다). 엔진이 바뀌지 않아
    새 브라우저 spec은 만들지 않았다(같은 필드의 Chromium 동작은 `tests/v2-ui-core-semantics-browser.spec.js`가 검증하고, 이번 패턴들은 일회성 Chromium probe로 Node와 같은 결과를 확인했다). `version`은
    올리지 않았다. `facts[*].initial`/D-09/D-67은 결정하지 않았다.
  - 작업 37 = V2-Core-40 (Issue #111, Master Goal #109의 두 번째 하위 작업): §13.2 golden 테스트 구현. 엔진/저장/UI 코드와 검증기와 팩 콘텐츠(`web/`)는 바꾸지 않았고 기존 테스트도 하나도
    수정하지 않았다. #108 merge 뒤 Master Goal을 재평가하면서 §13.2의 합격 기준 중 지금 구현할 수 있는데 없는 유일한 항목(golden)을 찾았다 — 같은 실행을 두 번 비교하는 기존 테스트는
    엔진 변경이 두 실행을 똑같이 바꾸면 잡지 못한다. 추상 ID 합성 fixture `tests/v2/fixtures/golden-path.json`(seed `golden-0`, action 39개, check 네 등급·events·성장·사망과 계승 등)과
    `tests/v2/golden.test.js`(step별·최종 fingerprint, fixture 경로 단정, 중간 save/load), `tests/v2-ui-golden-browser.spec.js`(실제 Chromium의 step별 fingerprint = 지금의 Node 값 = 기록값,
    실제 IndexedDB 저장 → 새로고침 → 불러오기), CI 단계를 추가했다(D-75). 처음 만든 fixture는 trigger 패스 순서 변이를 잡지 못해(같은 step에 서로 의존하는 event가 없었다) 같은 step 연쇄를
    넣어 보강했다. Playwright 로더가 spec 프로세스에서 `web/v2/core/*.js`(ESM)를 불러오지 못해 Node 기준값은 Node golden 테스트의 `--print`를 자식 프로세스로 실행해 얻는다. `version`은 올리지
    않았다. `facts[*].initial`/D-09/D-67/D-68 (a)는 결정하지 않았다.
  - 작업 38 = V2-Core-41 (Issue #113, Master Goal #109의 세 번째 하위 작업): §13.2 "invalid action" 행을 9개 reason code 전부에 대해 검증했다. 엔진/저장/UI 코드와 검증기와 팩 콘텐츠(`web/`)는
    바꾸지 않았고 기존 테스트도 하나도 수정하지 않았다. golden 다음으로 §13.2에서 지금 구현할 수 있는데 빠져 있던 기준이다 — 이 행의 기준 전체(state·rng·time 불변, 이벤트 정확히 1개,
    `visibility`)를 한 번에 확인하는 것은 `invalid_action`의 형식 오류 경로뿐이었고, 나머지 code는 경로에 따라 `code`·state 불변·이벤트 목록 중 일부만 봤다(`pending_choice`/`actor_dead`/
    `no_pending_choice`는 `code`만). 새 테스트 `tests/v2/reject-codes.test.js`(각 code를 내는 엔진의 모든 분기 32개 경우, 동결 입력, 엔진 code 목록 = §2.6 목록의 정적 스캔). 일부러 엔진을
    깨뜨려(`pending_choice` 거절의 시간 전진, `requirements_not_met`의 detail — 모든 경로와 링크·목적지 `requires` 거짓 경로만, 없는 actor의 새 code, 실행되지 않는 경로의 새 code, 이벤트 2개,
    `unknown_option`의 `visibility:"internal"`, 없는 template 거절의 rng 소비) 새 테스트가 모두 실패하는지 확인한 뒤 복원했다. 그중 5개(시간 전진, 링크·목적지 경로만의 detail, 새 code 두 가지,
    visibility)는 기존 Node V2 테스트 전체와 V2 브라우저 spec 46개를 모두 통과했다. 반환 state를 복사본으로 바꾼 리팩터는 통과한다(계약이 동일성을 요구하지 않는다). 엔진이 바뀌지 않았고 UI는
    모든 code를 같은 문구(`할 수 없다. (code)`)로 보여 주므로 새 브라우저 spec은 만들지 않았다 — Chromium과 Node의 step 결과 일치는 golden spec(D-75, 거절 4종 포함)이 검증한다. Issue #113의
    "왜 필요한가"에 처음 쓴 기존 커버리지 설명이 실제보다 좁아 issue 본문을 정정했다. 새 D-decision은 없다. `version`은 올리지 않았다.
  - 작업 39 = V2-Core-42 (Issue #115, Master Goal #109의 네 번째 하위 작업): §13.2 "immutability" 행을 그대로 검증했다. 엔진/저장/UI 코드와 검증기와 팩 콘텐츠는 바꾸지 않았고 기존 테스트도
    수정하지 않았다. `view()`와 `check()`는 호출 전후 deepEqual만 검사됐고 동결 입력으로 호출하는 테스트가 없었다. 새 테스트 `tests/v2/immutability.test.js`(golden fixture의 모든 state와 실제 팩의
    시작 state에서 동결한 state·data로 `step`/`view`/`check`). 일부러 엔진을 깨뜨려(`view`와 `check`가 입력에 썼다가 되돌림, `move` 경로가 입력에 같은 값을 다시 씀) 새 테스트가 모두 실패하는지
    확인한 뒤 복원했다. 앞의 둘은 기존 Node V2 테스트를 모두 통과했다. 이것으로 §13.2의 엔진 전반 기준(금지 의존성, 반복 재현, golden, immutability, JSON 안전성, invalid action)에는 모두 그 기준을
    그대로 검사하는 테스트가 있다(연산자별 행은 이번에 다시 감사하지 않았다). 남은 "seed 차이"/"파생 스트림 격리"는 world-generation seed 입력 결정(D-65/D-72)에 묶여 있다. 새 D-decision은 없다. `version`은 올리지 않았다.
  - 작업 40 = V2-Core-43 (Issue #118, #117 결정 1): `facts[*].initial` 시딩을 구현했다(D-76). 루프는 #117(설계 게이트 decision request)에서 멈췄고, 인간이
    "C1으로 시작하고 C2로 가는 경로를 만든다"고 결정했다. `createInitialState`가 seed 입력 C1(`state.worldSeed`)로 `pickFrom`을 고르고 고정값을 복사하며, 입력은
    `worldGenerationSeed` 한 곳에서 정한다. C2 전환 절차와 영향은 D-76에 적었고, 전환은 C1 고정 테스트·golden이 실패해 드러난다. 엔진(`engine.js` 시딩,
    `rules.js` validator)을 바꿨다. `rng.js`/`idb.js`/UI/V1/팩 `version`은 그대로다. 새 테스트 `tests/v2/facts-initial.test.js`와 §13.2 두 행. golden fixture를
    의도적으로 갱신했고, "시딩 없음"을 고정하던 characterization 테스트 세 곳은 결정된 동작으로 바꿨다. 실제 팩의 시작 state에 `fact_ruins_secret:"unknown"`이 생겼지만
    플레이와 이벤트는 같고 옛 save도 그대로 동작한다.
  - 작업 41 = V2-Core-44 (Issue #120): D-71 (3) 인간 결정 — 해산된 도적단의 membership은 이후 재조사로 되살아나지 않는다. 실제 팩의
    `act_investigate_ruins` success에서 `member` 태그 Effect를 `if`(case 미해결일 때만)로 감쌌다(데이터만, 엔진/state/save/`version` 변경 없음, 이미 되살아난
    save는 고치지 않음). D-71 (1)/(2)는 현재 상태 유지. 새 테스트 `tests/v2/data-world-history.test.js`와 `tests/v2-ui-world-history-browser.spec.js`(+CI 단계),
    옛 동작을 고정하던 `testRewardRecipient` V3와 succession browser spec의 후계자 시나리오는 결정된 동작으로 바꿨다. 변이: `if` 제거 시 두 새 테스트가 실패한다.
  - 작업 42 = V2-Core-45 (Issue #123, #66의 V2 vertical slice): 도적단 해산이 역사가 된다 — 즉각적 변화 → 시간 경과 → 전하는 내용의 변화 → 후대의 발견.
    엔진/state 필드/save schema/scheduler/history engine 없이 기존 계약만 썼다: `data.events.evt_bandits_tale`(해산 상태일 때 `cooldown:1440`마다 객관적 `fact_bandits_fate`
    ="dispersed"를 기록하고 signal `bandits_tale_age`를 1→3까지 셈, D-74의 지연 변화 패턴), 원로 `opt_ask_bandit_news`의 `if`(나이 3 미만이면 소식 = rumor
    `rum_bandits_fate` "dispersed" 70, 이상이면 마을 전설 = `rum_bandits_legend` "slain" 40), 조사 성공의 observe mode rumor(해산 뒤에만 fact가 있어 관찰되며 믿던 전설을
    더 높은 confidence로 교정, D-14; 해산 전에는 fact가 없어 아무것도 관찰되지 않으므로 이전 경로는 그대로). 후계자는 knowledge를 상속하지 않고(D-71 (1)) 같은 역사를 원로와
    폐허에서 스스로 발견한다. 해산 step과 뉴스 선택에 새 이벤트가 생겨 그것을 고정하던 테스트(해산 step 이벤트 목록, 후계자 뉴스 이벤트, 팩 events/facts 목록 — Node와
    core-semantics browser spec)를 사유와 함께 갱신했다. 새 테스트 `tests/v2/data-world-tale.test.js`, `tests/v2-ui-world-tale-browser.spec.js`(+CI 단계). 변이(시계 제거,
    시계가 멈추지 않음, 전설 분기 제거, 전설 교정 제거)는 모두 새 테스트를 실패시킨다. 팩 `version`은 `0.1.0` 그대로이며 이 변경 전의 save는 다음 step에서 시계가 시작된다.
