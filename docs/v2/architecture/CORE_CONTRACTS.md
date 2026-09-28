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
  "worldId": "fantasy_pack:3f2a91c0",         // 2.6절
  "worldSeed": "user-or-generated-string",
  "dataRef": { "id": "fantasy_pack", "version": "0.1.0" },
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
| 퀘스트 완료 | `data.cases[id].stages[s].completeWhen` — **Condition 하나, optional (D-61, V2-Core-20)** | world |
| 관계 규칙 | `data.rules.relation.*.when` — **Condition 하나, optional (D-62, V2-Core-20)** | world |
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
  "maxTotalModifier": null                                    // D-09
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

---

## 8. Fact / Rumor

### 8.1 Fact

- 정의는 data에 둔다: `data.facts[factId] = { "initial": <JSON 값> }` 또는
  `{ "initial": { "pickFrom": [v1, v2, v3] } }` (seed 기반 초기화: `deriveSeed(seed, "fact:"+id)`로 선택).
- 상태: `state.facts[factId] = { value, since }`.
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
  - **구현 상태**: `validateState`는 **구현됨**(D-55, §2.1). `migrateState`는 **의도적으로 미구현**이다
    (D-55, blocker 아님) — `schemaVersion:1`이 이 프로젝트에 존재한 유일한 스키마 버전이라 지금
    마이그레이션할 실제 구버전이 없다. `handler`(4.4절)와 같은 이유로, 쓸 내용이 없는 no-op
    passthrough를 미리 만들지 않는다. 두 번째 스키마 버전이 생기면 그때 구현한다.
- V1 세이브 import는 구현하지 않는다.
  - 확장: 서버 저장소로 옮길 때도 같은 레코드 형식을 쓴다.

---

## 11. 데이터 형식

