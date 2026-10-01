# TxtRPG

대규모 텍스트 RPG 프로젝트.  
**V2는 순수 게임 Core 위에 실제 RPG 시스템을 구축하고, 이를 세계관·정보·다회차 구조와 연결하는 방향으로 개발한다.**

## 현재 개발 단계

현재 기준 브랜치: `feature/v2-core`

V2는 다음 단계까지 구현되어 있다.

```
V2 Core
  ↓
실제 세계 데이터팩
  ↓
정보·관계·세력·시간·사건 수직 슬라이스
  ↓
다회차/후계자/세계 연속성 검증
  ↓
RPG 시스템 구축  ← 현재 단계
  ↓
RPG 시스템 + 세계 수직 슬라이스
  ↓
대규모 세계관·콘텐츠 확장
```

최근 V2 개발 기준점은 `6de17fb`이며, Core와 초기 세계 역사 수직 슬라이스가 병합된 상태다.

> 현재 목표는 단순히 세계관 콘텐츠를 늘리는 것이 아니다.  
> **실제 RPG 플레이를 성립시키는 Character / Stats / Skill / Action / Combat / Item / Growth / Exploration 등의 시스템을 Core 위에 구축하고 실제 세계와 연결하는 것**이다.

---

# 1. 게임의 핵심 철학

TxtRPG는 플레이어에게 정답이나 하나의 목표를 강제로 제공하는 게임이 아니라, **세계에서 정보를 얻고 스스로 판단하여 목표를 만들어가는 RPG**를 지향한다.

핵심 플레이 루프:

```
Information
    ↓
Judgment
    ↓
Action
    ↓
Consequence
    ↓
New Information
    ↓
Growth / New Possibilities
    ↺
```

플레이어가 세계를 관찰하고 얻은 정보는 단순한 lore가 아니라 실제 행동 가능성을 결정하는 게임 자원이다.

예:

```
소문을 듣는다
→ 다른 출처를 조사한다
→ 정보의 신뢰도를 판단한다
→ 위험을 감수하고 행동한다
→ 판정/전투/관계/세계 변화가 발생한다
→ 결과를 통해 새로운 정보를 얻는다
→ 새로운 목표와 행동 가능성이 생긴다
```

세계는 플레이어의 행동에 반응하며, 일부 변화는 시간이 지나면서 다른 장소·인물·조직에 영향을 준다.

---

# 2. 세계관 방향

TxtRPG의 장기 세계관은 **여러 장르와 세계가 공존하고 연결되는 대규모 멀티버스/다차원 세계**를 목표로 한다.

예정되는 세계와 장르의 범위에는 다음이 포함된다.

- 판타지
- 무협
- SF
- 사이버펑크
- 현대 판타지
- 중세 판타지
- 히어로
- 아카데미
- 배틀월드
- 이세계
- 탑 / 던전
- 게이트 / 헌터
- 다크 판타지
- 미스터리 / 괴이
- 대체역사
- 성좌
- VR 게임
- AI / 시스템 기반 세계

각 세계는 서로 다른 규칙과 성장 방식을 가질 수 있다.

플레이어는 한 세계의 성장 방식만 영구적으로 사용하는 것이 아니라, 세계를 이동하면서 **그 세계의 시스템과 능력을 획득하고 기존 성장과 결합**할 수 있는 방향을 목표로 한다.

첫 V2 세계는 시스템 검증을 위한 작은 판타지 마을/폐허 시나리오이며, 장기 세계관 전체를 축소한 테스트베드 역할을 한다.

---

# 3. RPG 시스템 개발 방향

현재부터 Master Goal의 핵심은 **RPG 시스템 구축**이다.

후보 시스템은 다음과 같다.

## Character

- 캐릭터 생성
- 생존/사망 상태
- 기본 능력치
- 캐릭터별 상태
- 후계자/다회차

## Stats / Skill

- 능력치
- 스킬
- 숙련도
- 판정 modifier
- 행동에 따른 능력 차이

## Action / Check

행동은 단순한 버튼 선택이 아니라 캐릭터의 능력·정보·환경에 의해 결과가 달라지는 RPG 행위가 된다.

기본 구조:

```
Action
→ Requirements
→ Check
→ Outcome
→ Effect
```

