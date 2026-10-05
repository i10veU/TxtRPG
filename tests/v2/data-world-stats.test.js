// V2-Core-51 (Issue #135, Stats Decision, D-80): the fantasy prototype's common stats are STR / DEX /
// CON / INT / WIS / PER (`str`/`dex`/`con`/`int`/`wis`/`per`); `wit` is gone, its roles mapped:
//   ruins investigation -> INT; confrontation -> WIS vs the leader's WIS;
//   frontal strike -> STR vs the leader's STR; counter -> DEX vs the leader's DEX.
// CON and PER were defined only (since V2-Core-64 the well and the spring read PER, the miasma CON). The values keep every existing check's
// numbers (the player 8 everywhere, the old wit; the leader 10 everywhere), so the play is the same
// with the stats' names changed. Pack version 0.3.0: a 0.2.0 save is refused (D-68). Data only.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { worldData } from "../../web/v2/data/world.js";

const STATS = ["str", "dex", "con", "int", "wis", "per"];
const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });
const SEED = "history-41";
const TO_CONFRONT = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), CHOOSE("opt_ask_ruins"),
  MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins"),
  MOVE("loc_village"), P("act_rest_village"), P("act_talk_elder"), CHOOSE("opt_report_findings")
];
const TO_DISPERSAL = [...TO_CONFRONT, P("act_confront_leader"), P("act_talk_elder"), CHOOSE("opt_bandits_disperse")];
const TO_FIGHT = [...TO_CONFRONT.slice(0, 9), MOVE("loc_village"), P("act_rest_village"), P("act_rest_village"), MOVE("loc_ruins"), P("act_fight_leader")];

function run(state, actions, data = worldData) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, data);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const start = (data = worldData) => createInitialState({ worldSeed: SEED, data }).state;
const checkOf = (result) => result.events.find((e) => e.type === "check.resolved")?.data;
const statsOf = (actor) => actor.growth.growth_wanderer.stats;
const statModifiers = (check) => check.modifiers.filter((m) => m.source.startsWith("stat:"));

// every check spec in the pack, with where it is
function checkSpecs(data) {
  const specs = [];
  for (const [id, action] of Object.entries(data.actions)) if (action.check) specs.push({ where: id, spec: action.check });
  for (const [id, choice] of Object.entries(data.choices)) {
    for (const option of choice.options) if (option.check) specs.push({ where: `${id}.${option.id}`, spec: option.check });
  }
  // V2-Core-64: a checked data.events entry is a check too
  for (const [id, event] of Object.entries(data.events)) if (event.check) specs.push({ where: id, spec: event.check });
  return specs;
}

// 1. the schema: six stats, wit nowhere
function testSchema() {
  const defined = worldData.growthSystems.growth_wanderer.stats;
  assert.deepStrictEqual(defined.map((s) => s.id), STATS);
  for (const stat of defined) assert.deepStrictEqual([stat.min, stat.max, stat.base], [0, 20, 8], stat.id);
  assert.ok(!JSON.stringify(worldData).includes('"wit"'), "no wit anywhere in the pack");
  assert.strictEqual(worldData.version, "0.3.0");
}

// 2. the actors: the player 8 everywhere (the old wit), the leader 10 everywhere; a successor the same
function testActors() {
  const state = start();
  assert.deepStrictEqual(statsOf(state.actors.player_1), Object.fromEntries(STATS.map((s) => [s, 8])));
  assert.deepStrictEqual(statsOf(state.actors.npc_bandit_leader), Object.fromEntries(STATS.map((s) => [s, 10])));
  const dead = run(state, [MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), ...Array.from({ length: 4 }, () => ({ type: "wait", minutes: 30 }))]).state;
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  const successor = run(dead, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.deepStrictEqual(statsOf(successor.actors.player_2), statsOf(state.actors.player_1));
}

// 3. every check names a defined stat (a stale name would silently read 0, a -5), with the mapping
function testEveryCheckNamesADefinedStat() {
  const mapping = Object.fromEntries(checkSpecs(worldData).map(({ where, spec }) => [where, [spec.stat, spec.difficulty?.opposed?.stat ?? null]]));
  assert.deepStrictEqual(mapping, {
    act_investigate_ruins: ["int", null],
    act_confront_leader: ["wis", "wis"],
    "choice_fight_leader.opt_fight_strike": ["str", "str"],
    "choice_fight_leader.opt_fight_sword_cut": ["str", "str"], // V2-Core-58: the strike, with a blade
    "choice_fight_leader.opt_fight_counter": ["dex", "dex"],
    "choice_fight_leader.opt_fight_weak_spot": ["str", "str"], // V2-Core-55: the strike at an easier mark
    // V2-Core-64 (#160): the fouled well -- the first checks to read PER and CON
    act_inspect_well: ["per", null],
    act_search_spring: ["per", null],
    evt_spring_miasma: ["con", null],
    act_gather_herbs: ["wis", null], // V2-Core-65: knowing the herbs
    act_read_milestone: ["int", null], // V2-Core-72: the worn letters
    act_search_crossroads: ["per", null],
    "choice_guild_clerk_dialogue.opt_guild_clerk_escort": ["str", null], // V2-Core-78: the caravan guard
    "choice_guild_clerk_dialogue.opt_guild_clerk_escort_lead": ["str", null] // V2-Core-105: leading it
  });
  for (const [where, [stat, opposed]] of Object.entries(mapping)) {
    assert.ok(STATS.includes(stat), where);
    if (opposed !== null) assert.ok(STATS.includes(opposed), where);
  }
}