- **data JSON + core JS engine** 구조를 쓴다. 엔진은 JSON을 import하거나 fetch하지 않고, `data` 인자로 받기만 한다.
  - 브라우저에서는 UI 계층이 `fetch`로 JSON을 읽어 전달한다. Node 테스트에서는 `fs.readFileSync` + `JSON.parse`로 읽는다.
  - 이유: JSON module import 문법(`with {type:"json"}`)의 호환성 문제를 피하고, 엔진의 순수성을 유지한다.
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
| golden | 고정 seed와 고정 시퀀스의 최종 state 해시를 기록한다. 바뀌면 실패하며, 갱신은 의도된 변경일 때만 사유와 함께 한다 |
| seed 차이 | 다른 seed이면 pickFrom fact 초기값 등 파생 스트림 결과가 달라진다 (fixture로 보장) |
| 파생 스트림 격리 | fixture에 NPC를 하나 추가해도 기존 NPC 초기값과 첫 check 결과가 바뀌지 않는다 |
| immutability | 동결된 입력으로 step, view, check를 호출해도 예외가 없고, 입력은 호출 전과 deepEqual이다 |
| JSON 안전성 | 모든 step 결과 state가 JSON 왕복 후 deepEqual이다 |
| invalid action | 9개 reason code 각각에서 state가 입력과 deepEqual이고, rng, time이 변하지 않으며, 이벤트는 `action.rejected` 1개다 (state에 `seq`가 없으므로 검사 대상도 아니다) |
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
| D-09 | modifier 합 상한(먼치킨 성장과 판정 의미 보존 사이의 균형) | **재검토(V2-Core-12), 여전히 미해결 — 초기 null 유지**: `check()`(D-49, V2-Core-11)가 이미 구현되어 실사용 데이터가 쌓일 수 있는 상태지만, 이 결정을 지금 강제로 내려야 할 이유(버그, 막힌 작업, 실제 밸런스 문제)가 없다. cap 방식(대칭? 절대값? 양수만?)을 정할 근거가 데이터 없이는 여전히 추측이므로, D-09가 스스로 요구하는 "밸런스 테스트 후 결정"을 앞당기지 않는다(YAGNI) — 이후 실제 콘텐츠에서 modifier 총합이 문제가 되면 그때 다시 연다. **재검토(V2-Core-14)**: 이번 라운드도 새 버그/밸런스 데이터가 없어 결론 그대로 유지한다 |
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
| D-55 | `validateState(state) -> string[]`의 정확한 검사 범위 | **확정(V2-Core-14)**: §2.1 "불변 조건" 5개 불릿을 그대로, 그러나 각 불릿이 실제로 이름 붙인 범위로만 좁혀 구현한다(새 검사 대상을 발명하지 않는다). (1) JSON 직렬화 안전: `state` 전체를 재귀 순회해 `undefined`/`NaN`/`Infinity`/`-Infinity`/`Map`/`Set`/`Date`/함수를 찾는다(라운드트립 비교 대신 정확한 위치를 보고할 수 있는 동등한 재귀 검사로 구현 — 결과는 "무엇이 어긋났는지"만 다르지 판정 자체는 같다). (2) 정수 검사는 불릿이 **글자 그대로 나열한 6개**(`hp`,`money`,`score`,`confidence`,`stat`,`exp`,`minute`)의 실제 스키마 위치에만 적용한다: `time.minute`, `actors[*].hp.current`/`.max`, `actors[*].money`, `relations[*].score`, `actors[*].growth[*].exp`, `actors[*].growth[*].stats[*]`, `knowledge[*][*].confidence`. `skill`/`proficiency`/`level`이나 `since`/`lastMinute`/`attempts`류 값은 이 불릿이 이름 붙이지 않았으므로 **의도적으로 검사하지 않는다**(범위를 넓히는 새 결정이 필요하면 그때 D-XX로 추가한다). (3) ID 형식(`^[a-z][a-z0-9_]*$`, `:` 금지)은 `state.player.actorId`, `state.actors`의 키, 각 actor의 `.id`(키와 일치해야 함), 각 actor의 `.locationId`에만 적용한다 — `worldId`는 §2.6이 별도의 합성 규칙(밑줄 결합)을 이미 갖고 있어 제외하고, `relations`의 edgeKey는 `:` 구분자가 설계상 포함되므로(§7.1) 애초에 이 검사 대상이 아니며, `flags`/`signals`/`facts`/`cases`/`knowledge`/`fired`/`attempts`의 키는 이 불릿이 이름 붙이지 않았으므로 제외한다. (4)+(5) "이벤트 로그를 두지 않는다"와 "`seq` 필드를 두지 않는다"는 같은 2.4절 근거를 공유하는 한 쌍으로 보고, 스키마에 실제로 존재하는 유일한 구체적 이름인 `state.seq`(own property) 하나만 검사한다 — 스키마에 없는 임의의 "이벤트 로그처럼 보이는 필드"를 찾는 휴리스틱은 새로 만들지 않는다. 추가로, 위 5개 불릿에는 없지만 `migrateState → validateState → 로드 거부`(§10)라는 validateState의 존재 이유 자체가 요구하므로 `state.schemaVersion !== SCHEMA_VERSION`도 오류로 담는다(그렇지 않으면 `step()`이 대신 throw하게 된다, §2.5 1단계) — 이는 새 불변 조건을 발명한 것이 아니라 이미 명시된 로드 순서 계약(§10)을 문자 그대로 지키기 위한 것이다. `state`가 plain object가 아니면 그 사실 하나만 담고 나머지 검사는 건너뛴다(순수 함수, 절대 throw하지 않는다). `migrateState(raw) -> state`는 이번 라운드에도 **의도적으로 미구현**으로 남긴다 — `schemaVersion:1`이 이 프로젝트에 존재했던 유일한 스키마 버전이라 마이그레이션할 실제 구버전이 없고, no-op passthrough를 지금 만드는 것은 `handler`와 같은 이유로 "쓸 내용이 없는 인프라"이기 때문이다(YAGNI, blocker 아님 — 두 번째 스키마 버전이 실제로 생기면 그때 구현한다) |
| D-56 | `validateData(data) -> string[]`의 정확한 검사 범위 (§11) | **확정(V2-Core-16)**: §11이 나열한 6개 카테고리를, 각각 계약 다른 곳에 이미 구체적으로 확정된 스키마가 있는 부분으로만 좁혀 구현한다(D-55와 같은 원칙 — 카테고리 이름만 있고 필드 단위 스펙이 없는 부분은 발명하지 않고 범위에서 뺀다). **(1) ID 형식**: §2.1이 이미 고정한 `^[a-z][a-z0-9_]*$`(`:` 금지) 정규식을 그대로 재사용해 `data.id`, `data.world.id`/`.growthSystemId`/`.startTemplateId`, `growthSystems`/`characterTemplates`/`locations`/`actions`/`choices`/`events`/`cases`/`items`/`facts`/`rumors`/`npcs`/`orgs`/`texts`의 키, `choices[*].options[*].id`, growth 정의 배열(`stats`/`proficiencies`/`skills`/`traits`/`unlocks`) 원소의 `.id`에 적용한다. **(2) 참조 무결성**: 이미 런타임이 실제로 역참조하는(또는 D-47처럼 부트스트랩 조건으로 이미 확정된) 대상만 검사한다 — `world.growthSystemId`→`growthSystems`, `world.startTemplateId`→`characterTemplates`(D-47), `characterTemplates[*].locationId`→`locations`(필수 필드, `resolveMove`가 실제로 쓰는 것과 같은 대상), `locations[*].links[*].to`→`locations`(`unknown_location` reject가 실제로 쓰는 대상), `growthSystems[key].id`가 있으면 키와 일치해야 함(있을 때만 검사 — §6.1 예시에 `id`가 있지만 테스트 fixture들은 생략하는 경우가 많아 필수로 만들지 않는다). Effect/Condition 안에서 각 op가 참조하는 개별 ID(아이템/성장/사건 id 등)의 존재까지는 검사하지 않는다(아래 (3) 참고, C). **(3) Condition/Effect op와 인자**: 두 switch문에 이미 고정된 op 이름 목록(Condition 25개 + `handler`, Effect 20개 + `handler`)에 없는 `op`을 "unknown op"로 신고하는 것과, §3.2/§4.1이 이미 구조를 명시한 `and`/`or`(`of`는 배열)/`not`(`of`는 단일 Condition)/`if`(`then`은 필수 배열)의 구조 검사까지만 한다. 20개 Effect·25개 Condition 각각의 세부 인자(정수 범위, enum 등)를 필드 단위로 전부 검사하는 것은 각 op마다 별도의 malformed 스키마를 새로 정의해야 하는 훨씬 큰 결정이라 **범위 밖으로 남긴다(C, blocker)** — 그 세부 검사는 이미 런타임(`applyOneEffect`/`evaluateCondition`)이 각자 D-28/§3.1 정책대로 처리한다. 순회 대상은 이미 스키마가 고정된 위치만 쓴다: `actions[*].requires`/`.effects`/`.outcomes.*`, `choices[*].options[*].requires`/`.effects`/`.outcomes.*`, `events[*].trigger`/`.effects`/`.outcomes.*`, `locations[*].requires`/`links[*].requires`, `rules.succession`, `growthSystems[*].levelRewards[*]`, `growthSystems[*].proficiencies[*].thresholds[*].effects`, `growthSystems[*].skills[*].requires`, `growthSystems[*].traits[*].requires`(마지막 두 개는 §6.2가 스키마를 이미 확정했고 §3.3이 world 문맥으로 이미 확정했다 — 런타임이 아직 이 필드를 읽지 않는다는 사실과는 무관하게 데이터 자체의 정합성은 검사한다), Effect 안의 `if.then`/`if.else`(재귀)와 `if.when`(Condition, 항상 world — rules.js의 실제 `if` 구현과 동일). `data.cases[*].stages[*].completeWhen`과 `data.rules.relation.*.when`(§3.3에 이름만 있고 필드 스키마가 어디에도 없음)은 **범위 밖(C, blocker)** — 무엇이 배열/객체인지조차 정해진 곳이 없어 구조를 지어내야 한다. **재검토(V2-Core-17)**: "20개 Effect·25개 Condition의 세부 인자는 op별 malformed 스키마를 새로 발명해야 한다"는 이 문단의 판단은 Effect에 대해서는 과했다 — `applyOneEffect`의 각 `applyXEffect` 함수가 이미 그 malformed 스키마를 실행 가능한 코드로 정확히 갖고 있으므로(발명이 아니라 이미 있는 코드를 그대로 옮기는 것), D-57에서 Effect 20개 전부를 구현했다. Condition은 §3.1의 "malformed는 항상 false, 절대 throw 안 함" 정책 때문에 런타임에 참고할 malformed 스키마가 없지만, D-54/D-24(V2-Core-14/15)에서 이미 직접 구현한 `relation`/`day`/`location`/`case`/`rumor`의 조합 조건과 각 op의 필수 필드 이름은 D-57에서 마찬가지로 코드를 그대로 옮겨 구현했다. **(4) handler 등록과 reason**: §4.4 원문("`reason`이 없는 handler 참조와 등록되지 않은 name을 오류로 처리한다")을 그대로 구현한다 — `op:"handler"`를 찾을 때마다 `reason`이 string이 아니면 오류, 그리고 `handlers.js` registry 자체가 없으므로(D-04) **지금은 예외 없이 모든 handler 참조가 "등록되지 않음" 오류**다(실제 registry가 생기면 그때 조회 로직으로 바뀐다). **(5) player 문맥의 fact 사용 금지**: §3.3 표에서 `contextKind:"player"`로 이미 확정된 4개 위치(`actions[*].requires`, `choices[*].options[*].requires`, `locations[*].requires`, `locations[*].links[*].requires`)의 Condition 트리 안에서 `{op:"fact",...}`나 `eq`/`neq`/`gt`/`gte`/`lt`/`lte`의 `left`/`right`에 쓰인 `{fact:"..."}` selector를 찾으면 오류(D-06/§8.4). §3.3의 나머지 4개 위치(퀘스트 완료/관계 규칙/성장 해금)는 world 문맥이므로 이 검사 대상이 아니다. `if.when`은 항상 world이므로(rules.js 확인) Effect 리스트 어디에 있든 이 검사에서 제외된다. **(6) Resolvable success/fail 필수**: §2.3 원문("check가 있을 때 outcomes 사용... success와 fail은 필수다")을 그대로 검사한다 — `check`가 있는 Resolvable(actions/choices 옵션/events)은 `outcomes.success`/`outcomes.fail`이 모두 배열이어야 하며, 아니면 오류. `great`/`partial` 누락은 이미 §2.3이 "런타임이 success/fail로 대체"라고 확정했으므로 오류가 아니다. 모든 검사는 `validateState`와 동일하게 **순수하고 절대 throw하지 않으며**(입력이 plain object가 아니면 그 사실 하나만 담고 종료), 기존 Effect/Condition 런타임 semantics는 전혀 건드리지 않는다(별도의 읽기 전용 순회일 뿐 `applyOneEffect`/`evaluateCondition`을 호출하지 않는다) |
| D-57 | validateData의 Effect/Condition **개별 op 인자** 검증 범위 (D-56 (3)의 후속) | **확정(V2-Core-17)**: 새 malformed 스키마를 발명하지 않는다 — Effect는 `applyOneEffect`의 각 `applyXEffect` 함수가 이미 `throw`로 구현해 둔 검사를, Condition은 D-54/D-24(V2-Core-14/15)가 이미 구현해 둔 필수 필드/조합 조건을, 코드 그대로 정적 버전으로 옮긴다(실행하지 않고 값과 타입만 본다). **Effect 20개**(원문 그대로, `subject`/`system`은 모든 항목에서 "있으면 string"): `flag`{`key`string 필수,`value`boolean 필수}. `signal`{`key`string 필수,`add`정수 필수(기본값 없음)}. `time`{`minutes`정수 필수, 0 이상}. `if`(D-56에서 이미 구현, 변경 없음). `stat`{`stat`string 필수,`add`정수 필수}. `hp`{`add`정수 필수}. `money`{`add`정수 필수}. `item`{`item`string 필수,`add`정수 필수}. `move`{`to`string 필수}. `relation`{`add`있으면 정수,`from`있으면 string,`to`있으면 string,`mode`있으면 `"neutral"`/`"cooperation"`/`"conflict"`(7.2절 enum),`tag`있으면 string,`untag`있으면 string — 전부 선택, `subject` 필드 자체가 없음}. `exp`{`amount`0 이상 정수 필수}. `proficiency`{`id`string 필수,`add`0 이상 정수 필수}. `skill`{`skill`string 필수,`add`있으면 정수(기본값 1)}. `trait`{`trait`string 필수,`remove`있으면 boolean}. `unlock`{`id`string 필수}. `case`{`case`string 필수,`stage`string 필수, subject 없음}. `fact`{`fact`string 필수,`set`반드시 존재(값 자체는 무엇이든 허용, `undefined`만 오류), subject 없음}. `rumor`{`rumor`string 필수,`subject`/`from`있으면 string,`observe`있으면 boolean,`source`/`confidence`있으면 각각 string/정수 — **추가로** `from`이 없으면(학습·관찰 모드) `source`와 `confidence` 둘 다 존재해야 하고, `from`이 있으면서 동시에 `observe:true`면 오류(`rules.js`의 실제 `applyRumorEffect` 순서 그대로)}. `narrate`{`textId`string 필수, subject 없음}. `choice`{`choice`string 필수,`sourceId`있으면 string, subject 없음}. `handler`는 D-56 (4)로 이미 구현. **Condition**: 각 op가 최소 하나의 필드가 없으면 항상 거짓으로만 평가되어 값을 갖지 못하는 경우를 검사한다 — `stat`{`stat`string 필수}, `flag`{`key`string 필수}, `signal`{`key`string 필수}, `skill`{`skill`string 필수}, `trait`{`trait`string 필수}, `item`{`item`string 필수}, `fact`{`fact`string 필수}, `unlock`{`id`string 필수}. `rumor`는 `evaluateRumorCondition`이 실제로 쓰는 우선순위 그대로 `rumor` 또는 `fact` 중 **최소 하나**가 string이면 되고 (둘 다 줘도 오류 아님, `rumor`가 우선), 둘 다 없으면 오류. `day`는 `evaluateDayCondition` 그대로 `hourFrom`/`hourTo`가 **둘 다 있거나 둘 다 없어야** 하며 하나만 있으면 오류. `location`은 `evaluateLocationCondition` 그대로 `at`(string) 또는 `in`(배열) 중 **최소 하나**가 있어야 한다. `case`는 `evaluateCaseCondition` 그대로 `case`(string 필수)와 함께 `stage` 또는 `in` 중 최소 하나가 있어야 한다. `relation`/`money`는 현재 구현이 모든 인자를 선택으로 허용하므로(빈 `{op:"relation"}`도 공허하게 참, D-54) 추가 필수 필드가 없다 — 새로 발명하지 않는다. `and`/`or`/`not`/`handler`는 D-56에서 이미 구현했으므로 변경하지 않는다. 이 검사들은 모두 값을 읽기만 하며 `applyOneEffect`/`evaluateCondition`을 호출하지 않는다(런타임 semantics 불변) |
| D-58 | validateData의 Effect/Resolvable **콘텐츠 ID 참조 무결성** 검증 범위 (D-56 (2)의 후속, `web/v2/core/*.js` 전체 재조사) | **확정(V2-Core-18)**: 판단 기준은 "코드가 그 필드를 문자열로 읽는가"가 아니라 **"참조 대상이 없을 때 계약이 이미 명시적으로 우아한 폴백(정의를 못 찾으면 그대로 진행)을 선언했는가"**다 — 선언되어 있으면 그 자체가 "존재하지 않아도 된다"는 계약이므로 검사하지 않는다(검사하면 오히려 이미 확정된 기능을 깨뜨리는 새 제약이 된다). 선언이 전혀 없고 결과가 이미 확정된 다른 메커니즘(reject code, pending 게이트)을 거쳐 추적 가능하면 검사한다(B). 조사 결과표: `stat`/`skill`/`trait`/`proficiency`/`unlock` Effect가 참조하는 `growthSystems[system].{stats,skills,traits,proficiencies,unlocks}` 정의 — **제외**(§4.2가 각각 "정의를 못 찾으면 clamp 없이 적용"/"상한 없음"/"exclusive 처리 없이 추가만"이라고 명시적으로 선언, 콘텐츠를 단계적으로 채워나가는 것을 의도적으로 지원하는 기능). `exp` Effect의 `levelRewards[level]`/`level.expTable` — **제외**(§6.4.1 "level-less growth system: exp only"가 이미 명시적 폴백이고, 특정 레벨에 보상이 없는 것도 정상). `rumor` Effect의 `rumor`→`data.rumors[rumor]` — **제외**(§8.3 원문이 "참조 대상이 없을 뿐 스키마 오류가 아니다"라고 이미 명시, D-29). `item` Effect의 `item`→`data.items` — **해당 없음**(`applyItemEffect`는 `ctx.data`를 전혀 읽지 않는다; `data.items`는 `check()`의 modifier 계산에서만, 그것도 액터의 실제 인벤토리 키를 순회하며 참조하는 동적 조회이고 정의가 없으면 `?? 0`/합 0으로 우아하게 폴백한다 — 정적으로 검사할 authored 참조 자체가 없다). `fact` Effect의 `fact`→`data.facts` — **해당 없음**(`applyFactEffect`는 `ctx.data`를 전혀 읽지 않는다; `data.facts[id].initial`은 §8.1에 스키마만 있고 이를 읽어 시딩하는 런타임 코드가 아직 없으므로 "사전 정의 필수"를 강제할 근거가 없다). `case` Effect의 `case`/`stage` — **해당 없음**(`data.cases[id]`에 대한 스키마 자체가 계약 어디에도 없다, D-56이 이미 확인). `relation`/`rumor`의 `from`/`to`/`subject`(actor 참조), `rumor`/`choice`의 `source`/`sourceId`(불투명 라벨, §4.2가 "엔진이 자동으로 추론하지 않는다"고 명시) — **제외**(둘 다 사용자 지시로 임의 결정 금지 대상). opposed check의 `difficulty.opposed.stat`/`.skill` — **제외**(growth 정의와 같은 `?? 0` 우아한 폴백, throw 없음). **검증하기로 확정한 두 가지(B)**: (1) `choice` Effect의 `choice` 필드 → `data.choices`에 그 키가 존재해야 한다. 명시적 폴백 선언이 어디에도 없고, 없을 때의 결과가 이미 확정된 메커니즘으로 완전히 추적된다 — `choice` Effect는 조건 없이 `state.pending={kind:"choice",choiceId}`를 설정하고(D-35), 이후 `step()`의 pending 게이트(D-48)는 `choose` 외의 모든 action을 거부하며, `resolveChoose`(D-35/D-51)는 `data.choices[choiceId]`가 없으면 `option`을 찾지 못해 항상 `unknown_option`으로 reject한다 — 즉 존재하지 않는 `choice` 참조는 플레이어를 영구적으로 벗어날 수 없는 pending 상태에 가두는, 이미 코드로 확정된 결과이지 새로 발명한 정책이 아니다. (2) Resolvable(`actions`/`choices[*].options[*]`/`events`)의 `check.difficulty`가 **string**이면, `rules.js`의 기존 순수 함수 `checkRules(ctx)`를 `{data}`만으로 그대로 호출해 **실제로 병합된** `difficulties` 객체(데이터가 `difficulties`를 통째로 제공하면 기본값 전체를 대체하고, 없으면 `{easy:8,normal:11,hard:14,extreme:17}`을 그대로 쓴다, §5.3/checkRules 원문)에 그 이름이 없으면 오류로 잡는다 — `resolveDifficulty`가 실제로 `throw`하는 조건(§5.5) 그대로이며, 병합 로직을 다시 구현하지 않고 기존 순수 함수를 그대로 재사용해 로직이 어긋날 위험이 없다. difficulty가 정수이거나 `opposed` 객체(동적 `subject` 포함)인 경우는 검사하지 않는다(정적으로 확정할 대상이 없거나 사용자 지시로 제외된 동적 참조). ID 형식 검사(D-56 (1))와 이번 참조 존재 검사는 **완전히 분리된 오류**로 남긴다 — 형식이 맞지 않는 ID는 이미 D-56이 별도로 잡으므로, 이번 검사는 형식이 유효한 ID가 실제로 target collection에 있는지만 본다(같은 오류로 합치지 않는다) |
| D-59 | `data.cases[*].stages[*].completeWhen`, `data.rules.relation.*.when` — 스키마 부재 확정 종결 (C, D-56/D-58에서 반복 확인된 항목의 재조사) | **재확인, 여전히 C(blocker)(V2-Core-19)**: 이번 라운드에서 CORE_CONTRACTS.md 전체를 `completeWhen`/`stages`/`data.rules.relation`으로 grep해 다시 훑었다 — 두 필드 모두 §3.3의 "사용처" 표(한 줄, `위치`/`contextKind` 두 칸)에 **각각 정확히 한 번**만 등장하며, 그 외 어디에도 JSON 예시, 필드 목록, "이유"/"확장" 설명이 없다. `stages`가 배열인지 객체인지, `s`가 인덱스인지 stage id인지, `completeWhen`이 하나의 Condition인지 여러 stage에 걸친 목록인지, `rules.relation`이 배열인지(§7.2 relation 값 자체와는 다른 무엇인지) 등 최소 구조조차 계약 어디에도 없다. `web/v2/core/engine.js`/`rules.js` 전체를 다시 grep해도 이 두 필드를 실제로 읽는 코드가 **전혀 없다**(런타임이 참고할 malformed 정책 자체가 없음 — D-57/D-58처럼 "이미 있는 코드를 그대로 옮긴다"는 방법을 쓸 수 없다). 테스트 fixture(`tests/v2/*.test.js`) 전체에도 사용 사례가 없다. 결론은 V2-Core-16/18과 동일: 최소 구조조차 지어내야 하므로 (C)다. **이 판단을 종결한다** — 실제 콘텐츠 작성이나 사건/퀘스트/관계 시스템 설계 시점에 `stages`/`completeWhen`/`rules.relation.*.when`의 구체적 스키마를 다루는 새 D-decision(§7/§9 관련 작업)이 먼저 필요하며, 그 전까지는 매 라운드 재조사해도 결론이 달라지지 않는다는 뜻이지 임의로 결정해도 된다는 뜻이 아니다. **후속(D-61/D-62, V2-Core-20)**: 두 필드 "자체"(completeWhen/when이 Condition 하나라는 사실)는 이후 확정됐다 — 아래 D-61/D-62 참고. 이 D-59가 종결한 것은 `stages`/`rules.relation`의 그 이상 구조(전이 실행 시점, effect, 우선순위, cadence 등)이며 그 부분은 여전히 blocker다 |
| D-60 | validateData의 **CheckSpec 자체 shape**과 **characterTemplate.locationId 필수 여부** — engine.js/`check()` 전수 재대조로 발견 (A) | **확정(V2-Core-19)**: D-57/D-58이 `applyOneEffect`/`evaluateCondition`/`resolveDifficulty`의 difficulty-이름 조회만 미러링했고, `check()`/`resolveDifficulty` 자신의 나머지 throw 조건과 `engine.js`의 `buildActorFromTemplate`은 아직 미러링하지 않았다는 것을 이번 라운드 전수 재대조(모든 `throw new` 위치 재확인)에서 발견했다 — 새 semantics가 아니라 이미 실행 가능한 throw 코드를 그대로 옮기는 것(D-57과 같은 방법). (1) **`resolvable.check`가 있으면 plain object여야 한다** — `check(spec, ctx)`의 첫 줄(`if (!isPlainObject(spec)) throw`) 그대로. (2) **`check.difficulty`는 정수 / 문자열(이름 존재 여부는 D-58이 이미 검사) / `{base:정수, opposed:object}` 중 하나여야 한다** — `resolveDifficulty`의 실제 분기(정수 반환 → 문자열 이름 조회 → `isPlainObject(d)&&isPlainObject(d.opposed)`면 `base` 정수 확인 → 셋 다 아니면 throw) 순서를 그대로 따른다. `opposed.subject`/`opposed.stat`/`opposed.skill`은 D-58과 같은 이유(동적 참조/우아한 폴백)로 검사하지 않는다 — `opposed.base`만 정수인지 본다(`resolveDifficulty`가 정확히 그것만 throw하므로). (3) **`characterTemplates[*].locationId`는 반드시 string이어야 한다** — `buildActorFromTemplate`의 첫 줄(`if (typeof template.locationId !== "string") throw`) 그대로. D-56/D-58은 "있으면 `data.locations`에 존재해야 한다"만 검사했고 "존재 자체가 필수"는 검사하지 않았던 gap이다 — 이번에 필수 여부(타입+존재)와 참조 무결성(대상 존재)을 하나의 조건문으로 합쳐 순서대로 검사한다(타입이 틀리면 참조 검사로 내려가지 않음, 같은 오류로 합치지 않는다는 D-58 원칙 유지). `kind`/`hp.max`/`money`/`inventory`/`growth`/`tags`는 `buildActorFromTemplate`이 전부 `?:` 우아한 기본값으로 처리해 throw하지 않으므로(D-58과 같은 "명시적 폴백은 검사하지 않는다" 원칙) 검사 대상에 넣지 않는다 |
| D-61 | `data.cases[id].stages[*].completeWhen` — 스키마 확정 (D-59가 blocker로 종결했던 두 항목 중 하나, 재검토) | **확정(V2-Core-20)**: `completeWhen`은 **Condition 하나**로 확정한다 — 생략 가능(생략하면 그 stage는 자동 완료 조건이 없다는 뜻), 존재하면 `evaluateCondition`이 그대로 받아들이는 Condition 객체여야 한다. 평가 문맥은 `contextKind:"world"`(§3.3 표, 사건 trigger/성장 해금과 같은 문맥)이므로 D-06의 player-context fact 금지는 적용하지 않는다 — `{"op":"fact",...}`가 그대로 허용된다. 새 quest-condition 시스템이나 새 Condition op를 만들지 않고 기존 `evaluateCondition`/`walkCondition`을 그대로 재사용한다. **이번 결정의 범위는 여기까지다**: `completeWhen`의 실제 평가 시점(언제 어떤 코드가 이 Condition을 부르는지), stage 전이/완료가 일어났을 때의 실행 semantics, `stages`가 배열이라는 것 외의 나머지 구조(각 stage의 다른 필드)는 새로 결정하지 않는다 — D-59가 이 부분에 대해 남긴 blocker는 그대로 유효하다(실제 콘텐츠/사건 시스템 설계가 필요하다) |
| D-62 | `data.rules.relation.*.when` — 스키마 확정 (D-59가 blocker로 종결했던 두 항목 중 나머지 하나, 재검토) | **확정(V2-Core-20)**: `data.rules.relation`은 ruleId를 키로 하는 객체이며, 각 rule의 `when`은 **Condition 하나**로 확정한다 — 생략 가능(생략하면 그 relation rule은 무조건 적용된다는 뜻), 존재하면 `evaluateCondition`이 그대로 받아들이는 Condition 객체여야 한다. 평가 문맥은 `contextKind:"world"`(§3.3 표)이므로 D-06의 player-context fact 금지는 적용하지 않는다. 기존 `evaluateCondition`/`walkCondition`을 그대로 재사용하고 새 Condition 체계를 만들지 않는다. **이번 결정의 범위는 여기까지다**: relation rule의 effect(무엇을 할지), 여러 rule이 동시에 참일 때의 우선순위, 실행 cadence(언제 평가되는지)는 새로 정의하지 않는다 — D-59가 이 부분에 대해 남긴 blocker는 그대로 유효하다 |

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
