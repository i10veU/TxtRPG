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
export function applyEffects(effects, ctx)               // -> { state, events }  (ctx.state는 이미 복제된 작업 사본)
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
  실제로 몇 개의, 어떤 이벤트를 만들지는 Effect/Resolvable을 구현하는 시점(15절 작업 3)에 정한다 —
  예를 들어 여러 Effect를 하나의 도메인 이벤트로 묶거나, UI에 의미 없는 내부 변화는 이벤트를 아예
  만들지 않는 선택지를 열어 둔다. V2-Core-01에는 이 매핑 자체가 없다 (2.0절 — `wait`/`action.rejected`만
  존재).
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

- 형태: `{ "op": "<name>", ...인자 }`. 키 자체를 연산자로 쓰는 형식(`{"all": [...]}`)은 쓰지 않는다.
  - 이유: `op` 필드 하나로 검증과 분기가 가능하고, 인자 이름과 충돌하지 않는다.
- 평가: `evaluateCondition(cond, ctx) -> boolean`. 순수 함수이며 rng를 쓰지 않고 부수효과가 없다.
- `ctx = { state, data, actorId, targetId, contextKind }`
  - `contextKind`: `"player"` (행동/선택지/지역 requires, 플레이어에게 보이는 것) 또는 `"world"` (사건 trigger, NPC 규칙, outcome 분기).
- **subject 해석**: `"self"`(기본값) = ctx.actorId이며, trigger 문맥에서는 현재 플레이어 캐릭터다.
  `"target"` = ctx.targetId. 그 밖의 값은 명시적 엔티티 ID로 해석한다.
- **누락 참조**는 false 또는 0으로 평가하고 throw하지 않는다.
  예: 없는 flag는 `null`, 없는 signal은 0, 없는 관계 edge는 기본값으로 본다.
  - 이유: 아직 발생하지 않은 상태는 정상이다.
- **알 수 없는 op나 잘못된 인자**는 `validateData`에서 오류로 잡는다. 런타임에는 발생하지 않는다고 가정한다.
- 수치 비교 인자는 `min`, `max`(포함 범위)로 통일한다. 둘 다 없으면 "존재하거나 참인지"를 검사한다.
  동등 비교는 `eq`로 한다.
- 평가는 단락 평가(short-circuit)하며, 왼쪽부터 순서대로 진행한다.
- 생략된 requires는 true다.

### 3.2 연산자

| op | JSON 예시 | 평가 규칙 |
| --- | --- | --- |
| `all` | `{"op":"all","of":[C,C]}` | 모두 참이면 참. **빈 배열은 참** |
| `any` | `{"op":"any","of":[C,C]}` | 하나라도 참이면 참. **빈 배열은 거짓** |
| `not` | `{"op":"not","of":C}` | 부정 |
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

- 후보 목록에 없던 `unlock`, `case`, `money`를 추가한 이유:
  - `unlock`: 성장 해금으로 행동, 선택지, 시스템 접근을 게이팅하려면 필요하다 (레벨 게이팅의 대안).
  - `case`: 퀘스트 완료와 사건 진행 조건에 필요하다.
  - `money`: 구매 조건을 handler 없이 표현하려면 필요하다.
- `level` 연산자는 **의도적으로 두지 않는다**. 레벨로 과도하게 게이팅하지 않는다는 원칙을 스키마 수준에서 강제한다 (D-08).
- **확장 규칙**: 새 op를 추가하려면 (1) 이 표 갱신, (2) validateData 갱신, (3) 참/거짓/누락 참조 테스트가 함께 필요하다.

### 3.3 사용처 (모두 같은 평가기를 사용)