기존 V2의 Condition / Effect / Resolvable / RNG 계약을 최대한 재사용한다.

## Combat

전투 역시 독립적인 미니게임이 아니라 핵심 게임 루프에 포함된다.

```
정보 획득
→ 적/상황 판단
→ 행동 선택
→ 능력/스킬 판정
→ 피해/상태 변화
→ 승패
→ 보상/관계/세계 변화
→ 새로운 정보
```

초기 구현은 실시간 액션이 아니라 **선택 + 서술 + 결정론적 판정** 중심으로 구축한다.

## Inventory / Item

아이템은 단순 수집물이 아니라 플레이어가 선택할 수 있는 행동과 준비의 일부가 된다.

예:

```
정보 획득
→ 필요한 장비 판단
→ 아이템 획득/사용
→ 행동 가능성 변화
→ 결과 변화
```

## Growth

- 경험
- 스킬 숙련
- 능력치 성장
- 특성
- 세계별 성장 시스템
- 장기적인 캐릭터 변화

성장은 단순 숫자 상승이 아니라 **새로운 행동과 새로운 가능성을 열어주는 방향**을 목표로 한다.

## Exploration

탐험은 이동 자체보다 **발견과 정보 획득**을 중심으로 한다.

장소에는 숨겨진 정보, 위험, NPC, 사건, 자원, 선택지가 존재할 수 있으며 플레이어의 행동과 정보에 따라 접근 가능한 내용이 달라진다.

## Relationship / Reputation

관계는 단순 수치가 아니라 행동과 정보의 결과로 사용한다.

현재 V2에는 NPC/조직 relation edge, score, tag를 이용한 최소 관계 시스템이 이미 존재하며, 향후 이를 실제 RPG 의사결정과 성장에 연결한다.

## Goal / Quest

퀘스트는 정해진 목록을 소비하는 방식보다 플레이어가 세계에서 얻은 정보를 바탕으로 **스스로 목표를 발견하고 형성하는 구조**를 지향한다.

필요한 경우 명시적인 목표/퀘스트 UI를 제공할 수 있지만, 목표 자체가 플레이어의 선택을 대체하지 않도록 한다.

## Death / Successor / Multi-run

죽음은 단순한 Game Over가 아니다.

현재 V2는:

```
Character A
→ 사망
→ Character B 생성
→ 세계는 이전 상태 유지
→ 개인 정보/관계는 자동 상속하지 않음
→ B가 세계의 역사를 직접 발견
```

이라는 경계를 검증하고 있다.

장기적으로 다회차는 새로운 캐릭터와 새로운 정보·가능성을 통해 같은 세계를 다른 방식으로 경험하게 하는 핵심 시스템이 된다.

---

# 4. V2 Core

V2의 핵심 실행 계약:

```
step(state, action, data)
→ { state, events }
```

Core는 순수 함수 기반이며 브라우저/저장소 API에 의존하지 않는다.

## Core 구성

- `web/v2/core/rng.js`
  - 결정론적 RNG
  - FNV-1a
  - seed 파생
  - cursor 기반 난수
  - **보호 파일**

- `web/v2/core/rules.js`
  - Condition
  - Effect
  - Check
  - Resolvable
  - Data validation

- `web/v2/core/engine.js`
  - state 생성
  - action 처리
  - `step()`
  - `view()`
  - state validation
  - migration
  - data compatibility

- `web/v2/storage/idb.js`
  - IndexedDB 저장/로드 adapter
  - Core와 분리

- `web/v2/data/world.js`
  - 현재 실제 세계 데이터팩

- `web/v2/ui/app.js`
  - 브라우저 UI adapter

---

# 5. State / Data 분리

V2는 실행 중인 세계 상태와 세계 정의를 분리한다.

State에는 현재 게임의 변화가 저장된다.

예:

- actors
- rng
- time
- flags
- signals
- facts
- knowledge
- relations
- cases
- fired
- pending

Data에는 세계의 규칙과 콘텐츠가 저장된다.

예:

- worlds
- locations
- actions
- choices
- events
- items
- growth systems
- character templates
- facts
- rumors
- rules

둘 모두 JSON으로 직렬화 가능한 구조를 목표로 한다.

