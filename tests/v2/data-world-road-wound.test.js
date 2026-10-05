// V2-Core-93 (#226, RPG Depth 1, step 2 -- a hard road leaves a mark): through the ordinary step() API and the real
// pack. No engine change; additive content only (D-92/D-99):
//   a failed escort leaves a wound (`road_wound`, a trait of the character's growth system) that weighs on
//   every combat check (-2). Since V2-Core-121 (Death & Injury, the owner's change) it is the MILD wound: a night's rest closes
//   it (it used to stay until the salve); the herbalist's salve closes it at once (`act_treat_road_wound`: needs the wound and a
//   salve; the salve is used up). A second failure while wounded adds nothing more. The wound is the character's: a successor
//   starts whole. The modifier and the treatment are gameplay values. The deep wound is data-world-deep-wound.test.js's.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const CLERK = (optionId) => [P("act_talk_guild_clerk"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
const TREAT = P("act_treat_road_wound");
// history-41: the dispersal, the crossing, the road north -- data-world-caravan-guard
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const HOME = [M("loc_river_ford"), M("loc_crossroads"), M("loc_village")]; // the escort ends at the far bank

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
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const wounded = (s) => growth(s).traits?.road_wound === true;
const check = (result) => result.events.find((e) => e.type === "check.resolved")?.data;
const withStr = (s, str) => { const c = structuredClone(s); growth(c).stats.str = str; return c; };
const rested = (s) => { const c = structuredClone(s); growth(c).resources.stamina.current = 6; return c; };
const escort = (s) => { const r = run(rested(s), CLERK("opt_guild_clerk_escort")); return { state: r.state, result: r.log[1] }; };
const withSalve = (s, n = 1) => { const c = structuredClone(s); me(c).inventory.item_herbal_salve = n; return c; };

const town = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;

// 1. a failed escort wounds; a good one does not
function testWound() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.ok(!wounded(town));
  const failed = escort(withStr(town, 1));
  assert.strictEqual(check(failed.result).tier, "fail");
  assert.ok(wounded(failed.state), "the wound stays");
  assert.ok(texts(failed.result).includes("txt_escort_wound"));
  const good = escort(withStr(town, 30));
  assert.strictEqual(check(good.result).tier, "great");
  assert.ok(!wounded(good.state));
  const fine = escort(withStr(town, 14));
  assert.strictEqual(check(fine.result).tier, "success");
  assert.ok(!wounded(fine.state), "a success leaves no wound either");
  return failed.state;
}

// 2. it weighs on combat checks; a night's rest closes it; a second failure adds nothing
function testWeighs(hurt) {
  const next = run(withStr(hurt, 14), [M("loc_castle_town"), DAY, DAY, DAY]).state;
  const e = escort(next);
  assert.deepStrictEqual(check(e.result).modifiers.find((m) => m.source === "trait:road_wound"), { source: "trait:road_wound", value: -2 });
  const healthy = structuredClone(next);
  delete growth(healthy).traits.road_wound;
  const h = escort(healthy);
  assert.strictEqual(check(h.result).total - check(e.result).total, 2, "two points on the same roll");
  // rest restores hp and stamina, and closes the mild wound (V2-Core-121); not yet rested, it stays
  const rested = run(hurt, [...HOME, P("act_rest_village"), P("act_rest_village"), P("act_rest_village")]).state;
  assert.strictEqual(me(rested).hp.current, me(rested).hp.max);
  assert.ok(!wounded(rested), "rest closes a mild wound");
  const home = run(hurt, HOME).state;
  assert.ok(wounded(home), "not yet rested: still wounded");
  // failing again while wounded adds nothing more
  const again = escort(withStr(run(hurt, [M("loc_castle_town"), DAY, DAY, DAY]).state, 1));
  assert.strictEqual(check(again.result).tier, "fail");
  assert.ok(!texts(again.result).includes("txt_escort_wound"), "already wounded");
  assert.ok(wounded(again.state));
  return home;
}

// 3. the salve closes it: only with the wound and a salve; the salve is used up
function testTreatment(home) {
  assert.strictEqual(rejected(home, TREAT), "requirements_not_met", "no salve");
  const treated = run(withSalve(home, 2), [TREAT]);
  assert.deepStrictEqual(texts(treated.log[0]), ["txt_treat_road_wound"]);
  assert.ok(!wounded(treated.state));
  assert.strictEqual(me(treated.state).inventory.item_herbal_salve, 1);
  assert.strictEqual(treated.state.time.minute - home.time.minute, 30);
  assert.strictEqual(rejected(treated.state, TREAT), "requirements_not_met", "nothing left to treat");
  assert.strictEqual(rejected(withSalve(town), TREAT), "requirements_not_met", "no wound");
  // treated anywhere: it is the character's wound, not a place's
  const onTheRoad = run(withSalve(run(withStr(town, 1), CLERK("opt_guild_clerk_escort")).state), [TREAT]).state;
  assert.ok(!wounded(onTheRoad));
}

// 4. the wound is the character's: a successor starts whole
function testSuccessor(hurt) {
  let s = run(hurt, [M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), M("loc_ruins")]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.ok(!wounded(next), "a new life, no old wound");
}

// 5. save compatibility and determinism
function testSaveAndDeterminism(hurt) {
  const path = [...HOME, TREAT, P("act_rest_village")];
  const start = withSalve(hurt);
  const end = run(start, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_wound", start, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, start);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(start, path).state, end, "the same input, the same world");
}

const hurt = testWound();
const home = testWeighs(hurt);
testTreatment(home);
testSuccessor(hurt);
testSaveAndDeterminism(hurt);
console.log("V2-Core-93 data-world-road-wound.test.js: all checks passed");
