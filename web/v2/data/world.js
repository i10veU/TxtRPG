// V2-Core-22: the first real V2 world data pack (docs/v2/architecture/
// CORE_CONTRACTS.md §11, Issue #74). A small "frontier village" scenario
// built entirely from already-implemented Condition/Effect/Resolvable/
// Growth/Relation/Rumor/Fact mechanics -- no new engine semantics were
// invented to build this content (see D-65 for the one genuine contract/
// code gap this pack deliberately works around instead of relying on).
//
// Minimal playable loop:
//   observe the village (grow `investigation` proficiency)
//   -> talk to the elder (a real `choice`: ask about the ruins, or just
//      small talk -- learns a rumor either way branches differently)
//   -> buy a lantern from the market (spends money, gates the ruins link)
//   -> investigate the ruins (a real check() against `wit`, decided by RNG)
//   -> enough accumulated investigation unlocks `unl_keen_eye`, which
//      together with what the investigation confirmed gates a final
//      confrontation action (a second check(), tags:["social"]).
//
// This is deliberately small (Ponytail): one data module, one growth
// system, three locations, two NPCs (referenced only as relation/rumor
// participant IDs -- see D-65, no `state.actors` records for them; a full
// NPC actor/scheduler is explicitly out of scope per Issue #74).

export const worldData = {
  formatVersion: 1,
  id: "frontier_village_pack",
  version: "0.1.0",
  world: {
    id: "frontier_village",
    growthSystemId: "growth_wanderer",
    startTemplateId: "start_wanderer"
  },

  characterTemplates: {
    start_wanderer: {
      kind: "player",
      locationId: "loc_village",
      hp: { max: 10 },
      money: 8,
      inventory: {},
      growth: { growth_wanderer: { stats: { wit: 8 } } },
      tags: []
    }
  },

  locations: {
    loc_village: {
      links: [
        { to: "loc_market", minutes: 15 },
        { to: "loc_ruins", minutes: 45, requires: { op: "item", item: "item_lantern", min: 1 } }
      ]
    },
    loc_market: {
      links: [{ to: "loc_village", minutes: 15 }]
    },
    loc_ruins: {
      links: [{ to: "loc_village", minutes: 45 }]
    }
  },

  actions: {
    act_observe_village: {
      effects: [
        { op: "proficiency", id: "investigation", add: 15 },
        { op: "narrate", textId: "txt_observe_village" }
      ]
    },
    act_buy_lantern: {
      requires: { op: "money", min: 5 },
      effects: [
        { op: "money", add: -5 },
        { op: "item", item: "item_lantern", add: 1 },
        { op: "narrate", textId: "txt_buy_lantern" }
      ]
    },
    act_talk_elder: {
      effects: [{ op: "choice", choice: "choice_elder_dialogue", sourceId: "act_talk_elder" }]
    },
    act_investigate_ruins: {
      requires: { op: "item", item: "item_lantern", min: 1 },
      check: { stat: "wit", tags: ["investigation"], difficulty: "normal" },
      outcomes: {
        success: [
          { op: "fact", fact: "fact_ruins_secret", set: "bandit_hideout" },
          { op: "flag", key: "ruins_secret_confirmed", value: true },
          { op: "proficiency", id: "investigation", add: 30 },
          { op: "item", item: "item_relic", add: 1 },
          { op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" },
          { op: "narrate", textId: "txt_investigate_success" }
        ],
        fail: [
          { op: "proficiency", id: "investigation", add: 10 },
          { op: "narrate", textId: "txt_investigate_fail" }
        ]
      }
    },
    act_confront_leader: {
      requires: {
        op: "and",
        of: [
          { op: "flag", key: "ruins_secret_confirmed", eq: true },
          { op: "unlock", id: "unl_keen_eye" }
        ]
      },
      showWhenLocked: true,
      check: { stat: "wit", tags: ["social"], difficulty: "hard" },
      outcomes: {
        success: [
          { op: "case", case: "case_ruins_mystery", stage: "resolved" },
          { op: "relation", from: "npc_bandit_leader", to: "self", add: -10 },
          { op: "narrate", textId: "txt_confront_success" }
        ],
        fail: [
          { op: "relation", from: "npc_bandit_leader", to: "self", add: -20 },
          { op: "narrate", textId: "txt_confront_fail" }
        ]
      }
    }
  },

  // `choose` never carries a targetId (engine.js's resolveChoose builds no
  // targetId into its ctx) -- so unlike act_investigate_ruins/
  // act_confront_leader above, these options give `relation`'s `from`
  // explicitly instead of relying on the "target" default (which would
  // silently resolve to undefined and skip, D-29).
  choices: {
    choice_elder_dialogue: {
      options: [
        {
          id: "opt_ask_ruins",
          effects: [
            { op: "relation", from: "npc_elder", add: 5 },
            { op: "rumor", rumor: "rum_ruins_secret", source: "npc_elder", confidence: 60 },
            { op: "narrate", textId: "txt_ask_ruins" }
          ]
        },
        {
          id: "opt_small_talk",
          effects: [
            { op: "relation", from: "npc_elder", add: 1 },
            { op: "narrate", textId: "txt_small_talk" }
          ]
        }
      ]
    }
  },

  growthSystems: {
    growth_wanderer: {
      id: "growth_wanderer",
      stats: [{ id: "wit", min: 0, max: 20, base: 8 }],
      proficiencies: [
        {
          id: "investigation",
          max: 100,
          checkStep: 20,
          thresholds: [{ at: 50, effects: [{ op: "unlock", id: "unl_keen_eye" }] }]
        }
      ],
      unlocks: [{ id: "unl_keen_eye", kind: "action" }]
    }
  },

  items: {
    item_lantern: { name: "낡은 등불", modifiers: [{ tags: ["investigation"], value: 1 }] },
    item_relic: { name: "폐허의 유물" }
  },

  // NOTE (D-65): `initial` is documented (§8.1) but not seeded by any
  // runtime code yet -- createInitialState never reads data.facts. This
  // pack does not rely on it: the fact is set explicitly by
  // act_investigate_ruins's own `fact` Effect instead. Declared here only
  // as authored content metadata for a future seeding implementation.
  facts: {
    fact_ruins_secret: { initial: "unknown" }
  },

  rumors: {
    rum_ruins_secret: { factId: "fact_ruins_secret", claim: "bandit_hideout" }
  },

  // Referenced only as relation-edge/rumor-source IDs (§7.1/§8.3) -- no
  // `state.actors` records are created for them (no NPC actor spawning
  // exists in createInitialState, and a full NPC scheduler is explicitly
  // out of scope, Issue #74). Entries here are inert authored metadata
  // (validateData only checks their key format, D-56).
  npcs: {
    npc_elder: { name: "마을 원로" },
    npc_bandit_leader: { name: "도적 두목" }
  },
  orgs: {
    org_bandits: { name: "폐허의 도적단" }
  },

  texts: {
    txt_observe_village: "당신은 마을 곳곳을 둘러보며 사람들의 표정과 대화를 살핀다.",
    txt_buy_lantern: "상인에게 은화를 건네고 낡은 등불을 받는다.",
    txt_ask_ruins: "원로는 목소리를 낮추며 마을 외곽의 폐허에 대해 이야기한다.",
    txt_small_talk: "원로와 짧은 안부를 나눈다.",
    txt_investigate_success: "등불 아래 드러난 흔적은 도적들의 은신처를 가리키고 있었다.",
    txt_investigate_fail: "폐허는 어둡고 흔적은 모호하다. 확실한 것을 찾지 못했다.",
    txt_confront_success: "당신은 도적 두목과 마주하고 진실을 밝혀낸다.",
    txt_confront_fail: "대치는 뜻대로 풀리지 않았다."
  }
};
