# World Node proposals — Draft only

This directory contains **110 authored causal fronts** under the 22 labels named in [World Node Expansion Research](../world-node-expansion-research.md). The labels include genres, identity/time motifs, and challenge structures. They are **proposal namespaces**, not 22 established worlds. Nothing here is loaded by `web/v2/data/world.js`, changes the save schema, or promotes a setting to Canon.

Each front starts with a distinct pressure, actor or institution, site, scarce resource, one proposed player intervention, an initial report, and a verification candidate. The companion catalogs add a counterparty with its own interest, another belief holder, a place to check evidence, and an alternative intervention with an authored tradeoff. The generated graph has 12 candidate nodes per front: 3 Entity roles, 2 Locations, 1 Resource, 3 Events, and 3 Knowledge items. Entity labels may name a person, group, or institution; their exact identity kind remains unresolved. Reports and beliefs are unverified. Evidence and evidence sites are proposals, not discoveries already made in play.

The 1,320 nodes represent **110 connected proposal components**, not 1,320 independent mechanics or a connected playable megaworld. There are 1,650 structural proposal edges and 220 separate proposed causal links. No cross-front or crossworld travel edge is inferred. Event costs, lasting state effects, numerical resource flows, and alternative choices remain unassigned unless a catalog row explicitly states them. The first intervention's cost is unassigned; the companion's alternative has an authored cost/consequence sentence, but persistence and balance remain undecided.

## Sources and status

- [Catalog A](catalog-a.txt), [Catalog B](catalog-b.txt): five authored fronts per label, with exact source line on every generated front and node.
- [Companion A](companion-a.txt), [Companion B](companion-b.txt): distinct counterparties, alternative responses, tradeoffs, and additional beliefs, also traced by line.
- [Manifest](manifest.json): exact counts and links to the 22 generated JSON files.
- [Generator](generate.mjs), [companion extension](extend.mjs), and [writer](write.mjs): deterministic, dependency-free source.
- [Research section 6](https://github.com/i10veU/TxtRPG/blob/3bf3ce9704266e9c048d3d06a44514f6fcaedd7e/docs/v2/world-node-expansion-research.md) supplies the labels. The [World Bible direction](https://github.com/i10veU/TxtRPG/blob/b2a4998df281088decec4e4236e42fe334bb748a/docs/world-bible/01-foundations/master-direction.md) approves future multigenre support, not these proposed settings. The [Canon policy](https://github.com/i10veU/TxtRPG/blob/b2a4998df281088decec4e4236e42fe334bb748a/docs/world-bible/00-governance/canon-policy.md) says Draft content is not playable setting.

## Browse the proposals

| Label | Proposal focus |
|---|---|
| 사이버펑크 | utilities, clinics, notice relays, water, transit |
| 아케인펑크 | charged infrastructure, metering, repair, ferry, wards |
| 아포칼립스 | water, seeds, radio routes, triage, bridge loads |
| 판타지 | ford oath, healing grove, beacon, protective weave, salt |
| 현대 판타지 | hidden transit harm, records, tenant wards, calls, missing neighbors |
| 중세 판타지 | mill rights, road watch, fever, tolls, winter fodder |
| 이세계 | translation, host rations, material standards, paths, gestures |
| 회귀 | changing repeats, delivery receipts, repairs, debts, storm warnings |
| 빙의 | consent, memory, testimony, inheritance, incompatible promises |
| 환생 | craft claims, stewardship, old debts, training, child autonomy |
| SF | habitat air, repair priority, survey ethics, navigation, water |
| 스페이스 오페라 | convoys, treaty terms, oxygen lift, memorials, refuge routes |
| 괴이·오컬트 | thresholds, dreams, voice evidence, fog route, portrait |
| 무협 | escort warrant, antidote training, duel bridge, fever, manual |
| 선협 | shared rain, refinement waste, unsafe training, anchors, vow |
| 헌터 | bounty incentives, antivenom, migration, salvage, false trophy |
| 게이트 | crossing stability, crates, quarantine, shifting route, stamps |
| 탑 | foundations, floor records, lift supplies, beacon, heat toll |
| 탑 등반 | rope wear, route marker, storm reserve, echoes, summit proof |
| 미궁·던전 | flooding, air, trapped workers, wayfinding, water |
| 배틀 아레나 | medical clearance, rule timing, gear, exits, shared training |
| 차원 유랑 | return routes, translation, supplies, seeds, anchor uncertainty |

Run `node docs/v2/world-node-drafts/write.mjs --check` to compare every generated JSON and the manifest byte for byte. Run `node tests/v2/world-node-drafts.test.js` for counts, determinism, typed references, provenance, and mutation checks. Without `--check`, the writer regenerates the artifacts from the four authored catalogs.
