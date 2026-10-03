// V2-Core-61 (#147 completion condition): "a new world is added with its own data and its
// world/growth/combat grammar, without changing the engine's core code." This test is that new world:
// an abstract martial-arts pack written only as data, run through the unchanged engine (createInitialState,
// step, check, validateData, save/load). Nothing here is imported from the fantasy pack, and the
// engine names none of it: qi, sword forms, a meridian talent, a talisman slot, an inner-strike
// technique that costs qi, a rival who spends his own qi -- the same capability language
// (resource / proficiency -> skill / trait `practice` / item `slot` + equip / requires + Effect costs /
// `subject`), a different grammar.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { check, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const RIVAL = "npc_rival";
const pay = (n) => ({ op: "resource", resource: "res_qi", add: -n });
const exchange = (effects) => [
  { op: "proficiency", id: "prof_sword_forms", add: 4 },
  ...effects,
  {
    op: "if",
    when: { op: "not", of: { op: "alive", subject: RIVAL } },
    then: [{ op: "flag", key: "duel_won", value: true }, { op: "narrate", textId: "txt_won" }],
    else: [{ op: "if", when: { op: "alive" }, then: [{ op: "choice", choice: "choice_duel", sourceId: "act_duel" }] }]
  }
];
// the rival answers a clean miss with his own technique while his qi lasts
const rivalAnswers = (damage) => ({
  op: "if",
  when: { op: "resource", subject: RIVAL, resource: "res_qi", min: 2 },
  then: [{ op: "resource", subject: RIVAL, resource: "res_qi", add: -2 }, { op: "hp", add: -(damage + 2) }],
  else: [{ op: "hp", add: -damage }]
});
const STATS = { stat_body: 10, stat_spirit: 12 };

const MARTIAL = {
  formatVersion: 1,
  id: "martial_pack",
  version: "1.0.0",
  world: { id: "world_martial", growthSystemId: "growth_martial", startTemplateId: "tmpl_disciple" },
  characterTemplates: {
    tmpl_disciple: {
      kind: "player", locationId: "loc_hall", hp: { max: 12 }, money: 2, inventory: { item_talisman: 1 },
      growth: { growth_martial: { stats: STATS, traits: { trait_meridians: true }, resources: { res_qi: { current: 5, max: 5 } } } }, tags: []
    }
  },
  npcs: {
    npc_rival: {
      name: "rival",
      actor: { locationId: "loc_hall", hp: { max: 8 }, growth: { growth_martial: { stats: STATS, resources: { res_qi: { current: 4, max: 4 } } } } }
    }
  },
  locations: { loc_hall: { name: "hall", links: [] } },
  growthSystems: {
    growth_martial: {
      id: "growth_martial",
      stats: [{ id: "stat_body", min: 0, max: 20, base: 10 }, { id: "stat_spirit", min: 0, max: 20, base: 10 }],
      proficiencies: [{ id: "prof_sword_forms", max: 100, thresholds: [10, 20, 30].map((at) => ({ at, effects: [{ op: "skill", skill: "skill_sword_art", add: 1 }] })) }],
      skills: [{ id: "skill_sword_art", maxRank: 3, checkBonusPerRank: 1 }],
      traits: [{ id: "trait_meridians", practice: { prof_sword_forms: 2 } }],
      resources: [{ id: "res_qi", max: 5 }]
    }
  },
  items: { item_talisman: { name: "talisman", slot: "slot_charm", modifiers: [{ tags: ["tag_inner"], value: 2 }] } },
  actions: {
    act_wear_talisman: {
      requires: { op: "and", of: [{ op: "item", item: "item_talisman" }, { op: "not", of: { op: "item", item: "item_talisman", equipped: true } }] },
      effects: [{ op: "equip", item: "item_talisman" }]
    },
    act_meditate: { minutes: 30, effects: [{ op: "resource", resource: "res_qi", add: 5 }] },
    act_duel: {
      requires: { op: "and", of: [{ op: "alive", subject: RIVAL }, { op: "not", of: { op: "flag", key: "duel_won" } }] },
      effects: [{ op: "choice", choice: "choice_duel", sourceId: "act_duel" }]
    }
  },
  choices: {
    choice_duel: {
      options: [
        {
          id: "opt_outer_form",
          check: { stat: "stat_body", skill: "skill_sword_art", tags: ["tag_outer"], difficulty: { base: 11, opposed: { subject: RIVAL, stat: "stat_body" } } },
          outcomes: { success: exchange([{ op: "hp", subject: RIVAL, add: -3 }]), fail: exchange([rivalAnswers(2)]) }
        },
        {
          id: "opt_inner_strike",
          requires: { op: "and", of: [{ op: "resource", resource: "res_qi", min: 2 }, { op: "item", item: "item_talisman", equipped: true }] },
          check: { stat: "stat_spirit", skill: "skill_sword_art", tags: ["tag_inner"], difficulty: { base: 12, opposed: { subject: RIVAL, stat: "stat_spirit" } } },
          outcomes: { success: exchange([pay(2), { op: "hp", subject: RIVAL, add: -5 }]), fail: exchange([pay(2), rivalAnswers(2)]) }
        }
      ]
    }
  },
  texts: { txt_won: "won" }
};