| 사용처 | 위치 | contextKind |
| --- | --- | --- |
| 행동 requires | `data.actions[id].requires` | player |
| 선택지 requires | `data.choices[id].options[].requires` | player |
| 지역 접근 | `data.locations[id].requires`, `links[].requires` | player |
| 사건 trigger | `data.events[id].trigger` | world |
| 퀘스트 완료 | `data.cases[id].stages[s].completeWhen` | world |
| 관계 규칙 | `data.rules.relation.*.when` | world |
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
- subject 해석은 3.1절과 같다 (`self` 기본값, `target`, 명시 ID).
- Effect 적용 컨텍스트: `ctx = { state(작업 사본), data, actorId, targetId, rng }`.
  적용 결과는 `{ state, events, rng }`이며, 엔진이 rng를 이어받아 다음 단계로 넘긴다.
- **함수를 JSON에 넣지 않는다.** 예외 로직은 `handler` op로만 호출한다.

### 4.2 연산자와 최소 스키마

| op | 최소 스키마 | 적용 규칙 | 이벤트 (visibility) |
| --- | --- | --- | --- |
| `stat` | `{op, stat, add}` | 기본 stat += add, 성장체계 정의의 [min,max]로 clamp | `stat.changed` (player) |
| `hp` | `{op, add}` | current += add, [0,max]로 clamp. 0이 되면 사망 처리(9절) | `hp.changed` (player) |
| `money` | `{op, add}` | 0 이상으로 clamp | `money.changed` (player) |
| `time` | `{op, minutes}` | minutes ≥ 0만 허용. 시간 전진, day 경계 기록 | `time.advanced` (player) |
| `move` | `{op, to}` | 위치를 직접 설정. 연결 검사는 하지 않음 (requires가 책임) | `actor.moved` (player) |
| `relation` | `{op, from?, to, add?, mode?, tag?, untag?}` | 7.3절 | `relation.changed` (player: 플레이어가 한쪽 끝일 때 / 그 외 internal) |
| `rumor` | `{op, rumor, source, confidence?, from?, observe?}` | 8.3절 | `rumor.learned` / `rumor.updated` (subject가 플레이어면 player) |
| `fact` | `{op, fact, set}` | facts[fact] = { value:set, since:minute } | `fact.changed` (**internal**) |
| `flag` | `{op, key, set}` | set이 null이면 키 삭제 | `flag.changed` (internal) |
| `signal` | `{op, key, add}` | 정수 카운트, 기본 add=1, 0 이상 | `signal.raised` (internal) |
| `item` | `{op, item, add}` | 수량 0 이상. 0이 되면 키 삭제 | `item.changed` (player) |
| `exp` | `{op, amount}` | 6.4절 레벨 곡선 적용 | `exp.gained` (+ `level.up`) (player) |
| `proficiency` | `{op, id, add}` | 6.4절 임계값 보상 | `proficiency.changed` (player) |
| `skill` | `{op, skill, add?:1}` | rank += add, [0,maxRank]. 0이면 삭제 | `skill.changed` (player) |
| `trait` | `{op, trait, remove?:false}` | 추가 또는 제거. `exclusive` 목록의 특성은 제거 | `trait.changed` (player) |
| `unlock` | `{op, id}` | 해금 추가 (idempotent) | `unlock.granted` (player. 이미 보유하면 이벤트 없음) |
| `case` | `{op, case, stage}` | 단계 설정. 없으면 생성 | `case.updated` (player) |
| `narrate` | `{op, textId}` | 상태 변화 없음 | `narration` (player) |
| `choice` | `{op, choice}` | `state.pending = {kind:"choice", ...}` 설정 | `choice.offered` (player) |
| `if` | `{op, when:Condition, then:[...], else?:[...]}` | world 문맥으로 Condition 평가 후 분기 | 자체 이벤트 없음 |
| `handler` | `{op, name, params}` | 4.4절 | handler가 반환한 이벤트 |

