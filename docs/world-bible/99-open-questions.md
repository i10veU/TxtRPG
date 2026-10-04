# 미결 질문 — 소유자의 결정이 필요한 것

> 이 질문들은 World Bible이 **스스로 정하지 않는다.** 답이 정해지면 `00-governance/decision-log.md`에 WB 번호로 기록하고,
> 해당 문서의 등급을 바꾼다. 선택지가 적혀 있는 경우에도 그것은 예시일 뿐 제안된 정본이 아니다.
> 우선순위: **A** = Slice 4 이후의 세계 확장 전에 필요, **B** = 다음 지역·시대를 쓰기 전에 필요, **C** = 나중에.
> 우선순위 A 질문의 연구·대안·추천(`Draft`, 정본 아님): `canon-review/priority-a-recommendations.md`.

## 세계의 뼈대

| 번호 | 질문 | 우선 | 관련 문서 | 지금 걸려 있는 것 |
|---|---|---|---|---|
| Q-1 | 세계의 이름은 무엇인가. 이름이 없는 것이 의도인가 | B | `02-world/world-overview.md` | — |
| Q-2 | 시대와 기술 수준은 어떠한가 (철검·등불·물레방아·나룻배까지 구현됨) | A | `02-world/world-overview.md` | 바깥 세상의 물건과 제도 |
| Q-3 | 마법·초자연은 존재하는가. 존재한다면 얼마나 흔하고, 누가 쓰는가 | A | `05-world-systems/economy-abilities-information.md`, `02-world/cosmology-and-religion.md` | "샘의 정령" 전설이 진실일 수 있는가 |
| Q-4 | 신앙과 종교 조직은 어떠한가. 신은 실재하는가, 믿음일 뿐인가 | B | `02-world/cosmology-and-religion.md` | 기록을 맡는 조직(신전?), 장례·전설의 형태 |
| Q-5 | 연구 문서의 축(`인간 → … → 전설 → 신화 → 초월`)과 "이름"의 의미를 세계의 법칙으로 채택할 것인가 | B | `docs/world/mythology-transcendence-research.md` (Research) | 능력 성장의 상한, 전설화의 의미 |

## 정치와 지리

| 번호 | 질문 | 우선 | 관련 문서 | 지금 걸려 있는 것 |
|---|---|---|---|---|
| Q-6 | 왕국의 이름과 정치 구조, 변경을 다스리는 영주는 누구인가 | A | `04-peoples-and-factions/factions.md` | 징집령(`fact_realm_levy`)의 주체 |
| Q-7 | 왕도는 어떤 곳인가 ("북쪽으로 닷새", "큰 장"만 구현됨) | A | `04-peoples-and-factions/factions.md`, `03-geography/frontier-region.md` | `fact_royal_city`, `fact_realm_fair` |
| Q-8 | "국경의 소란"은 어느 국경에서, 누구와의 갈등인가 | A | `04-peoples-and-factions/factions.md` | `fact_realm_unrest` — 지금은 내용 없는 소문 |
| Q-9 | 남쪽 변경 지역과 그 마을들, 강의 이름. 이름 없는 "변경"이 의도인가 | A | `03-geography/frontier-region.md` | 모든 장소 이름이 일반명사 |

## 「무명의 연대기」

| 번호 | 질문 | 우선 | 관련 문서 | 지금 걸려 있는 것 |
|---|---|---|---|---|
| Q-0 | 「무명의 연대기」라는 제목은 세계 안에서 무엇을 가리키는가 — 이름 없는 이들의 연대기, 실제로 존재하는 기록, 아니면 바깥의 제목일 뿐인가 | A | `01-foundations/design-principles.md`, `02-world/world-overview.md` | 계승(죽은 캐릭터 뒤에 오는 이)과 세계의 기록이 어떤 의미를 갖는가 |

## 인물과 생활

| 번호 | 질문 | 우선 | 관련 문서 | 지금 걸려 있는 것 |
|---|---|---|---|---|
| Q-10 | 인물에게 고유한 이름을 줄 것인가. 직함으로만 부르는 것이 의도인가 | B | `04-peoples-and-factions/characters.md` | 원로·약초꾼·방앗간 주인·뱃사공·두목 |
| Q-11 | 통화의 이름과 단위 (지금은 "은화"뿐) | C | `05-world-systems/economy-abilities-information.md` | — |

## 문서와 절차

| 번호 | 질문 | 우선 | 관련 문서 | 지금 걸려 있는 것 |
|---|---|---|---|---|
| Q-12 | `docs/world-continuity-rules` 브랜치의 `docs/world/world-continuity.md`를 `main`에 병합하고 정본 원칙으로 채택할 것인가 | A | `01-foundations/world-continuity.md` | 지금은 요약만 후보로 있음 |
| Q-13 | 기존 문서의 등급 매김(WB-0002)과 구현 설정의 처리 방침(WB-0003)을 승인하는가 | A | `00-governance/decision-log.md` | 이 디렉터리 전체의 등급 |
| Q-14 | `canon-review/v2-implemented-content.md`의 항목을 어떤 순서로 검토할 것인가 (제안: 지역 이름·정치 구조 → 상단의 소식 → 인물) | A | `canon-review/v2-implemented-content.md` | Slice 4의 남은 단계 |

## 답이 정해지면

1. `00-governance/decision-log.md`에 WB 번호로 결정을 적는다 (질문 번호를 함께 적는다).
2. 관련 문서의 해당 칸을 채우고 등급을 바꾼다.
3. 게임에 구현된 설정과 어긋나면 `canon-review/`에 적고, 게임 쪽 변경은 `feature/v2-core`의 절차로 따로 진행한다.
4. 이 표에서 질문을 지우지 않고 "결정: WB-…"를 덧붙인다.
