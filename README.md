# TxtRPG

대규모 텍스트 RPG 프로젝트.  
**V2는 순수 게임 Core 위에 실제 RPG 시스템을 구축하고, 이를 세계관·정보·다회차 구조와 연결하는 방향으로 개발한다.**

## 현재 개발 단계

현재 기준 브랜치: `feature/v2-core`

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

현재 목표는 단순히 세계관 콘텐츠를 늘리는 것이 아니다.  
**실제 RPG 플레이를 성립시키는 Character / Stats / Skill / Trait / Talent / Mastery / Technique / Loadout / Resource / Action / Combat / Item / Growth / Exploration 등의 시스템을 Core 위에 구축하고 실제 세계와 연결하는 것**이다.

---

# 1. 게임의 핵심 철학

TxtRPG는 세계가 제공하는 정보를 이용해 플레이어가 스스로 판단하고 목표를 형성하는 RPG를 지향한다.

핵심 루프:

```
Information
    ↓
Judgment
    ↓
Action
    ↓
Check / Resolution
    ↓
Consequence
    ↓
World Change
    ↓
New Information
    ↓
Growth / New Possibility
    ↺
```

정보는 단순 lore가 아니라 행동 가능성·위험 판단·목표 형성에 영향을 주는 플레이 자원이다.

---

# 2. 장기 세계관 방향

TxtRPG의 장기 세계관은 **여러 장르와 세계가 공존하고 연결되는 대규모 멀티버스/다차원 세계**를 목표로 한다.

예정되는 세계와 장르:

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

각 세계는 독립적인 성장 방식과 **Combat Grammar**를 가질 수 있다.

장기적으로 플레이어는 한 세계의 능력·성장체계를 다른 세계로 가져가고 조합하는 구조를 목표로 한다.

---

# 3. RPG 시스템 설계 언어

최근 실제 게임 리서치에서 반복적으로 확인된 구현 패턴을 기준으로 RPG를 단순한 `Stats + Skill` 목록으로 취급하지 않는다.

핵심 모델:

```
Capability
    ↓
Availability
    ↓
Loadout
    ↓
Condition
    ↓
Cost
    ↓
Modifier
    ↓
Technique / Combo
    ↓
Resolution
    ↓
Consequence
    ↓
Progression
```

장기 Character 상태 후보:

```
Stats
+ Skill
+ Trait
+ Talent
+ Mastery
+ Wound / Mental
+ Relations
+ Equipment
+ Knowledge
```

기본 역할:

| 요소 | 핵심 질문 | 기본 역할 |
|---|---|---|
| Trait | 나는 어떤 존재인가? | 정체성·성향·규칙 변형 |
| Talent | 무엇에 얼마나 뛰어날 가능성이 있는가? | 적성·잠재력·성장 경향 |
| Skill | 무엇을 할 수 있는가? | 실제 능력·기능·지식 |
| Technique | 그 능력을 어떻게 사용하는가? | 폼·수법·응용 |
| Mastery | 실제로 얼마나 잘하는가? | 실행 품질·숙련 |
| Modifier | 기존 규칙을 어떻게 바꾸는가? | 수치/조건/상호작용/계산 변경 |
| Loadout | 무엇을 지금 사용할 수 있는가? | 장착·슬롯·Capacity·호환성 |
| Resource / Cost | 무엇을 지불하는가? | HP·Mana·Energy·Time·Risk 등 |

세부 semantics는 실제 구현 필요가 생길 때 결정한다.

---

# 4. RPG 시스템의 9개 설계 축

1. **규칙 변형**
2. **전투 문법**
3. **스탯·정보**
4. **세계 시스템**
5. **심리·성격**
6. **신체·부상**
7. **사회·관계**
8. **Loadout·제약**
9. **자원·대가**

모든 축을 즉시 구현하지 않는다. 현재 vertical slice에 필요한 축만 단계적으로 도입한다.

---

# 5. 세계별 Combat Grammar

공통 Core가 모든 세계를 동일한 전투 공식으로 강제하지 않는다.

Core는 가능한 한 다음과 같은 추상 요소를 제공한다.

`Resource / Requirement / Cost / Condition / Capability / Mastery / Technique / Effect / Counter / Event`

