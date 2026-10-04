// V2-Core-78 (#189, Fantasy World Vertical Slice 5, step 3 -- the caravan guard): through the ordinary
// step() API and the real pack. No engine change; additive content only (D-92/D-95):
//   the merchants' guild clerk in the castle town (a dialogue NPC, no actor) hires guards for the caravans
//   (World Bible delegated decision WB-0021). The escort is a STR check with the swordsmanship skill and
//   costs 2 stamina whatever comes of it; it pays by tier (a failure still pays a little but wounds), it
//   practises swordsmanship, and it ends at the far bank with the caravan. One guard per caravan: the world
//   cannot hire more guards than caravans have come (`guards_hired` < `caravan_visits`). Who guarded is
//   player-dependent history; pay, difficulty, costs and time are gameplay values.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const CLERK = (optionId) => [P("act_talk_guild_clerk"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
// history-41: the dispersal, the crossing, the road north -- data-world-castle-town
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const me = (state) => state.actors[state.player.actorId];
const growth = (state) => me(state).growth.growth_wanderer;
const escortCheck = (result) => result.events.find((e) => e.type === "check.resolved").data;
const offered = (state, optionId) => {
  const option = worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === optionId);
  return option.requires === undefined || evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};
const withStr = (state, str) => {
  const s = structuredClone(state);
  growth(s).stats.str = str;
  return s;
};

const town = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;

// 1. the clerk: only in the castle town; a dialogue NPC; work while a caravan lacks a guard
function testClerk() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.npcs.npc_guild_clerk.actor, undefined, "dialogue only (D-92)");
  assert.strictEqual(town.signals.caravan_visits, 1);
  assert.strictEqual(town.signals.guards_hired, undefined);
  const farBank = run(town, [M("loc_far_bank")]).state;
  assert.strictEqual(rejected(farBank, P("act_talk_guild_clerk")), "requirements_not_met", "in the castle town");
  assert.deepStrictEqual(texts(run(town, CLERK("opt_guild_clerk_ask")).log[1])[0], "txt_guild_clerk_work"); // V2-Core-97: then the clerk's assessment
  const noCaravan = structuredClone(town);
  delete noCaravan.signals.caravan_visits;
  assert.deepStrictEqual(texts(run(noCaravan, CLERK("opt_guild_clerk_ask")).log[1]), ["txt_guild_clerk_no_work"]);
  assert.strictEqual(offered(noCaravan, "opt_guild_clerk_escort"), false, "no caravan, no guard wanted");
  const tired = structuredClone(town);
  me(tired).growth.growth_wanderer.resources.stamina.current = 1;
  assert.strictEqual(offered(tired, "opt_guild_clerk_escort"), false, "2 stamina");
  assert.strictEqual(offered(town, "opt_guild_clerk_escort"), true);
}

// 2. the escort: the check, the pay by tier, the practice, the cost, the road south to the far bank
function testEscort() {
  const seen = new Set();
  for (const str of [1, 4, 8, 12, 16, 20, 30]) {
    const before = withStr(town, str);
    const done = run(before, CLERK("opt_guild_clerk_escort"));
    const check = escortCheck(done.log[1]);
    assert.strictEqual(check.difficulty >= 0, true);
    const tier = check.tier === "partial" ? "fail" : check.tier; // no partial outcome: falls back to fail (§2.3)
    seen.add(tier);
    const pay = { great: 6, success: 4, fail: 1 }[tier];
    const practice = { great: 10, success: 10, fail: 5 }[tier];
    assert.strictEqual(me(done.state).money, me(before).money + pay, `pay on ${tier}`);
    assert.strictEqual(growth(done.state).proficiency.swordsmanship - (growth(before).proficiency?.swordsmanship ?? 0), practice, `practice on ${tier}`);
    assert.strictEqual(growth(done.state).resources.stamina.current, growth(before).resources.stamina.current - 2, "2 stamina, whatever comes of it");
    assert.strictEqual(me(done.state).hp.current, me(before).hp.current - (tier === "fail" ? 3 : 0), `wounds on ${tier}`);
    assert.strictEqual(me(done.state).locationId, "loc_far_bank", "the escort ends at the far bank");
    assert.strictEqual(done.state.time.minute - before.time.minute >= 720, true, "a long road");
    assert.strictEqual(done.state.signals.guards_hired, 1);
    assert.ok(texts(done.log[1]).includes({ great: "txt_escort_great", success: "txt_escort_success", fail: "txt_escort_fail" }[tier]));
  }
  assert.deepStrictEqual([...seen].sort(), ["fail", "great", "success"], "every tier reached");
}

// 3. one guard per caravan: hired, the work is gone until the next caravan comes
function testOnePerCaravan() {
  const guarded = run(withStr(town, 20), CLERK("opt_guild_clerk_escort")).state;
  const back = run(guarded, [M("loc_castle_town")]).state;
  assert.strictEqual(offered(back, "opt_guild_clerk_escort"), false, "this caravan has its guard");
  assert.deepStrictEqual(texts(run(back, CLERK("opt_guild_clerk_ask")).log[1]), ["txt_guild_clerk_no_work"]);
  const later = run(back, [DAY, DAY, DAY]).state;
  assert.strictEqual(later.signals.caravan_visits, 2, "the next caravan");
  assert.strictEqual(offered(later, "opt_guild_clerk_escort"), true, "wants a guard again");
  // and the world remembers it, not the character: a successor sees the same counts
  const after = structuredClone(later);
  after.signals.guards_hired = 2;
  assert.strictEqual(offered(after, "opt_guild_clerk_escort"), false);
  after.signals.caravan_visits = 3;
  assert.strictEqual(offered(after, "opt_guild_clerk_escort"), true, "the third caravan");
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/guild|guards_hired/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const path = [...CLERK("opt_guild_clerk_ask"), ...CLERK("opt_guild_clerk_escort"), M("loc_castle_town")];
  const end = run(town, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_guard", town, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, town);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state, path).state, end, "the same input, the same world");
}

testClerk();
testEscort();
testOnePerCaravan();
testSaveAndDeterminism();
console.log("V2-Core-78 data-world-caravan-guard.test.js: all checks passed");
