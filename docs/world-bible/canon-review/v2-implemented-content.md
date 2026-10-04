# 정본 검토 — V2에 구현된 설정

> 기준: `feature/v2-core`의 `web/v2/data/world.js` (데이터팩 `frontier_village_pack` 0.3.0, 세계 ID `frontier_village`),
> Vertical Slice 1–4의 3단계(V2-Core-74)까지 병합된 상태.
> 등급: **2026-10-04 WB-0015로 검토 완료.** "처리" 칸에 **Canon C-xx**가 적힌 항목은 그 *문구*만 정본이고, 나머지는 `Provisional`이다.
> 층의 구분(세계의 진실 / 세계 안의 주장·믿음 / 플레이가 정하는 역사 / 게임 값)은 `00-governance/canon-policy.md` "설정의 네 층".
> 이 문서는 목록이다. 설정의 서술은 각 주제 문서(`03-geography/`, `04-peoples-and-factions/` 등)에 있다.
> 2026-10-04: WB-0008 ~ WB-0013이 일부 *구조*를 정본으로 정했다(변경의 기술 수준, 왕국·영주·강까지의 영주권, 왕도의 역할, 먼 국경 분쟁의 존재,
> 명명 원칙). 그 구조와 맞는다는 것이 확인되었을 뿐, 아래 **항목들 자체는 여전히 `Provisional`** 이다. 항목별 처리는 WB-0006의 다음 단계(4)다 —
> 추천: `canon-review/v2-implemented-content-review.md` — 24개 승격 추천 전체 승인 (WB-0015).

## 검토 방법

항목마다 `00-governance/canon-policy.md`의 처리 중 하나를 고른다:
**승격**(Canon), **유지**(Provisional로 두고 나중에), **수정**(설정을 고치고 게임에 반영 — 게임 쪽 변경은 `feature/v2-core`의 절차와
저장 호환 규칙 D-92를 따른다), **폐기**(Deprecated). 결정은 `00-governance/decision-log.md`에 WB 번호로 남긴다.

ID는 저장 파일에 남으므로 게임 쪽에서 바꾸기 어렵다. **정본 검토는 이름·서술·의미를 정하는 일이고, ID는 그대로 둔다**고 가정한다
(바꿔야 한다면 저장 호환 문제가 되므로 게임 쪽 Hard Gate다).

## 장소 (`locations`)

| ID | 이름 | 연결 (분) | 들어가는 조건 | 도입 | 처리 |
|---|---|---|---|---|---|
| `loc_village` | 변경 마을 | 시장 15, 폐허 45, 숲속 샘 60, 옛 갈림길 45 | 시작 장소 | Slice 1 || **Canon C-01** (WB-0015). 게임 값(이동 시간·조건)은 Provisional |
| `loc_market` | 시장 | 마을 15 | — | Slice 1 || **Canon C-02**. 게임 값(이동 시간·조건)은 Provisional |
| `loc_ruins` | 폐허 | 마을 45 | 빛(등불) 또는 밤눈 | Slice 1 || **Canon C-03**. 기원 미결. 게임 값(이동 시간·조건)은 Provisional |
| `loc_forest_spring` | 숲속 샘 | 마을 60 | 우물물이 샘에서 온다는 것을 앎 | Slice 2 || **Canon C-04**. 게임 값(이동 시간·조건)은 Provisional |
| `loc_crossroads` | 옛 갈림길 | 마을 45, 물레방아 마을 40, 강나루 50 | 도적단이 사라짐 | Slice 4 || **Canon C-05**. 게임 값(이동 시간·조건)은 Provisional |
| `loc_mill_hamlet` | 물레방아 마을 | 갈림길 40 | 동쪽 길을 앎 | Slice 4 || **Canon C-06**. 게임 값(이동 시간·조건)은 Provisional |
| `loc_river_ford` | 강나루 | 갈림길 50 | 북쪽 길을 앎 | Slice 4 || **Canon C-07**. 게임 값(이동 시간·조건)은 Provisional |
| `loc_far_bank` | 강 건너 길목 | 강나루 30 (돌아오는 길) | 뱃사공이 건네 줄 때만 | Slice 4 || **Canon C-08**. 게임 값(이동 시간·조건)은 Provisional |

## 인물 (`npcs`)