// 4. in play: each check reads its stat, and the opposed difficulty follows the leader's own stat of
// the same kind (and no other)
function testMappingInPlay() {
  const { log } = run(start(), TO_CONFRONT);
  assert.deepStrictEqual(statModifiers(checkOf(log[8])), [{ source: "stat:int", value: -1 }], "investigation reads INT");

  const before = run(start(), TO_CONFRONT).state;
  const confrontWith = (patch) => {
    const s = structuredClone(before);
    Object.assign(statsOf(s.actors.npc_bandit_leader), patch);
    return checkOf(step(s, P("act_confront_leader"), worldData));
  };
  assert.deepStrictEqual(statModifiers(confrontWith({})), [{ source: "stat:wis", value: -1 }], "the confrontation reads WIS");
  assert.strictEqual(confrontWith({}).difficulty, 14);
  assert.strictEqual(confrontWith({ wis: 14 }).difficulty, 16);
  assert.strictEqual(confrontWith({ str: 20, dex: 20, int: 20 }).difficulty, 14, "only his WIS");

  const fighting = run(start(), TO_FIGHT).state;
  assert.strictEqual(fighting.pending?.choiceId, "choice_fight_leader");
  const exchangeWith = (option, patch) => {
    const s = structuredClone(fighting);
    Object.assign(statsOf(s.actors.npc_bandit_leader), patch);
    return checkOf(step(s, CHOOSE(option), worldData));
  };
  assert.deepStrictEqual(statModifiers(exchangeWith("opt_fight_strike", {})), [{ source: "stat:str", value: -1 }]);
  assert.strictEqual(exchangeWith("opt_fight_strike", {}).difficulty, 11);
  assert.strictEqual(exchangeWith("opt_fight_strike", { str: 16 }).difficulty, 14);
  assert.strictEqual(exchangeWith("opt_fight_strike", { dex: 20 }).difficulty, 11, "the strike: only his STR");
  assert.deepStrictEqual(statModifiers(exchangeWith("opt_fight_counter", {})), [{ source: "stat:dex", value: -1 }]);
  assert.strictEqual(exchangeWith("opt_fight_counter", { dex: 16 }).difficulty, 15);
  assert.strictEqual(exchangeWith("opt_fight_counter", { str: 20 }).difficulty, 12, "the counter: only his DEX");
}

// 5. the play is the same as with the previous pack's wit, the stats' names aside
function testSamePlayAsWithWit() {
  const previous = structuredClone(worldData);
  previous.growthSystems.growth_wanderer.stats = [{ id: "wit", min: 0, max: 20, base: 8 }];
  previous.characterTemplates.start_wanderer.growth.growth_wanderer.stats = { wit: 8 };
  previous.npcs.npc_bandit_leader.actor.growth.growth_wanderer.stats = { wit: 10 };
  for (const { spec } of checkSpecs(previous)) {
    spec.stat = "wit";
    if (spec.difficulty?.opposed) spec.difficulty.opposed.stat = "wit";
  }
  assert.deepStrictEqual(validateData(previous), []);
  const named = (log) => JSON.stringify(log.map((r) => r.events)).replace(/"stat:[a-z]+"/g, '"stat:*"');
  for (const actions of [TO_DISPERSAL, [...TO_FIGHT, CHOOSE("opt_fight_strike"), CHOOSE("opt_fight_strike")]]) {
    assert.strictEqual(named(run(start(), actions).log), named(run(start(previous), actions, previous).log));
  }
}

// 6. a 0.2.0 save is refused and left as it is (D-68)
function testOldSaveRefused() {
  const state = run(start(), TO_CONFRONT).state;
  assert.deepStrictEqual(checkDataCompatibility(state, worldData), []);
  const old = structuredClone(state);
  old.dataRef = { id: worldData.id, version: "0.2.0" };
  for (const actor of Object.values(old.actors)) actor.growth.growth_wanderer.stats = { wit: actor.kind === "npc" ? 10 : 8 };
  const copy = structuredClone(old);
  const errors = checkDataCompatibility(old, worldData);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /^dataRef mismatch/);
  assert.deepStrictEqual(old, copy, "checking does not repair");
}

assert.deepStrictEqual(validateData(worldData), []);
testSchema();
testActors();
testEveryCheckNamesADefinedStat();
testMappingInPlay();
testSamePlayAsWithWit();
testOldSaveRefused();

console.log("V2-Core-51 data-world-stats.test.js: all checks passed");