세계가 정의할 수 있는 예:

### 판타지
무기 / 마법 / 속성 / Mana / Spellcraft / Enchantment

### 무협
내공 / 경맥 / 심법 / 초식 / 무공 / 경지 / 기혈

### SF
무기체계 / 탄약 / 전술 AI / Shield / Heat / Targeting

### 사이버펑크
Implant / Hack / Program / Power / Heat / Cybernetic Reflex

### 헌터·탑
Skill / Trait / Rank / Cooldown / Boss Mechanic / Dungeon Rule

### 성좌·시스템
Contract / Buff / Requirement / External Resource / System Rule

장기적으로 서로 다른 세계의 전투·성장 grammar를 습득하고 조합할 수 있어야 한다.

---

# 6. 실제 RPG 시스템의 개발 범위

1. Character
2. Stats / Skill
3. Action / Check
4. Combat
5. Inventory / Item
6. Growth / Mastery
7. Exploration
8. Relationship / Reputation
9. Goal / Quest
10. Death / Successor / Multi-run
11. Trait / Talent / Modifier
12. Equipment / Loadout
13. Resource / Cost
14. 세계별 Combat Grammar

구현 순서는 고정하지 않는다. 실제 선행조건과 현재 repository 상태에 따라 **하나의 bounded vertical slice**를 선택한다.

---

# 7. RPG와 세계를 연결하는 핵심 루프

```
Information
→ Judgment
→ Action
→ Check / Resolution
→ Consequence
→ World Change
→ New Information
→ Growth / New Possibility
```

전투도 동일한 상위 루프에 포함된다.

---

# 8. V2 Core

```
step(state, action, data)
→ { state, events }
```

Core는 순수 함수 기반이며 브라우저/저장소 API에 직접 의존하지 않는다.

주요 구성:

- `web/v2/core/rng.js`
- `web/v2/core/rules.js`
- `web/v2/core/engine.js`
- `web/v2/storage/idb.js`
- `web/v2/data/world.js`
- `web/v2/ui/app.js`

---

# 9. 현재 구현된 RPG 기반

현재 V2 세계 데이터팩과 Core에는 다음 기반이 연결되어 있다.