| ID | 이름 | 구현 형태 | 하는 일 | 처리 |
|---|---|---|---|---|
| `npc_elder` | 마을 원로 | 대화만 | 폐허·지역의 길·두목의 옛 상처를 알려 줌, 감사, 통행 편지 || **Canon C-09** (역할만). 이름·과거 미결 |
| `npc_herbalist` | 약초꾼 | 대화만 | 약초학을 가르침, 정화제·연고, 시장의 소문 || **Canon C-10** (역할만) |
| `npc_miller` | 방앗간 주인 | 대화만 | 지역 소식, 정화초 매입, 밀가루 교역 || **Canon C-11** (역할만) |
| `npc_ferryman` | 뱃사공 | 대화만 | 상단의 소식, 뱃삯 3 또는 통행 편지로 강을 건네 줌 || **Canon C-12** (역할만) |
| `npc_bandit_leader` | 도적 두목 | **actor** (능력치·체력·스태미나) | 대면·전투의 상대. 죽거나 살아서 강을 건너 떠남 || **Canon C-13, C-14** (존재·상처만). 생사·이후는 플레이가 정하는 역사, 능력치는 게임 값 |

## 조직 (`orgs`)

| ID | 이름 | 하는 일 | 처리 |
|---|---|---|---|
| `org_bandits` | 폐허의 도적단 | 마을과 적대. 대면·해산 후 흩어짐 || **Canon C-15** (시작 시점만). 해산·이후는 플레이가 정하는 역사 |
| `org_village` | 변경 마을 사람들 | 도와준 이를 기억하고 감사함 (관계) || **Canon C-09** (원로 중심의 공동체). 감사·기억의 반응은 Provisional |
| `org_mill_hamlet` | 물레방아 마을 사람들 | 밀가루가 전해지면 변경 마을과 교역 (`trading` 관계) || **Canon C-16, C-22** (교역의 *가능성*). 교역의 성립은 플레이가 정하는 역사 |

언급만 되고 구현 ID가 없는 세력: 영주, 왕도·왕국, 상단 (`04-peoples-and-factions/factions.md`).

## 물건 (`items`)

| ID | 이름 | 쓰임 | 처리 |
|---|---|---|---|
| `item_lantern` | 낡은 등불 | 폐허에 들어가는 빛, 조사에 보탬 || Provisional 유지 (정본화 불필요) |
| `item_relic` | 폐허의 유물 | 폐허 조사에서 얻음 || Provisional 유지 (폐허 기원 미결) |
| `item_iron_sword` | 철검 | 손에 드는 장비, 전투 기술 || Provisional 유지 (정본화 불필요) |
| `item_purifying_herb` | 정화초 | 정화제의 재료, 방앗간에 팔 수 있음 || **Canon C-17**. 가격은 게임 값 |
| `item_spring_remedy` | 샘 정화제 | 샘을 정화함 || Provisional 유지 (쓰임은 C-17이 담음) |
| `item_herbal_salve` | 약초 연고 | 상처를 치료함 || Provisional 유지 (정본화 불필요) |
| `item_flour_sack` | 밀가루 자루 | 물레방아 마을에서 원로에게 전함 (교역의 시작) || Provisional 유지 (정본화 불필요) |
| `item_mill_bread` | 물레방아 빵 | 먹으면 기운을 되찾음 || Provisional 유지 (정본화 불필요) |
| `item_passage_letter` | 원로의 통행 편지 | 뱃사공에게 보이면 뱃삯 없이 건넘 (쓰고도 남음) || Provisional 유지 (인장은 C-09가 담음) |

## 세계의 진실 (`facts`)과 그것을 아는 방법 (`rumors`)

진실은 세계에 하나다. 캐릭터는 소문·증언·기록으로 그것을 **안다**. 같은 진실이 두 가지로 전해지는 경우(뉴스와 전설)도 있다.

