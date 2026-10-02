// V2-Core-22: the first real V2 world data pack (docs/v2/architecture/
// CORE_CONTRACTS.md §11, Issue #74). A small "frontier village" scenario
// built entirely from already-implemented Condition/Effect/Resolvable/
// Growth/Relation/Rumor/Fact mechanics -- no new engine semantics were
// invented to build this content (see D-65 for the one genuine contract/
// code gap this pack deliberately works around instead of relying on).
//
// Minimal playable loop (canonical path, V2-Core-29/30 -- each step happens
// where it makes sense, enforced by `location` and `rumor` Conditions):
//   village: observe (grow `investigation` proficiency)
//   -> village: talk to the elder (a real `choice`: ask about the ruins, which
//      teaches the `rum_ruins_secret` rumor, or just small talk)
//   -> market: buy a lantern (spends money, gates the ruins link)
//   -> ruins: investigate -- only once the rumor is known (a real check()
//      against `wit`, decided by RNG); a success confirms the rumor from a
//      second, first-hand source; the ruins hazard costs HP on arrival and
//      again while you stay
//   -> village: rest (the recovery action)
//   -> village: talk to the elder again; once the investigation is confirmed a
//      third option appears -- report what you found (optional, V2-Core-31)
//   -> enough accumulated investigation unlocks `unl_keen_eye`, which
//      together with what the investigation confirmed gates a final
//      confrontation action (a second check(), tags:["social"]); if you
//      reported to the elder, the village stands behind you and the leader is
//      shaken further, and the bandits as a group are cowed
//   -> village: talk to the elder once more; a confrontation the village stood
//      behind opens one more option -- leave the bandits' fate to the elder
//   -> market (any later step): once the bandits are cowed and the leader is no
//      longer one of them, the merchants show their relief -- once
//   -> village, any character, any time later: the elder can be asked for news of
//      the bandits once the village's history says they dispersed
//   (reporting to the elder and confronting the leader take the character's own proof
//   -- the relic only their own successful investigation yields -- not the world's flag)
//
// V2-Core-25 wires already-implemented mechanics into this same pack (no new
// engine semantics): `minutes` on the two long actions, `location`-gated
// village activities, one `data.events` hazard at the ruins whose `hp`
// Effect can kill the player, and `rules.succession` for the replacement
// character. See CORE_CONTRACTS.md D-66's follow-up note.
//
// V2-Core-29 again adds no engine semantics: `act_buy_lantern` (market) and
// `act_investigate_ruins` (ruins) are now location-gated with the same
// `location` Condition, and `act_rest_village` heals through the existing `hp`
// Effect. `version` stays "0.1.0" on purpose: the change adds one action and
// restricts where two run, with no state-shape change, so saves made before it
// stay valid (D-68 leaves bumping to the pack author).
//
// V2-Core-30 also adds no engine semantics: `act_investigate_ruins` now needs
// the elder's rumor (the existing `rumor` Condition, allowed in player context
// -- only `fact` is restricted, §8.4) and its success re-learns that rumor in
// observe mode (existing `rumor` Effect: the claim is copied from the fact the
// investigation just set, from the new source `obs_loc_ruins`). No
// `data.rules.rumor` gains are set: nothing reads confidence, so the
// confirmation shows up as `confirmations`/`sources` only. `version` stays
// "0.1.0" for the same reason as above (no state-shape change; D-68).
//
// V2-Core-31 also adds no engine semantics: a third elder option is gated by the
// confirmed-investigation flag (choice-option `requires`, the existing `flag`
// Condition) and writes the elder's relation edge (existing `relation` Effect:
// score, mode and a `confidant` tag); the confrontation's success outcome reads
// that edge with the existing `relation` Condition inside an `if` Effect. The tag,
// not the score, is what counts: talking to the elder is free and repeatable, so a
// score threshold could be farmed without ever learning anything. `act_confront_
// leader`'s own requirements and its check are unchanged. `version` stays "0.1.0"
// (no state-shape change; D-68).
//
// V2-Core-32 also adds no engine semantics: the same backed branch now writes the
// bandit organisation's edge towards the player (`org_bandits` -> self, a `cowed`
// tag -- organisations are ordinary relation edge ends, told apart from NPCs only
// by their ID prefix, §7.1), and a fourth elder option reads it, together with the
// leader's `member` tag that the investigation wrote, with the existing `relation`
// Condition; using it removes that membership (`untag`), so the option closes itself.
// Nothing changes for a player who never reported: the unbacked confrontation is
// exactly what it was. `data.events` could read the same edges (a trigger sees a
// same-step tag change) but nothing here needs an event. `version` stays "0.1.0"
// (no state-shape change; D-68).
//
// V2-Core-33 also adds no engine semantics: that result now outlives the moment it
// was made. `evt_market_reopens` (a `data.events` entry, `once`) reads the same two
// edges -- the bandits are cowed and the leader is no longer a member -- and fires in
// whichever later step the player is standing in the market. Nothing decays those
// edges (there are no relation rules), so the event sees them however much time and
// travel has passed; `state.fired` keeps it from paying twice. The `cowed` edge is
// the acting character's (`org_bandits` -> `player_<n>`): a successor does not inherit
// it, and the event is simply false for them. `version` stays "0.1.0" (no state-shape
// change; D-68).
//
// V2-Core-34 also adds no engine semantics; it draws the line between what belongs to
// a character and what belongs to the world (CORE_CONTRACTS D-70). `state.actors[id]`
// (items, money, hp, growth), `state.knowledge[id]` and every relation edge that has a
// `player_<n>` at one end belong to that character; `flags`, `cases`, `facts`, `fired`,
// `time` and the edges between world entities belong to the world, and a successor
// inherits none of the first kind (`rules.succession` above is the only bridge, and it
// grants money only). `opt_ask_bandit_news` reads nothing but the second kind -- the
// `ruins_mystery` case is resolved and the leader is no longer a member -- so it is
// offered to whoever is asking, the acting character or their successor, and to nobody
// on any other history. What a successor should inherit, and who a world-level reward
// belongs to, are design decisions this pack does not make. `version` stays "0.1.0"
// (no state-shape change; D-68).
//
// V2-Core-35 also adds no engine semantics; it fixes one mismatch V2-Core-34 recorded.
// `flags` are world-unit (§4.1: no subject), yet the report option and the confrontation
// read `ruins_secret_confirmed` as if the CHARACTER had confirmed the secret, so a successor
// who never investigated could report and confront. Both now require `item_relic`
// (`item` Condition, character-anchored): only a successful investigation writes it, into
// the investigating character's own inventory, so a successor has none until they earn one,
// and a failed investigation leaves none. The flag is still written -- it is the world's
// record that the secret was confirmed -- it just no longer stands in for a character's own
// proof. The rumor's confidence was the other candidate marker and was rejected: it needs a
// `data.rules.rumor` gain, and a save made before the change (already at confidence 60 with
// its observe source recorded) could then never reach the threshold. The relic is already in
// such a save, so nobody is stranded. `version` stays "0.1.0" (no state-shape change; D-68).
//
// V2-Core-44 also adds no engine semantics; it applies the human decision on D-71 (3): a world
// edge the story has settled is not reversed by a character's later action. `act_investigate_ruins`
// can be repeated, and its success wrote the leader's `member` tag every time -- so investigating
// again after `opt_bandits_disperse` brought the dispersed gang back (the elder's news stopped, the
// market's relief became false, the dispersal reopened), for the same character and for a successor.
// The membership is now written only while `case_ruins_mystery` is unresolved (an `if` Effect in
// the same position, so every earlier path keeps its events); the dispersal is only reachable after
// the case is resolved. A save already in the revived state is not repaired (no migration).
// `version` stays "0.1.0" (no state-shape change; D-68).
//
// V2-Core-45 also adds no engine semantics; it is the V2 slice of #66 (world history & discovery):
// an immediate change -> time -> the account changes -> a later character discovers. The dispersal
// (case resolved, the leader no longer a member) starts `evt_bandits_tale`, which records the
// objective `fact_bandits_fate` and counts `bandits_tale_age` 1..3 a day apart (`cooldown`, D-74's
// pattern -- no scheduler, no new state field). While it is fresh the elder tells the news (rumor
// `rum_bandits_fate`, "dispersed"); after about two days the same option tells the village's legend
// (`rum_bandits_legend`, "slain", lower confidence). A successful investigation at the ruins then
// observes the fact: the truth first-hand, and a believed legend corrected (D-14). Before the
// dispersal there is no fact, so the earlier path is unchanged. A successor inherits no knowledge
// (D-71 (1)) and finds both on their own. `version` stays "0.1.0" (no state-shape change; D-68):
// a save made before this change starts the clock at its next step.
//
// V2-Core-46 also adds no engine semantics; it closes the information loop of that slice. A
// character who heard the legend and then saw the truth at the ruins (their legend corrected) can
// tell the elder (`opt_correct_legend`, once): the world flag `bandits_tale_corrected` is written,
// and from then on the elder tells everyone the true account instead of the legend -- a successor
// included, without inheriting anyone's knowledge (D-71 (1)); no reward beyond a one-time +5 with
// the elder (D-71 (2)). Information -> judgment -> action -> world change -> new information for
// the next generation. `version` stays "0.1.0" (no state-shape change; D-68).
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

  // V2-Core-25: applied by engine.js's resolveStartCharacter right after a
  // post-death `startCharacter` (D-47) with ctx {actorId: new character,
  // targetId: previous character} -- `money` therefore defaults its subject
  // to the NEW character. Uses only already-implemented Effects.
  rules: {
    succession: [
      { op: "money", add: 3 },
      { op: "narrate", textId: "txt_succession" }
    ]
  },

  // V2-Core-25: the one data.events entry, evaluated by §2.5 stage 10 after
  // every resolved action (D-51, world context). While the player stands in
  // the ruins it fires at most once per `cooldown` minutes and costs 4 HP --
  // three hits take the 10-HP wanderer to 0, which is the existing `hp`
  // Effect's own death trigger (D-34), not a new mechanic.
  events: {
    // V2-Core-45 (#66 slice): the dispersal becomes history. Once the bandits are dispersed (the
    // case is resolved and the leader is no longer a member -- not reversible since V2-Core-44),
    // this records the objective fact and counts the days: 1 on the dispersal step, then +1 at the
    // first step a full day later, until 3 (D-74's delayed-change pattern; no scheduler). The
    // elder's account reads the count.
    evt_bandits_tale: {
      trigger: {
        op: "and",
        of: [
          { op: "case", case: "case_ruins_mystery", stage: "resolved" },
          { op: "not", of: { op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" } },
          { op: "signal", key: "bandits_tale_age", max: 2 }
        ]
      },
      cooldown: 1440,
      effects: [
        { op: "fact", fact: "fact_bandits_fate", set: "dispersed" },
        { op: "signal", key: "bandits_tale_age", add: 1 }
      ]
    },
    // V2-Core-33: a consequence that shows up later, elsewhere. Read through `relation`
    // Conditions only; `once` (state.fired) keeps it from paying twice.
    evt_market_reopens: {
      trigger: {
        op: "and",
        of: [
          { op: "location", at: "loc_market" },
          { op: "relation", from: "org_bandits", to: "self", tag: "cowed" },
          { op: "not", of: { op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" } }
        ]
      },
      once: true,
      effects: [
        { op: "money", add: 3 },
        { op: "narrate", textId: "txt_market_reopens" }
      ]
    },
    evt_ruins_hazard: {
      trigger: { op: "location", at: "loc_ruins" },
      cooldown: 30,
      effects: [
        { op: "hp", add: -4 },
        { op: "narrate", textId: "txt_ruins_hazard" }
      ]
    }
  },

  locations: {
    loc_village: {
      name: "변경 마을",
      links: [
        { to: "loc_market", minutes: 15 },
        { to: "loc_ruins", minutes: 45, requires: { op: "item", item: "item_lantern", min: 1 } }
      ]
    },
    loc_market: {
      name: "시장",
      links: [{ to: "loc_village", minutes: 15 }]
    },
    loc_ruins: {
      name: "폐허",
      links: [{ to: "loc_village", minutes: 45 }]
    }
  },

  actions: {
    act_observe_village: {
      name: "마을 살피기",
      requires: { op: "location", at: "loc_village" },
      effects: [
        { op: "proficiency", id: "investigation", add: 15 },
        { op: "narrate", textId: "txt_observe_village" }
      ]
    },
    act_buy_lantern: {
      name: "등불 구입",
      requires: { op: "and", of: [{ op: "location", at: "loc_market" }, { op: "money", min: 5 }] },
      effects: [
        { op: "money", add: -5 },
        { op: "item", item: "item_lantern", add: 1 },
        { op: "narrate", textId: "txt_buy_lantern" }
      ]
    },
    act_talk_elder: {
      name: "원로와 대화",
      requires: { op: "location", at: "loc_village" },
      showWhenLocked: true,
      effects: [{ op: "choice", choice: "choice_elder_dialogue", sourceId: "act_talk_elder" }]
    },
    act_investigate_ruins: {
      name: "폐허 조사",
      requires: {
        op: "and",
        of: [
          { op: "location", at: "loc_ruins" },
          { op: "item", item: "item_lantern", min: 1 },
          { op: "rumor", rumor: "rum_ruins_secret" }
        ]
      },
      check: { stat: "wit", tags: ["investigation"], difficulty: "normal" },
      minutes: 60,
      outcomes: {
        success: [
          { op: "fact", fact: "fact_ruins_secret", set: "bandit_hideout" },
          // observe mode copies the fact set just above as the claim; `confidence`
          // only matters if the claim ever conflicted with a believed one
          { op: "rumor", rumor: "rum_ruins_secret", observe: true, source: "obs_loc_ruins", confidence: 80 },
          { op: "flag", key: "ruins_secret_confirmed", value: true },
          { op: "proficiency", id: "investigation", add: 30 },
          { op: "item", item: "item_relic", add: 1 },
          // V2-Core-44 (D-71 (3) decided): the ruins reveal the membership only while the
          // mystery is open -- once it is resolved (and possibly the bandits dispersed),
          // investigating again does not write the world's history back
          {
            op: "if",
            when: { op: "not", of: { op: "case", case: "case_ruins_mystery", stage: "resolved" } },
            then: [{ op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" }]
          },
          { op: "narrate", textId: "txt_investigate_success" },
          // V2-Core-45: after the dispersal the hideout itself tells what happened -- first-hand,
          // and it corrects a believed legend (higher confidence wins, D-14). Before the dispersal
          // there is no fact to observe, so none of this happens
          { op: "rumor", rumor: "rum_bandits_fate", observe: true, source: "obs_loc_ruins", confidence: 80 },
          {
            op: "if",
            when: { op: "rumor", rumor: "rum_bandits_legend" },
            then: [{ op: "rumor", rumor: "rum_bandits_legend", observe: true, source: "obs_loc_ruins", confidence: 80 }]
          },
          {
            op: "if",
            when: { op: "fact", fact: "fact_bandits_fate", eq: "dispersed" },
            then: [{ op: "narrate", textId: "txt_hideout_abandoned" }]
          }
        ],
        fail: [
          { op: "proficiency", id: "investigation", add: 10 },
          { op: "narrate", textId: "txt_investigate_fail" }
        ]
      }
    },
    // V2-Core-29: the one recovery action. Only the existing `hp` Effect (positive
    // add, clamped at max HP by the engine); it is a `perform`, so the engine's
    // pending/dead gate rejects it for a dead player -- it can never revive anyone.
    act_rest_village: {
      name: "마을에서 쉬기",
      requires: { op: "location", at: "loc_village" },
      minutes: 60,
      effects: [
        { op: "hp", add: 4 },
        { op: "narrate", textId: "txt_rest_village" }
      ]
    },
    act_confront_leader: {
      name: "도적 두목과 대면",
      requires: {
        op: "and",
        of: [
          // V2-Core-35: the character's own proof, not the world's flag
          { op: "item", item: "item_relic", min: 1 },
          { op: "unlock", id: "unl_keen_eye" }
        ]
      },
      showWhenLocked: true,
      check: { stat: "wit", tags: ["social"], difficulty: "hard" },
      minutes: 30,
      outcomes: {
        success: [
          { op: "case", case: "case_ruins_mystery", stage: "resolved" },
          { op: "relation", from: "npc_bandit_leader", to: "self", add: -10 },
          { op: "narrate", textId: "txt_confront_success" },
          // V2-Core-31: only a player who reported to the elder has the village behind them
          {
            op: "if",
            when: { op: "relation", from: "npc_elder", to: "self", tag: "confidant" },
            then: [
              { op: "relation", from: "npc_bandit_leader", to: "self", add: -10 },
              { op: "narrate", textId: "txt_confront_backed" },
              // V2-Core-32: the organisation is cowed too (its own edge towards the player)
              { op: "relation", from: "org_bandits", to: "self", add: -10, tag: "cowed" }
            ]
          }
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
          name: "폐허에 대해 묻기",
          effects: [
            { op: "relation", from: "npc_elder", add: 5 },
            { op: "rumor", rumor: "rum_ruins_secret", source: "npc_elder", confidence: 60 },
            { op: "narrate", textId: "txt_ask_ruins" }
          ]
        },
        {
          id: "opt_small_talk",
          name: "안부만 묻기",
          effects: [
            { op: "relation", from: "npc_elder", add: 1 },
            { op: "narrate", textId: "txt_small_talk" }
          ]
        },
        // V2-Core-31: only offered once the investigation is confirmed -- since V2-Core-35
        // by the CHARACTER's own proof (the relic), the same one the confrontation takes.
        // Rejected with requirements_not_met otherwise, leaving the choice pending like any
        // other rejected `choose`.
        {
          id: "opt_report_findings",
          name: "조사에서 알아낸 것을 전한다",
          requires: { op: "item", item: "item_relic", min: 1 },
          effects: [
            { op: "relation", from: "npc_elder", add: 10, mode: "cooperation", tag: "confidant" },
            { op: "narrate", textId: "txt_report_findings" }
          ]
        },
        // V2-Core-32: only offered while the bandits are cowed AND the leader is still a
        // member (both edges are read with the `relation` Condition). Using it removes
        // the membership, so it cannot be chosen twice; a player whose confrontation the
        // village did not back never sees it.
        // V2-Core-34: reads WORLD state only (a resolved case and the leader's membership
        // edge, neither of which has a character at either end), so it is offered to a
        // successor exactly as it is to the character who made it true.
        {
          id: "opt_ask_bandit_news",
          name: "도적단의 소식을 묻는다",
          requires: {
            op: "and",
            of: [
              { op: "case", case: "case_ruins_mystery", stage: "resolved" },
              { op: "not", of: { op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" } }
            ]
          },
          // V2-Core-45: news while it is fresh (about two days), the village's legend afterwards;
          // V2-Core-46: once someone has corrected the legend, the true account again, for anyone
          effects: [
            { op: "relation", from: "npc_elder", add: 1 },
            {
              op: "if",
              when: {
                op: "and",
                of: [
                  { op: "signal", key: "bandits_tale_age", min: 3 },
                  { op: "not", of: { op: "flag", key: "bandits_tale_corrected" } }
                ]
              },
              then: [
                { op: "rumor", rumor: "rum_bandits_legend", source: "src_village_legend", confidence: 40 },
                { op: "narrate", textId: "txt_bandit_legend" }
              ],
              else: [
                { op: "rumor", rumor: "rum_bandits_fate", source: "npc_elder", confidence: 70 },
                {
                  op: "if",
                  when: { op: "flag", key: "bandits_tale_corrected" },
                  then: [{ op: "narrate", textId: "txt_bandit_news_corrected" }],
                  else: [{ op: "narrate", textId: "txt_bandit_news" }]
                }
              ]
            }
          ]
        },
        // V2-Core-46: the truth a character found becomes something they can act on. Only a
        // character who heard the legend and then saw at the ruins that it was wrong (their
        // legend corrected to "dispersed"; the ruins correct only a legend already heard, and it
        // is told only in the legend's time), while it is uncorrected. It
        // changes the world's record (a world flag), not anyone's knowledge -- the elder tells
        // the true account from then on, to a successor too -- and closes itself
        {
          id: "opt_correct_legend",
          name: "폐허에서 본 것을 바로잡아 전한다",
          requires: {
            op: "and",
            of: [
              { op: "not", of: { op: "flag", key: "bandits_tale_corrected" } },
              { op: "eq", left: { rumor: "rum_bandits_legend" }, right: "dispersed" }
            ]
          },
          effects: [
            { op: "flag", key: "bandits_tale_corrected", value: true },
            { op: "relation", from: "npc_elder", add: 5 },
            { op: "narrate", textId: "txt_correct_legend" }
          ]
        },
        {
          id: "opt_bandits_disperse",
          name: "도적단 잔당의 처분을 원로에게 맡긴다",
          requires: {
            op: "and",
            of: [
              { op: "relation", from: "org_bandits", to: "self", tag: "cowed" },
              { op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" }
            ]
          },
          effects: [
            { op: "relation", from: "npc_bandit_leader", to: "org_bandits", untag: "member" },
            { op: "relation", from: "npc_elder", add: 5 },
            { op: "narrate", textId: "txt_bandits_disperse" }
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

  // `initial` is seeded by createInitialState since V2-Core-43 (D-76): every new
  // game starts with this fact at "unknown". Nothing reads that value; the truth
  // is set by act_investigate_ruins's own `fact` Effect, as before.
  facts: {
    fact_ruins_secret: { initial: "unknown" },
    // V2-Core-45: what really happened to the bandits -- set by evt_bandits_tale, never in the view
    fact_bandits_fate: {}
  },

  rumors: {
    rum_ruins_secret: { factId: "fact_ruins_secret", claim: "bandit_hideout" },
    // V2-Core-45: the same history told two ways -- the elder's news, and the legend it becomes
    rum_bandits_fate: { factId: "fact_bandits_fate", claim: "dispersed" },
    rum_bandits_legend: { factId: "fact_bandits_fate", claim: "slain" }
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
    txt_confront_fail: "대치는 뜻대로 풀리지 않았다.",
    txt_report_findings: "당신이 알아낸 것을 전하자 원로는 오래 침묵하다 천천히 고개를 끄덕인다.",
    txt_confront_backed: "마을 사람들이 당신 뒤에 서 있다는 사실이 도적 두목을 더욱 흔든다.",
    txt_bandit_news: "원로는 폐허의 도적단이 흩어졌다는 소식을 들려준다. 마을 사람들 사이에서 그 이야기는 오래 회자된다.",
    txt_bandit_legend: "원로는 이제 마을에서 전해지는 이야기를 들려준다. 폐허의 도적단이 마을 사람들 손에 모두 쓰러졌다는 전설이다.",
    txt_correct_legend: "당신은 폐허에서 본 것을 원로에게 전한다. 원로는 한참을 생각하더니, 앞으로는 있었던 그대로 전하겠다고 말한다.",
    txt_bandit_news_corrected: "원로는 마을의 전설 대신, 도적단이 쓰러진 것이 아니라 흩어졌다는 사실을 들려준다. 누군가 폐허에서 그것을 직접 보았다고 한다.",
    txt_hideout_abandoned: "은신처는 텅 비어 있다. 서둘러 짐을 챙겨 떠난 흔적뿐, 싸움의 자국은 없다. 도적단은 쓰러진 것이 아니라 흩어졌다.",
    txt_bandits_disperse: "원로는 도적단 잔당에게 사람을 보내 해산을 권한다. 두목은 더 이상 도적단의 일원이 아니다.",
    txt_market_reopens: "도적단이 흩어졌다는 소식에 상인들이 안도하며 은화 몇 닢을 사례한다.",
    txt_rest_village: "마을 어귀의 평상에 앉아 숨을 고르며 상처를 돌본다.",
    txt_ruins_hazard: "무너진 벽돌이 머리 위로 쏟아져 내린다.",
    txt_succession: "쓰러진 이가 남긴 은화 몇 닢이 새 방랑자의 손에 들어온다."
  }
};