function run(state, actions, data = MARTIAL) {
  for (const action of actions) {
    const result = step(state, action, data);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), JSON.stringify(action));
    state = result.state;
  }
  return state;
}
const start = (seed = "martial-1") => createInitialState({ worldSeed: seed, data: MARTIAL }).state;
const g = (state, who = "player_1") => state.actors[who].growth.growth_martial;
const qi = (state, who = "player_1") => g(state, who).resources.res_qi.current;
const offered = (state) => {
  const r = step(state, C("opt_inner_strike"), MARTIAL);
  return !r.events.some((e) => e.type === "action.rejected");
};

// 1. the world validates and starts with its own grammar
function testWorld() {
  assert.deepStrictEqual(validateData(MARTIAL), []);
  const s = start();
  assert.deepStrictEqual(validateState(s), []);
  assert.deepStrictEqual(g(s).resources, { res_qi: { current: 5, max: 5 } });
  assert.deepStrictEqual(g(s, RIVAL).resources, { res_qi: { current: 4, max: 4 } });
  assert.strictEqual(s.actors[RIVAL].kind, "npc");
}

// 2. equipment changes availability and resolution; qi pays; the rival spends his own qi
function testDuel() {
  const s = start();
  const inDuel = run(s, [P("act_duel")]);
  assert.strictEqual(offered(inDuel), false, "the talisman is carried, not worn");
  const innerSpec = MARTIAL.choices.choice_duel.options[1].check;
  const carriedMods = check(innerSpec, { state: inDuel, data: MARTIAL, actorId: "player_1" }).result.modifiers;
  assert.ok(!carriedMods.some((m) => m.source === "item:item_talisman"), "carried: no +2");
  const worn = run(s, [P("act_wear_talisman"), P("act_duel")]);
  assert.deepStrictEqual(worn.actors.player_1.loadout, { slot_charm: "item_talisman" });
  const inner = step(worn, C("opt_inner_strike"), MARTIAL);
  assert.ok(!inner.events.some((e) => e.type === "action.rejected"));
  const resolved = inner.events.find((e) => e.type === "check.resolved").data;
  assert.ok(resolved.modifiers.some((m) => m.source === "item:item_talisman" && m.value === 2), "worn: the talisman's +2");
  assert.strictEqual(qi(inner.state), 3, "qi paid");
  // the meridian talent: +2 on the sword forms practice
  assert.strictEqual(g(inner.state).proficiency.prof_sword_forms, 6);
  // the rival's own technique on a clean miss, paid with his qi (find a failing roll)
  for (let i = 0; i < 200; i += 1) {
    const rolled = { ...worn, rng: start(`martial-roll-${i}`).rng };
    const r = step(rolled, C("opt_outer_form"), MARTIAL);
    if (r.events.find((e) => e.type === "check.resolved").data.tier !== "fail") continue;
    assert.strictEqual(qi(r.state, RIVAL), 2, "his qi");
    assert.strictEqual(worn.actors.player_1.hp.current - r.state.actors.player_1.hp.current, 4, "2 + his 2");
    return;
  }
  assert.fail("no failing roll found");
}

// 3. qi runs out, the technique closes; meditation (the world's own recovery) reopens it
function testRecovery() {
  let s = run(start(), [P("act_wear_talisman")]);
  s.actors.player_1.growth.growth_martial.resources.res_qi.current = 1;
  const duel = run(s, [P("act_duel")]);
  assert.strictEqual(offered(duel), false, "1 qi: closed");
  const rested = run(s, [P("act_meditate"), P("act_duel")]);
  assert.strictEqual(qi(rested), 5);
  assert.strictEqual(offered(rested), true);
  // a save from before this world had qi: no entry reads as full (D-85), here too
  const old = run(start(), [P("act_wear_talisman")]);
  delete old.actors.player_1.growth.growth_martial.resources;
  assert.strictEqual(offered(run(old, [P("act_duel")])), true);
}

// 4. save/load and determinism in the other world
function testSaveLoad() {
  const s = run(start(), [P("act_wear_talisman"), P("act_duel"), C("opt_inner_strike")]);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_martial", s, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, s);
  assert.deepStrictEqual(checkDataCompatibility(loaded, MARTIAL), []);
  assert.deepStrictEqual(run(start(), [P("act_wear_talisman"), P("act_duel"), C("opt_inner_strike")]), s);
}

// 5. the engine names none of this world: no martial word in web/v2/core
function testEngineIsWorldAgnostic() {
  const core = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "v2", "core");
  const source = fs.readdirSync(core).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(core, f), "utf8")).join("\n");
  for (const word of ["qi", "talisman", "meridian", "stamina", "sword", "lantern", "wanderer", "scout"]) {
    assert.ok(!new RegExp(`\\b${word}\\b`, "i").test(source), `the engine does not name "${word}"`);
  }
}

testWorld();
testDuel();
testRecovery();
testSaveLoad();
testEngineIsWorldAgnostic();

console.log("V2-Core-61 world-grammar-portability.test.js: all checks passed");