- 모든 Effect에 선택 인자 `subject`를 허용한다 (`fact`, `flag`, `signal`, `time`, `narrate`, `choice`, `case`는 세계 단위이므로 subject를 무시한다).
- `if`와 `narrate`, `choice`를 추가한 이유:
  - `if`: 조건 분기를 handler 없이 선언형으로 표현한다.
  - `narrate`: 텍스트 RPG의 서술을 데이터로 분리한다.
  - `choice`: 선택지 시스템을 사건과 연결한다.
- **확장 규칙**: 새 op를 추가하려면 이 표, validateData, 적용 및 경계값 테스트, 이벤트 visibility 결정이 함께 필요하다.

### 4.3 Effect 대상이 없을 때

- 정적 참조(데이터에 적힌 ID)는 `validateData`가 존재 여부를 검사한다.
- 동적 참조(`target`)는 step 2~4단계에서 존재하지 않으면 reject된다. 따라서 Effect 단계에서는 항상 존재한다고 가정한다.

### 4.4 예외 handler registry

- JSON에서의 형태: `{ "op":"handler", "name":"<namespace>.<name>", "params":{...} }`. Condition과 Effect 모두에 쓸 수 있다.
- 등록 위치: `web/v2/core/handlers.js`가 `Object.freeze`된 `{ [name]: { kind, fn } }`를 export한다.
  첫 handler가 필요해질 때 만든다.
  - 이유: 함수는 JSON에 들어갈 수 없고 `step(state, action, data)` 시그니처를 유지해야 하므로, 코드 모듈에서 정적으로 import한다.
  - 확장: 세계별 handler가 늘어나면 `handlers/<worldId>.js`로 나누고, registry가 병합한다 (D-04).
- 호출 계약:
  - Condition handler: `fn(ctx, params) -> boolean`
  - Effect handler: `fn(ctx, params) -> { state, events, rng }`
  - 순수하고 결정론적이어야 한다. 입력을 변경하지 않고, 금지 의존성(1.1절)을 쓰지 않으며, 난수는 `ctx.rng`만 쓴다.
- handler를 쓰려면 다음 **조건**을 모두 만족해야 한다:
  - (1) 기존 op와 `if`, `all/any/not` 조합으로 표현할 수 없다.
  - (2) 데이터 정의에 `"reason"` 문자열로 이유를 남긴다.
  - (3) 전용 테스트가 있다.
  - validateData는 `reason`이 없는 handler 참조와 등록되지 않은 name을 오류로 처리한다.
- handler는 **기본 경로가 아니다.** 같은 패턴의 handler가 3개 이상 생기면 선언형 op로 승격할지 검토한다.

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

- exp: 누적한 뒤 `expTable`을 넘은 만큼 레벨을 올린다. 한 번에 여러 레벨이 오를 수 있으며,
  레벨마다 `levelRewards[level]`을 순서대로 적용하고 `level.up` 이벤트를 발생시킨다.
- proficiency: 누적하면서 `thresholds[].at`를 **처음 넘을 때 한 번** effects를 적용한다 (이전 값 < at ≤ 새 값).
- 레벨은 **보상 트리거**이지 게이트가 아니다. 행동과 지역은 `unlock`, `skill`, `proficiency`, `stat`로 게이팅한다 (D-08).
  - 이유: 레벨 수치 경쟁이 세계 탐험을 막지 않게 하고, 성장이 새 행동과 선택지로 이어지게 한다.
  - 확장: 레벨 없는 성장체계(`level: null`)도 같은 스키마로 표현할 수 있다.
- 스탯 포인트를 직접 배분(플레이어가 선택)하는 기능은 스키마에 없다. 필요하면 `choice` Effect로 levelRewards에서 제시한다 (D-12).

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

- `add`: score에 더한 뒤 clamp한다.
- `mode`: 지정하면 설정하고, cooperation이면 cooperationCount, conflict이면 conflictCount를 +1 한다.
- `tag`/`untag`: tags에 추가하거나 제거하고, 정렬을 유지한다.
- 모든 적용 시 `lastDay`를 현재 day로 설정한다.
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