---

# 6. 현재 구현된 RPG 기반

현재 세계 데이터팩에는 이미 다음 RPG 기반이 들어 있다.

- 캐릭터 생성/생존/사망
- HP
- 시간 진행
- 위치 기반 행동 제한
- 행동 요구조건
- Check 기반 판정
- Item
- Money
- Skill / proficiency 데이터 구조
- Growth system 데이터 구조
- Relation
- 조직 Relation
- Flag / Signal
- Fact / Rumor
- Event / Trigger
- Choice
- Consequence
- Character succession
- Save / Load
- 결정론적 RNG

현재 구현은 완성된 RPG가 아니라 **앞으로 RPG 시스템을 확장할 수 있는 최소 기반**이다.

---

# 7. 현재 세계 수직 슬라이스

현재 첫 세계는 작은 판타지 마을과 폐허를 사용한다.

주요 흐름:

```
마을
 ↓
원로와 대화
 ↓
소문 획득
 ↓
시장
 ↓
필요한 장비 준비
 ↓
폐허 탐색
 ↓
위험 / HP 손실
 ↓
조사
 ↓
정보 확인
 ↓
원로에게 보고
 ↓
관계 변화
 ↓
두목과 대면
 ↓
도적단 조직 상태 변화
 ↓
시장에 후속 결과 발생
```

여기에 역사/정보 수직 슬라이스가 추가되어:

```
도적단 해산
 ↓
원로의 실제 소식
 ↓
시간 경과
 ↓
마을의 잘못된 전설
 ↓
폐허 재조사
 ↓
전설의 교정
```

이 흐름을 통해 **정보의 출처·신뢰도·시간·세계 변화·후계자의 독립적인 발견**을 검증했다.

---

# 8. 다회차와 세계/개인 경계

V2에서는 세계 상태와 캐릭터 개인 상태를 분리한다.

### Character-owned

- 캐릭터 상태
- 개인 knowledge
- 플레이어와 연결된 relation
- 개인 inventory
- 개인 성장

### World-owned

- world facts
- world flags
- cases
- fired event history
- world time
- 세계 개체 간 relation

후계자가 생성되어도 세계는 그대로 유지되지만, 전 캐릭터의 개인 정보나 관계를 자동으로 물려받지는 않는다.

따라서:

> **세계의 역사는 계속되지만 캐릭터의 기억은 자동으로 계속되지 않는다.**

이 구조는 향후 다회차 RPG의 핵심 기반이다.

---

# 9. 기술 원칙

TxtRPG는 불필요한 복잡성을 최대한 피한다.

개발 원칙:

**YAGNI → 기존 코드 재사용 → 표준 라이브러리 → 브라우저/플랫폼 native 기능 → 기존 dependency → 최소 구현**

주요 원칙:

- 새 subsystem보다 기존 계약 재사용
- 데이터 주도 설계
- 작은 수직 슬라이스 우선
- 결정론 유지
- 테스트 가능한 순수 Core
- V1 regression 보호
- 필요한 경우에만 추상화
- 실제 요구가 생기기 전 scheduler/history engine 등을 만들지 않음
- 설계가 필요한 semantics는 추측하지 않음
- 제품/게임 방향을 바꾸는 결정은 인간에게 decision point로 제시

---

# 10. 설계 결정 게이트

다음 항목은 실제 요구가 생겼을 때 근거를 확인하고 결정한다.

- 새로운 state semantics
- save format 변경
- migration semantics
- RNG / seed semantics
- 새로운 Condition / Effect semantics
- scheduler
- NPC autonomy / world tick
- inheritance / world-memory semantics
- server / worker authority boundary
- data-pack version compatibility

기존 Event / Condition / Effect / Data 조합으로 해결할 수 있다면 새 시스템을 만들지 않는다.

---

# 11. 테스트 및 검증

현재 V2는 Node와 실제 Chromium 브라우저 양쪽에서 검증한다.

주요 검증 범위:

- Core contract
- Condition / Effect
- RNG determinism
- State validation
- Data validation
- Save / Load
- Data compatibility
- World data
- Character lifecycle
- Death / successor
- Information flow
- Consequence
- Faction
- Persistence
- Core semantics
- Golden path
- 실제 IndexedDB
- Chromium browser smoke