- 캐릭터 생성 / 생존 / 사망
- HP
- 시간 진행
- 위치 기반 행동 제한
- Action Requirement
- Check 기반 판정
- Item
- Money
- Skill / Practice (연습(proficiency)이 20점마다 Skill 랭크를 올리고 판정은 Skill만 읽는다: `investigation`, `swordsmanship` — 이중 계산 없음)
- Growth System 데이터 구조
- Relation / 조직 Relation
- Flag / Signal
- Fact / Rumor
- Event / Trigger
- Choice / Pending
- Consequence
- Character Succession
- HP / 생사 관측 (`hp` selector, `alive` Condition — 전투 승패와 이후 부상·빈사 조건의 기반)
- Trait / 시작 배경 (정찰자: night vision이 폐허의 등불 조건을 대신함 — New Game과 후계자 시작에서 선택) 와 Mastery tier 표시 (Untrained / Novice / Apprentice / Adept, 표시 전용)
- 평판 (원로의 신뢰: 의미 있는 사건마다 캐릭터당 한 번만 오른다 — 잡담·반복 질문으로는 오르지 않음. 신뢰 15 이상이면 두목의 오래된 상처 소문을 듣고, 그 소문이 전투 선택지 「그의 오래된 상처를 노린다」(난이도 9)를 연다)
- Resource (성장체계에 속한 소모 자원: stamina 6 — 받아치기 3, 오래된 상처 2, 정면 공격·도주 0, 마을 휴식으로 회복. 이전 save는 가득 찬 것으로 읽음)
- Talent (성장 경향: Trait의 `practice` 보너스로 표현 — 정찰자의 조사 Talent는 조사 연습마다 +2. 판정 보정이 아님)
- Equipment (소지품과 장비를 구분: slot이 있는 아이템을 장착해야 효과 — 철검을 들면 「철검으로 베어 든다」가 열림. 등불 같은 일반 아이템은 보유만으로 그대로)
- NPC Capability (NPC도 같은 Capability 언어 사용: 두목은 자기 stamina로 강타를 씀 — 깨끗한 타격에서 피해 +1, 한 싸움에 최대 두 번)
- Integrated Combat 검증 (한 전투에서 Talent·Skill·Mastery·Equipment·Resource·Technique·NPC capability가 함께 작동 — save/load 포함)
- World Grammar 이식성 검증 (엔진 수정 없이 data만으로 쓴 두 번째 무협 세계가 qi·Talent·부적 slot·NPC 기술로 동작)
- Vertical Slice 2 「흐려진 우물」 1단계 — 발견 (우물 살피기 PER, 시장의 약초꾼 대화와 1회 신뢰, 근원을 알아야 열리는 숲속 샘, 판정이 있는 독기 이벤트 CON, 샘 조사 — 엔진 변경·version 변경 없음, 0.3.0 save 그대로 플레이)
- Vertical Slice 2 2단계 — 약초학 (정화초 채집: WIS + 새 기술 `herbalism`, stamina 2 소모 — 전투 밖의 자원 사용; 약초꾼의 1회 강습 은화 2로 herbalism 1; 정화초 2개로 샘 정화제)
- Vertical Slice 2 3단계 — 해결과 그 세계 (자기가 찾은 원인과 정화제로 샘을 정화 → 사건 해결, 독기 정지; 마을이 맑아진 우물을 봄; 우물과 약초꾼이 후계자에게도 바뀐 세계를 말함; 감사는 정화한 캐릭터에게만 한 번)
- Vertical Slice 2 통합 검증 (결정적 플레이 정책으로 두 이야기를 한 세계에서: 한 캐릭터가 두목 전투와 우물을 모두 해결 / 샘에서 쓰러진 캐릭터의 이야기를 후계자가 이어 해결 — Node와 Chromium, save/load 포함)
- Vertical Slice 3 「세계의 연속성과 결과」 1단계 — 샘의 화살 (은신처를 아는 캐릭터만 샘의 사체에서 도적단의 화살을 알아봄; 원로에게 한 번 전하면 원로·약초꾼이 누구에게나, 후계자에게도 바뀐 이야기를 함 — 두목의 생사에 따라 다르게)
- Vertical Slice 3 2단계 — 샘의 이야기 (정화가 역사가 됨: 약초꾼의 소식이 이틀 뒤 시장의 "샘의 정령" 전설로 바뀌고, 정화된 샘에서 진실을 본 캐릭터가 세계에 한 번 바로잡음 — 후계자도 듣고 직접 바로잡을 수 있음)
- Vertical Slice 3 3단계 — 마을의 신뢰 (두 사건을 해결하고 원로·약초꾼 모두의 신뢰를 얻은 캐릭터는 마을의 이름으로 감사를 받음 → 등불 2, 약초 연고 1의 가격; 세계는 그 일을 기억해 후계자에게도 이야기함; 약초꾼에게 정화초를 나눠 주는 선택)
- Vertical Slice 3 통합 검증 (한 캐릭터가 두 이야기의 모든 결과를 만들고, 쓰러진 뒤 후계자가 바뀐 세계를 듣고 스스로 마을의 신뢰를 다시 얻음 — 결정적 플레이 정책, Node와 Chromium, save/load 포함)
- Vertical Slice 4 「세계의 지평」 1단계 — 옛 갈림길 (도적이 사라지면 마을 밖 길이 열림; 이정표와 원로가 물레방아 마을·강나루·강 건너 왕도의 길을 알려 줌; 갈림길에는 두목의 운명이 남음 — 살아 있으면 강나루 쪽 발자국, 쓰러졌으면 버려진 통행세 초소)
- Vertical Slice 4 2단계 — 물레방아 마을 (지역의 두 번째 마을; 방앗간 주인이 두목의 생사에 따라 다른 지역 소식을 전하고, 정화초를 사며, 밀가루 배달로 두 마을의 교역이 열려 장터가 물레방아 빵을 팖 — 후계자에게도)
- Vertical Slice 4 3단계 — 강나루와 바깥 세상 (길이 쓰이면 플레이어와 무관하게 사흘마다 상단이 와 왕국의 소식이 바뀜; 뱃사공이 소식과 두목의 도강을 전함; 뱃삯 또는 원로의 통행 편지로 강을 건너면 길목의 게시판이 왕도·징집령·수배서/안전한 길·마을의 이름을 알려 줌)
- Vertical Slice 4 통합 검증 (경로 탐색 플레이 정책으로 마을 → 지역 → 바깥 세상을 한 세계에서: 두목이 살아 있는 세계, 그 세계의 후계자, 마을의 감사를 받은 정찰자의 세계 — Node와 Chromium, save/load 포함)
- Vertical Slice 5 「성읍」 1단계 — 성읍으로 가는 길 (강 건너 길목에서 넓은 길을 따라 영주의 성읍으로; 포고판에서 영주의 징집령을 원천에서 읽음; 변경의 소식은 상단이 북으로 간 뒤에야, 전설이 된 꼴로, 바로잡히지 않은 채 닿고, 변경의 영웅은 이름 없이 별칭으로만 알려짐 — 정보의 기울기)
- Vertical Slice 5 2단계 — 성읍의 시장 (성읍의 상인이 같은 물건을 다르게 침: 강 남쪽의 정화초는 물레방아 마을보다 비싸게 사고, 북쪽의 철검은 변경 장터보다 싸게 팖 — 길을 오갈 이유)
- Vertical Slice 5 3단계 — 상단의 호위 (상단 조합의 서기가 상단마다 호위 하나를 구함: STR + 검술 판정, 스태미나 2, 단계별 품삯과 검술 숙련, 상단과 함께 강 건너 길목까지 — 다음 상단이 올 때까지 일은 없음)
- Vertical Slice 5 통합 검증 (경로 탐색 플레이 정책으로 변경에서 성읍까지 한 세계에서: 두목이 살아 있는 세계, 그 세계의 후계자, 감사받은 정찰자의 세계 — Node와 Chromium, save/load 포함)
- Vertical Slice 6 「소식의 길」 1단계 — 바로잡힌 말이 북으로 (마을에서 바로잡힌 이야기도 길이 쓰이는 한 상단의 주기만큼 늦게 성읍에 닿고, 그 뒤 성읍의 포고판은 전설 대신 바로잡힌 말을 전함)
- Vertical Slice 6 2단계 — 나르는 사람 (전설을 듣고 진실을 직접 본 사람이 성읍의 포고판 앞에서 전하면 바로잡힘이 상단보다 먼저 성읍에 닿음 — 마을이 몰라도, 후계자에게도)
- 판타지 공통 Stats STR / DEX / CON / INT / WIS / PER (조사 INT, 대면 WIS, 공격 STR, 받아치기 DEX — 모두 opposed 판정; 우물·샘 조사 PER, 독기 CON)
- 첫 Combat (도적 두목과 싸운다: 교환마다 opposed 판정, 받아치기 Technique, 도주, 승리/패배의 세계 결과 — 전투 엔진 없이 choice/check/outcomes)
- NPC Actor (도적 두목: player와 같은 Actor record, `kind:"npc"`; 두목 대면 판정이 그의 WIS에 대한 opposed check)
- Save / Load
- 결정론적 RNG
- Data Compatibility