| 형태 | 의미 |
| --- | --- |
| `{op:"rumor", rumor:"rum_a", source:"npc_c", confidence:45}` | data 정의의 claim으로 학습한다 |
| `{op:"rumor", rumor:"rum_a", from:"npc_c"}` | **npc_c의 지식 항목을 복사**한다 (틀린 claim도 그대로 전파). confidence는 원본 값에서 `rules.rumor.relayLoss`만큼 줄인다 |
| `{op:"rumor", rumor:"rum_a", observe:true, source:"obs_loc_a"}` | **현재 fact 값을 claim으로 복사**한다 (직접 관찰). 기본 confidence는 높다 |

- 처음 학습: 항목을 생성한다. `firstSeenDay = lastSeenDay = day`, `confirmations = 1`.
- 새 출처로 재학습: `sources`에 추가, `confirmations += 1`, confidence를 증가(clamp)시킨다.
- 같은 출처로 재학습: `lastSeenDay`와 confidence만 소폭 갱신한다 (수치는 `data.rules.rumor`).
- 다른 claim을 들었을 때: 기존 항목의 claim을 **덮어쓰지 않는다.**
  confidence가 더 높은 쪽을 유지할지, 두 claim을 모두 보관할지는 D-14에서 정한다 (초기 제안: 더 높은 confidence가 이긴다).
- fact가 바뀌어도 누군가의 지식은 **자동으로 바뀌지 않는다.** 믿음은 낡을 수 있다.

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

- 트리거: `hp` Effect로 current가 0이 되면 **즉시** `alive=false`가 되고 `actor.died` 이벤트가 발생한다.
- 사망한 actor가 플레이어 캐릭터이면 `state.pending = {kind:"newCharacter"}`가 설정된다. 이 상태에서는 `startCharacter`만 허용한다.
- `startCharacter`:
  - `player_<characterCount+1>` actor를 생성한다. 초기값은 `data.characterTemplates[templateId]`에서 가져온다.
  - `state.player.actorId`를 갱신하고, `characterCount`를 +1 하며, `character.started` 이벤트를 발생시킨다.
- **세계는 유지된다**: time, facts, relations, knowledge, cases, 사망한 actor 기록이 그대로 남는다.
  NPC는 죽은 캐릭터와의 관계를 계속 "기억"한다.
- **계승은 하드코딩하지 않는다.** 계약은 다음과 같다:
  `data.rules.succession = [Effect, ...]`를 새 캐릭터 생성 직후 적용한다. 이때 ctx는
  `{ actorId: 새 캐릭터, targetId: 이전 캐릭터 }`다. **기본값은 빈 배열**이므로 아무것도 계승하지 않는다.
  - 이유: 무엇을 계승할지(지식, 관계, 성장 일부)는 아직 결정되지 않았다. 빈 Effect 목록이라는 확장 지점만 두면 엔진은 바뀌지 않는다.
  - 확장: "이전 캐릭터 지식 일부 계승" 같은 규칙은 handler(`succession.*`)나 향후 op로 데이터에서 켠다.
    세계 이동(멀티버스) 계승은 **별도 계약**으로 둔다. `succession`을 재사용하지 않는다 (D-16).
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