| 진실 ID | 값 | 무엇이 그 진실을 세우는가 | 알게 되는 소문 (주장) | 도입 | 처리 |
|---|---|---|---|---|---|
| `fact_ruins_secret` | `bandit_hideout` | 폐허 조사 성공 | `rum_ruins_secret` (도적의 은신처) | Slice 1 || **Canon C-15** |
| `fact_bandits_fate` | `dispersed` | 도적단 해산의 이야기 (`evt_bandits_tale`) | `rum_bandits_fate` (흩어졌다) / `rum_bandits_legend` (모두 쓰러졌다 — 전설) | Slice 1 || Provisional — 플레이가 정하는 역사. 전설 "모두 쓰러졌다"는 세계 안의 믿음 |
| `fact_leader_wound` | — (세워지지 않음) | 아무것도 세우지 않는다. 원로가 들려줄 뿐 | `rum_leader_old_wound` (옛 상처) | Slice 1 || **Canon C-14** |
| `fact_well_source` | `forest_spring` | 우물을 살핌 | `rum_well_source` (숲속 샘) | Slice 2 || **Canon C-18** |
| `fact_spring_cause` | `rotting_carcass` | 샘을 뒤짐 | `rum_spring_cause` (썩은 짐승의 사체) | Slice 2 || **Canon C-19** |
| `fact_spring_fouler` | `bandits` | 은신처를 아는 이가 사체의 화살을 알아봄 | `rum_spring_bandits` (도적의 화살) | Slice 3 || **Canon C-19** (화살까지). 두목의 의도는 미결 — 원로의 말은 세계 안의 주장 |
| `fact_well_fate` | `purified` | 샘이 정화된 뒤의 이야기 (`evt_well_tale`) | `rum_well_fate` (정화됐다) / `rum_well_legend` (샘의 정령이 노여움을 풀었다 — 전설) | Slice 3 || Provisional — 플레이가 정하는 역사. "샘의 정령"·제물은 세계 안의 믿음 |
| `fact_road_hamlet` | `east` | 갈림길의 이정표를 읽음 | `rum_road_hamlet` (동쪽에 물레방아 마을) | Slice 4 || **Canon C-05** |
| `fact_road_ford` | `north` | 이정표를 읽음 | `rum_road_ford` (북쪽에 강나루) | Slice 4 || **Canon C-05** |
| `fact_road_royal` | `beyond_ford` | 이정표를 읽음 | `rum_road_royal` (왕도는 나루 너머) | Slice 4 || **Canon C-05** |
| `fact_leader_trail` | `toward_ford` | 두목이 살아 있을 때 갈림길을 뒤짐 | `rum_leader_trail` (나루 쪽 발자국) | Slice 4 || Provisional — 플레이가 정하는 역사 (두목 생존 시) |
| `fact_bandit_toll` | `abandoned` | 두목이 죽었을 때 갈림길을 뒤짐 | `rum_bandit_toll` (버려진 통행세 초소) | Slice 4 || Provisional — 플레이가 정하는 역사 (두목 사망 시) |
| `fact_realm_levy` | `known` | 첫 상단 (`evt_caravan`) | `rum_realm_levy` (영주의 징집령) | Slice 4 || Provisional — 소식의 내용·시기. 징집할 수 있다는 구조는 WB-0010 |
| `fact_realm_fair` | `known` | 둘째 상단 | `rum_realm_fair` (왕도의 큰 장) | Slice 4 || Provisional — 소식의 시기. 왕도가 가장 큰 시장이라는 것은 WB-0011 |
| `fact_realm_unrest` | `known` | 셋째 상단 | `rum_realm_unrest` (국경의 소란) | Slice 4 || Provisional — 소식의 시기. 분쟁의 존재만 WB-0012 |
| `fact_leader_crossed` | `far_bank` | 두목이 살아 있을 때 뱃사공에게 소식을 물음 | `rum_leader_crossed` (강을 건너갔다) | Slice 4 || Provisional — 플레이가 정하는 역사 (두목 생존 시) |
| `fact_royal_city` | `five_days_north` | 강 건너 길목의 게시판을 읽음 | `rum_royal_city` (북쪽으로 닷새) | Slice 4 || **Canon C-20** (= WB-0011) |
| `fact_leader_bounty` | `posted` | 두목이 살아 있을 때 게시판을 읽음 | `rum_leader_bounty` (수배서) | Slice 4 || Provisional — 플레이가 정하는 역사. 현상금 액수는 게임 값 |

## 캐릭터의 출발 (`characterTemplates`)

| ID | 서술 | 처리 |
|---|---|---|
| `start_wanderer` | 떠돌이. 첫 캐릭터의 출발. 은화 8 || **Canon C-23** (첫 세계의 이 지역에서). 은화 등은 게임 값 |
| `start_scout` | 정찰자. 밤눈과 조사의 재능, 은화 3. 후계자가 고를 수 있음 || Provisional 유지 — 밤눈의 성격은 미결(WB-0009 범위 밖) |

## 검토 질문 (구현 설정에 대해)

정본 검토 때 소유자가 답해야 할 것. 세계 전체에 대한 질문은 `99-open-questions.md`에 있다.

1. **"변경"이라는 말.** 마을 이름이 고유명사가 아니라 "변경 마을"이다. 고유한 이름을 줄 것인가, 이름 없는 변경이 의도인가
   (「무명의 연대기」의 "무명"과 이어질 수 있다, Q-9). → **WB-0013** 명명 원칙. 실제 이름은 미결.
2. **폐허의 기원.** 지금은 도적의 은신처일 뿐이다. 깊은 역사(고대·이전 문명)와 이을 것인가. → **미결** (C-03이 미결로 못 박음).
3. **"샘의 정령" 전설.** 지금은 진실이 아닌 전설로만 존재한다. 우주관(Q-3, Q-4)이 정해지면 정령이 실제로 있는지와 충돌하지 않는지 확인한다. → 초자연의 존재만 **WB-0009**. 전설은 세계 안의 믿음으로 Provisional.
4. **영주·왕국·국경.** 상단의 소식이 정해 버린 것(징집령, 왕도의 큰 장, 국경의 소란, 왕도는 북쪽으로 닷새)이
   정본의 정치 구조(Q-6 ~ Q-8)와 맞는가. → 맞다 (**WB-0010 ~ WB-0012**, C-20). 소식의 내용·시기는 Provisional.