현재 알려진 기준:

- V2 Node: **17/17**
- V1 regression: **41/41**
- V2 browser suite: **49/49**

CI에서도 Node/V1 regression/browser 검증을 수행한다.

---

# 12. V1과 V2

V1은 기존 게임 프로토타입 및 장기간 개발 기록으로 유지한다.

주요 V1 경로:

```
web/core
web/data
web/ui
web/worker
web/storage
web/index.html
web/game.js
tests/*.js
```

V2는:

```
web/v2
tests/v2
docs/v2
```

에서 독립적으로 개발한다.

V2 개발 편의를 위해 V1 runtime이나 regression 기준을 변경하지 않는다.

---

# 13. 개발 브랜치와 자동 개발

현재 V2 개발 브랜치:

```
feature/v2-core
```

Master Goal:

**GitHub Issue #109 — V2 Core → RPG 플레이 기반 → 세계 확장 기반 완성**

개발 루프:

```
Human Goal
 ↓
Master Goal
 ↓
AI Planner
 ↓
검증 가능한 하위 Issue
 ↓
Claude Code
 ↓
Test / Browser Verification
 ↓
PR / CI
 ↓
Merge
 ↓
Repository 재검증
 ↓
다음 Issue
```

인간은 제품 방향과 중요한 게임 디자인 결정을 담당하고, AI는 저장소 조사·작업 분해·구현·테스트·검증을 담당한다.

---

# 14. 현재 다음 단계

현재 가장 중요한 개발 방향은 **RPG 시스템 구현**이다.

Planner는 다음을 기준으로 다음 작업을 선택한다.

1. Core blocker / contract 문제
2. Persistence / determinism
3. Verification gap
4. Architecture decision
5. RPG gameplay-system gap
6. RPG system + world vertical slice
7. Content / world depth
8. UI polish

첫 RPG 시스템을 선정할 때는 단순히 시스템을 독립적으로 만드는 것이 아니라:

```
Character
→ Information
→ Judgment
→ Action
→ Check / Combat
→ Consequence
→ Growth
→ New Possibility
```

처럼 실제 플레이 루프를 관통하는 수직 슬라이스를 우선한다.

**모든 RPG 시스템을 한 번에 완성하는 것이 목표가 아니다. 확장 가능한 RPG 플레이 기반을 먼저 검증하는 것이 목표다.**

---

# 15. 문서

### V2

- `docs/v2/architecture/CORE_CONTRACTS.md`
- `docs/v2/DEVELOPMENT_RULES.md`

### 세계관

- `docs/world/world-design-principles.md`
- `docs/world/source-analysis.md`

### 과거 V1 개발 기록

- `docs/phase1-205-file-manifest.md`
- `docs/phase251-engineization.md`
- `docs/phase252-npc-simulation.md`
- `docs/phase261-information.md`
- `docs/phase271-case-causality.md`
- 기타 `docs/phase*.md`

과거 Phase 문서는 V1의 개발 역사이며, 현재 V2 설계의 직접적인 계약은 V2 문서와 실제 코드가 기준이다.

---

# 16. 실행

V1 프로토타입:

```
web/index.html
```

V2 프로토타입:

```
web/v2/index.html
```

V2 Node 테스트:

```
node tests/v2/run.js
```

V2 브라우저 테스트:

```
npx playwright test
```

세부 테스트 범위와 실행 명령은 저장소의 실제 테스트 파일 및 CI workflow를 기준으로 확인한다.

---

## 프로젝트의 장기 목표

TxtRPG는 단순한 텍스트 어드벤처가 아니라,

**정보를 수집하고 → 판단하고 → 행동하고 → 결과를 만들고 → 성장하고 → 다시 세계를 해석하는**

과정을 중심으로 하는 **대규모 다회차 텍스트 RPG**를 목표로 한다.

작은 판타지 마을에서 시작하지만 최종적으로는 서로 다른 장르·세계·성장 시스템·사회 구조가 연결되는 거대한 세계를 플레이어가 직접 탐험하고, 자신의 목표를 발견하며, 자신만의 역사를 만들어가는 구조를 지향한다.