- 파일 분할(세계당 JSON 한 개인지 여러 개인지)은 콘텐츠가 생길 때 정한다. 여러 개로 나누면 UI 로더가 병합한다.
- `validateData(data)`는 다음을 검사하고 오류 목록을 반환한다: ID 형식, 참조 무결성, Condition/Effect op와 인자,
  handler 등록과 reason, player 문맥의 fact 사용 금지, Resolvable의 success/fail 필수 여부.
  **검증을 통과하지 못한 data로 step을 호출하는 것은 프로그래머 오류다.**
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
| Condition | 연산자마다 참, 거짓, 누락 참조 케이스를 검사한다. `all` 빈 배열은 참, `any` 빈 배열은 거짓이다. 알 수 없는 op는 validateData 오류다. player 문맥의 fact 사용도 validateData 오류다 |
| Effect | 연산자마다 적용, clamp, visibility를 검사한다. Effect ↔ Event 매핑은 구현 시점에 정한 실제 규칙(2.4절, D-20)을 기준으로 검사한다 (1:1을 전제하지 않는다). `if` 분기와 순차 적용(앞 결과를 뒤가 보는지)도 검사한다 |
| check | rng를 고정 주입해 tier 경계값(margin = 임계값, 임계값 - 1)을 검사한다. modifier 순서, opposed, 이름 difficulty, attempts와 retryPenalty, 누락 outcome 폴백도 검사한다 |
| Growth | 경계를 넘는 exp에서 다중 레벨업과 levelRewards를 검사한다. proficiency 임계값이 한 번만 발동하는지, skill maxRank, trait exclusive, unlock idempotent, 여러 성장체계 공존도 검사한다 |
| RelationshipGraph | 방향성, lazy 기본값, clamp, mode 카운트, lastDay, tags 정렬, Condition 참조를 검사한다 |
| Fact/Rumor | view에 facts와 정확성이 없는지, `from` 복사가 틀린 claim을 보존하는지, 서로 다른 출처일 때만 confirmations가 오르는지, fact가 바뀌어도 지식이 유지되는지, observe가 현재 fact를 복사하는지 검사한다 |
| 사망 | hp 0 → died, pending newCharacter, startCharacter 외 action은 reject, 세계 상태 유지, 옛 edge 유지, 기본 succession은 무계승 |
| step integration | fixture 시나리오: 이동 → 행동(check) → 선택지 → 사건 trigger → 관계와 소문 변화 → 사망 → 새 캐릭터 |
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
| D-09 | modifier 합 상한(먼치킨 성장과 판정 의미 보존 사이의 균형) | 초기 null. 밸런스 테스트 후 결정 |
| D-10 | 아이템 보정: 보유 기준인지 장착 기준인지 | 보유 기준으로 시작. 장착 슬롯은 필요해질 때 |
| D-11 | `attempts` Condition op 추가 여부 | maxAttempts가 실제 콘텐츠에 필요할 때 추가 |
| D-12 | 스탯 포인트 수동 배분 | 없음. 필요하면 levelRewards의 `choice`로 |
| D-13 | 조직 소속 표현 | `npc:org` edge의 `member` tag. 태도 전파 없음 |
| D-14 | 상충하는 claim 처리 | 더 높은 confidence 유지 (단일 항목) |
| D-15 | 잠긴 행동의 view 노출 | `showWhenLocked` 행동만, 이유 없이 표시 |
| D-16 | 세계 이동 계승 계약 | 사망 계승(`succession`)과 분리. 멀티버스 설계 단계에서 결정 |
| D-17 | 자아 상태 최소 스키마 | 세계관 설계 이후 결정. 그전까지는 tags/trait/relation으로 대체 |
| D-18 | 첫 세계 판타지 **콘텐츠** 작성 주체와 승인 절차 | 사람이 작성하거나 승인. 엔진 작업과 분리 |
| D-19 | check 수치 기본값(2d10, tiers 6/0/-3, difficulties) | 제안값으로 시작해 분포 테스트로 확정 |
| D-20 | Effect ↔ Event 매핑 규칙 (1:1 고정 여부) | 고정하지 않음. 참고용 기본값(4.2절 표)만 두고, 실제 규칙은 Effect 구현 작업(15절 작업 3)에서 정함 (2.4절) |

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
- 다음 작업 후보는 순서대로 다음과 같다. 각 작업은 사람의 승인 후 진행한다.
  - 작업 2: `rules.js` Condition과 validateData
  - 작업 3: Effect와 perform/move
  - 작업 4: check
  - 작업 5: Growth
  - 작업 6: Relation, Fact/Rumor
  - 작업 7: 사망과 view