현재 구현은 완성된 RPG가 아니라 **RPG 시스템 확장을 위한 최소 기반**이다.

---

# 10. 현재 세계 수직 슬라이스

첫 세계는 작은 판타지 마을과 폐허 시나리오다.

```
마을
 ↓
원로와 대화
 ↓
소문 획득
 ↓
시장
 ↓
필요한 준비
 ↓
폐허 탐색
 ↓
위험 / HP 손실
 ↓
조사
 ↓
정보 확인
 ↓
원로 보고
 ↓
관계 변화
 ↓
두목 대면 (또는 두목과의 전투)
 ↓
도적단 상태 변화
 ↓
시장 후속 결과
```

역사/정보 vertical slice:

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
 ↓
원로에게 바로잡아 전함
 ↓
원로가 이후 모두에게 사실을 전함 (후계자 포함)
```

이를 통해 정보의 출처·신뢰도·시간·세계 변화·후계자의 독립적인 발견을 검증했다.
캐릭터가 발견한 진실은 행동으로 이어지고, 그 행동은 세계의 기록을 바꿔 다음 세대가 듣는 정보를 바꾼다. 지식은 상속되지 않는다.

---

# 11. 다회차와 세계/개인 경계

V2는 세계 상태와 캐릭터 개인 상태를 분리한다.

### Character-owned
- 캐릭터 상태
- 개인 Knowledge
- 플레이어와 연결된 Relation
- 개인 Inventory
- 개인 Growth
- 개인 능력/숙련

### World-owned
- World Facts
- World Flags
- Cases
- Fired Event History
- World Time
- 세계 개체 간 Relation

> **세계의 역사는 계속되지만 캐릭터의 기억은 자동으로 계속되지 않는다.**

---

# 12. 실제 게임 리서치에서 도출한 구현 원칙

- 기본 Capability와 Trait/Talent/Mod/Boon/Affinity 같은 Modifier를 분리한다.
- 능력의 획득과 실제 사용 가능 상태를 분리한다.
- Slot·Capacity·Equipment·Prerequisite·Practice 같은 제약이 Build의 의미를 만든다.
- Combo·Gauge·Cooldown·Position·Resource가 Skill의 사용 가능성 자체를 정의할 수 있다.
- 조합은 별도 메커니즘으로 구현할 수 있다.
- Modifier는 단순 수치 증가뿐 아니라 규칙 변경·행동 변환·Resource 생성·Counter·Condition 추가가 가능하다.
- Run/전투/영구 Meta의 지속성을 분리할 수 있다.
- HP 하나에 모든 심리·부상·생존 상태를 압축할 필요가 없다.
- 관계는 숫자뿐 아니라 Trust·Obligation·Faction·Access 같은 질적 상태를 가질 수 있다.
- 세계의 시간·역사·관계와 캐릭터 성장의 지속성을 서로 다른 층으로 둘 수 있다.

이는 구현 명령이 아니라 **향후 시스템 설계를 판단하는 기준**이다.

---

# 13. 세계관·신화 연구

장기 세계관에서 **인간 → 영웅 → 전설 → 신화 → 초월체 → 성좌 → 신격**이 되는 과정을 연구한다.

## 13.1 1차 조사에서 설정한 공통 프레임

```
창세/우주관
→ 인간의 기원
→ 문명/왕조의 기원
→ 영웅 서사
→ 시련/희생
→ 죽음·저승·귀환
→ 불멸/신격화
→ 사회·왕권·질서
→ 종말/재창조
```

연구 후보:

```
인간
→ 경험
→ 능력
→ 숙련
→ 업적
→ 전설
→ 신화
→ 인정/숭배
→ 권능/권위
→ 초월
```

## 13.2 2차 조사 결과: 초월을 단일 성장치로 만들지 않는다

실제 신화·종교 연구에서 다음 현상은 서로 구별된다.

```
Power
Mastery
Deed
Recognition
Memory
Authority
Worship
Domain
Immortality
Transcendence
```

즉:

`Power ≠ Immortality ≠ Worship ≠ Apotheosis`

강한 인간이 반드시 신격이 되는 것은 아니며, 불멸을 얻는 것과 숭배 대상이 되는 것 역시 같은 사건이 아니다.

## 13.3 세계별 Transcendence Grammar

공통 Combat Grammar와 별도로 각 세계가 서로 다른 초월 규칙을 가질 수 있다.

```
World
→ Transcendence Rules
→ Character Path
→ Social / World Consequence
```

연구된 대표 문법:

- 사후 신격화: 영웅 → 업적 → 죽음/사후 전환 → 기억·숭배 → 신격
- 신성 혈통/강림: 천상 계보 → 인간세계 진입 → 혈통/권위 → 영웅·건국자
- 불멸 탐구: 죽음 인식 → 탐색 → 시련 → 실패/획득 → 새로운 죽음의 해석
- 저승 통과: 상실 → 저승 → 규칙/시험 → 귀환/변화
- 우주질서 담당: 개인 → 질서와 결합 → 권능/책무 → 세계 수준 결과
- 신도 죽는 세계: 초월적 존재 → 운명/종말 → 죽음 → 세계 재생

## 13.4 신화와 세계 기억의 연결 가설

Caves of Qud의 절차적 역사 연구에서 중요한 추가 패턴을 확인했다.

```
World Event
→ Historical Record
→ Source / Interpretation
→ Player Knowledge
→ Recognition / Reputation
→ Authority / Domain
→ Possible Transcendence
```

실제 사건과 그 사건에 대한 **서술/기억**을 분리할 수 있다.

같은 역사적 사건도 서로 다른 기록이나 관점으로 표현될 수 있고, 역사적 인물의 행동은 지역·세력·유물·평판과 연결될 수 있다.

이는 현재 V2의 Fact / Rumor / Event / Relation 구조를 장기적으로 확장하는 연구 방향이다.

**새 History Engine을 지금 추가하라는 뜻은 아니다. 기존 계약으로 표현 가능한 범위에서는 Event / Fact / Rumor / Relation을 우선 재사용한다.**

상세 조사 인덱스:
`docs/world/mythology-transcendence-research.md`

---

# 14. 기술 원칙

```
YAGNI
→ 기존 코드 재사용
→ 표준 라이브러리
→ 브라우저 / 플랫폼 native
→ 기존 dependency
→ 최소 구현
```

---

# 15. 설계 결정 게이트

다음 사항은 근거 없이 자동 확정하지 않는다.

- 새로운 state semantics
- save format / migration
- RNG / seed semantics
- 새로운 Condition / Effect semantics
- scheduler / world tick
- inheritance / world-memory semantics
- server / worker authority boundary
- data-pack version compatibility
- 기존 Core로 표현할 수 없는 RPG semantics
- 신화/문명 연구를 정식 canon 또는 게임 규칙으로 승격하는 semantics

기본 순서:

`Evidence → Alternatives → Impact → Decision Record → Implementation`

---

# 16. 테스트 및 검증

V2는 Node와 실제 Chromium 브라우저 양쪽에서 검증한다.

최근 기준:

- V2 Node: **66/66**
- V1 regression: **41/41**
- V2 browser: **101/101**

각 RPG 기능도 관련 Node/browser/save-load/determinism 검증을 추가한다.

---

# 17. V1과 V2

V1 runtime이나 regression 기준을 V2 개발 편의를 위해 변경하지 않는다.

V2:

```
web/v2
tests/v2
docs/v2
```

---

# 18. 개발 브랜치와 Master Goal

현재 V2 개발 브랜치:

```
feature/v2-core
```

Master Goal:

**GitHub Issue #109 — V2 Core → RPG 플레이 기반 → 세계 확장 기반 완성**

현재 목표:

```
Core
→ RPG System
→ RPG + World Vertical Slice
→ 대규모 세계 / 콘텐츠 확장
```

---

# 19. 현재 다음 단계

Planner는 다음 순서로 gap을 평가한다.

1. Core blocker / contract 문제
2. Persistence / determinism
3. Verification gap
4. Architecture / semantics decision
5. RPG gameplay-system gap
6. RPG system + world vertical slice
7. Content / world depth
8. UI polish

RPG 시스템의 다음 작업은 단순한 독립 시스템 구현보다 다음을 관통하는 수직 슬라이스를 우선한다.

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

세계관 연구와 RPG 기반 구축은 병행하되, 근거 없는 canon 확정이나 대규모 구현을 앞서 진행하지 않는다.

---

# 20. 문서

### V2
- `docs/v2/architecture/CORE_CONTRACTS.md`
- `docs/v2/DEVELOPMENT_RULES.md`

### 세계관
- `docs/world/world-design-principles.md`
- `docs/world/source-analysis.md`
- `docs/world/mythology-transcendence-research.md`

과거 V1 Phase 문서는 개발 역사로 유지한다.

---

## 프로젝트의 장기 목표

TxtRPG는 단순한 텍스트 어드벤처가 아니라,

**정보를 수집하고 → 판단하고 → 행동하고 → 결과를 만들고 → 성장하고 → 다시 세계를 해석하는**

과정을 중심으로 하는 **대규모 다회차 텍스트 RPG**를 목표로 한다.

작은 판타지 마을에서 시작하지만 최종적으로는 서로 다른 장르·세계·성장 시스템·사회 구조가 연결되는 거대한 세계를 플레이어가 직접 탐험하고, 자신의 목표를 발견하며, 자신만의 역사를 만들어가는 구조를 지향한다.
