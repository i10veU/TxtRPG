// V2-Core-97 (#237, World Simulation 1, step 2 -- the guild sizes up a guard): through the ordinary step() API and the
// real pack. No engine change; additive content only (D-92/D-100):
//   when a caravan wants a guard, the clerk says how the road looks for this one: too hurt to come back from a bad
//   road (hp 3 or less -- a failed escort costs 3), carrying a road wound, or riding without leather. Information the
//   player can judge by; asking changes nothing -- the risk is the same, only visible. The weak wanderer of RPG Depth 1
//   is now warned before the escort that would kill them. The words are Provisional; the thresholds gameplay values.
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
const DAY = { type: "wait", minutes: 1440 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const ASSESSMENT = ["txt_guild_clerk_too_hurt", "txt_guild_clerk_sees_wound", "txt_guild_clerk_no_leather"];
// history-41: the dispersal, the crossing, the road north -- data-world-caravan-guard
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
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const me = (s) => s.actors[s.player.actorId];
const said = (s) => texts(run(s, ASK).log[1]).filter((t) => ASSESSMENT.includes(t));
const variant = (s, f) => { const c = structuredClone(s); f(c); return c; };

const town = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
const worn = variant(town, (c) => { me(c).inventory.item_leather_jerkin = 1; me(c).loadout = { ...(me(c).loadout ?? {}), body: "item_leather_jerkin" }; });

// 1. what the clerk sees
function testAssessment() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(me(town).hp.current, 6);
  assert.deepStrictEqual(said(town), ["txt_guild_clerk_no_leather"], "unprotected");
  assert.deepStrictEqual(said(worn), [], "ready for the road: nothing to say");
  const carried = variant(town, (c) => { me(c).inventory.item_leather_jerkin = 1; });
  assert.deepStrictEqual(said(carried), ["txt_guild_clerk_no_leather"], "carried is not worn");
  assert.deepStrictEqual(said(variant(worn, (c) => { me(c).growth.growth_wanderer.traits = { road_wound: true }; })), ["txt_guild_clerk_sees_wound"]);
  assert.deepStrictEqual(said(variant(worn, (c) => { me(c).hp.current = 3; })), ["txt_guild_clerk_too_hurt"], "one bad road from death");
  assert.deepStrictEqual(said(variant(worn, (c) => { me(c).hp.current = 4; })), [], "4 survives a failed escort");
  // no work, no assessment
  const guarded = variant(town, (c) => { c.signals.guards_hired = 1; });
  const t = texts(run(guarded, ASK).log[1]);
  assert.deepStrictEqual(t, ["txt_guild_clerk_no_work", "txt_guild_yard_road_quiet", "txt_guild_clerk_road_for_known"], "no assessment (V2-Core-125: the road's news is not an assessment)");
}

// 2. asking changes nothing: the same escort, the same outcome
function testOnlyInformation() {
  const asked = run(town, ASK).state;
  assert.deepStrictEqual(asked.facts, town.facts);
  assert.deepStrictEqual(asked.signals, town.signals);
  assert.deepStrictEqual(me(asked), me(town));
  const direct = run(town, ESCORT);
  const after = run(asked, ESCORT);
  assert.deepStrictEqual(direct.log[1].events.find((e) => e.type === "check.resolved").data.total, after.log[1].events.find((e) => e.type === "check.resolved").data.total);
}

// 3. the weak wanderer is warned before the escort that would kill them
function testWarned() {
  const first = run(town, ESCORT).state; // fails: 3 hp and a wound (data-world-guard-career)
  const next = run(first, [M("loc_castle_town"), DAY, DAY, DAY]).state;
  assert.strictEqual(me(next).hp.current, 3);
  assert.deepStrictEqual(said(next), ["txt_guild_clerk_too_hurt", "txt_guild_clerk_sees_wound", "txt_guild_clerk_no_leather"], "the whole truth");
  const asked = run(next, ASK).state;
  assert.deepStrictEqual(me(asked), me(next), "a warning, not a cure");
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  const path = [...ASK, ...ESCORT, M("loc_castle_town"), DAY, DAY, DAY, ...ASK];
  const end = run(town, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_assessment", town, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, town);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(town, path).state, end, "the same input, the same world");
}

testAssessment();
testOnlyInformation();
testWarned();
testSaveAndDeterminism();
console.log("V2-Core-97 data-world-guard-assessment.test.js: all checks passed");