5. **은화.** 통화의 이름·단위를 정본으로 정할 것인가 (Q-11). → **미결** (우선순위 C). 가격은 게임 값.
6. **도적 두목.** 이름·출신·도적이 된 이유. 살아서 강을 건넌 두목은 바깥 세상에서 무엇이 되는가 — 이것은 Slice 4 이후 확장의 연결점이지만,
   정본 검토 전에는 확장하지 않는다. → 존재·상처만 **C-13, C-14**. 이름·출신·이유·이후는 **의도적으로 미결**.
7. **인물의 이름.** 모든 인물이 직함으로 불린다. 의도인가 (Q-10). → **WB-0013**: 고유명은 있으나 변경에서는 직함으로 부른다. 실제 이름은 미결.

## Slice 5 — 성읍 (Master Goal #189, 단계마다 추가)

| ID | 무엇 | 처리 |
|---|---|---|
| `loc_castle_town` | 영주의 성읍 (강 건너 길목에서 북쪽) | 길과 포고판은 **Canon DC-01, DC-02** (WB-0019). 모습의 서술은 Provisional. 이동 시간은 게임 값 |
| `evt_castle_town_first` | 성읍에 처음 닿는 이의 서술 (세계에 한 번) | Provisional |
| `act_read_castle_notices` | 영주의 포고(원천에서), 상단이 나른 뒤에만 닿는 변경의 전설, 이름 없는 별칭 | 포고판 **Canon DC-02**, 소식의 경로 **Canon DC-03**. 전해지는 이야기는 세계 안의 믿음. 신뢰도는 게임 값 |
| `npc_town_merchant` | 성읍의 상인 (대화 전용, actor 아님) | 상인이 있다는 것은 **Canon DC-04** (WB-0020). 역할의 세부는 Provisional |
| `choice_town_merchant_dialogue` | 강 남쪽 물건에 대한 상인의 말, 정화초를 삼(4), 철검을 팖(2) | 상인의 말은 세계 안의 주장. 값은 게임 값 |
| `npc_guild_clerk` | 상단 조합의 서기 (대화 전용, actor 아님) | 상단 조합이 성읍에서 호위를 구한다는 것은 **Canon DC-05** (WB-0021). 직책은 Provisional |
| `choice_guild_clerk_dialogue` | 호위 일 (상단 한 번에 하나, 힘·검술 판정, 강 건너 길목에서 끝남) | 누가 맡았는가는 플레이가 정하는 역사. 품삯·난이도·비용·시간·제한은 게임 값 |

## Slice 6 — 소식의 길 (Master Goal #198, 단계마다 추가)

새 정본 없음. 모두 이미 정본인 소식의 경로(WB-0019 DC-03 — 바로잡힘도 소식이다)와 정보의 기울기(WB-0016 N-06) 안에 있다.

| ID | 무엇 | 처리 |
|---|---|---|
| `evt_bandits_word_north` / `evt_well_word_north` | 마을의 바로잡힘이 길을 따라 상단의 주기만큼 늦게 성읍에 닿음 (`*_truth_north`) | 경로는 **Canon DC-03**. 성읍이 무엇을 말하는가는 세계 안의 믿음. 지연은 게임 값 |
| `act_tell_town_ruins` / `act_tell_town_spring` | 진실을 본 사람이 성읍의 포고판 앞에서 전하면 바로잡힘이 즉시 성읍에 닿음 | 누가 날랐는가는 플레이가 정하는 역사. 성읍의 말과 마을의 기록은 별개 |
| `opt_ferryman_news` (메아리) | 성읍이 변경에 대해 하는 말이 상단의 왕복과 함께 남으로 돌아와 뱃사공이 옮김 (전설 또는 바로잡힌 말) | 세계 안의 믿음. 왕복 조건·신뢰도는 게임 값 |
| 원로·약초꾼의 덧붙임 | 바로잡은 이야기를 북쪽이 아직 전설로 말한다는 말 | 세계 안의 주장. 사실은 바뀌지 않는다 |

## Slice 7 — 교역의 길 (Master Goal #207, 단계마다 추가)

| ID | 무엇 | 처리 |
|---|---|---|
| `opt_miller_buy_flour` | 두 마을이 교역하면 방앗간 주인이 밀가루 자루를 판다 (은화 2) | 주인의 말은 Provisional. 값은 게임 값 |
| `opt_town_merchant_sell_flour` | 성읍의 상인이 변경의 밀가루를 산다 (은화 4, 교역이 트인 뒤에만) | **Canon DC-06** (WB-0022). 누가 날랐는가는 플레이가 정하는 역사. 값은 게임 값 |

