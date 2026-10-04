// V2-Core-90 (#217, Fantasy World Vertical Slice 8, step 3 -- the records): through the ordinary step() API and
// the real pack. No engine change; additive content only (D-92/D-98):
//   the centre keeps more written word than anywhere (World Bible N-06); in the royal city the realm's news is
//   posted in writing (delegated decision WB-0024 DC-07 -- who keeps it stays open). Once the border's unrest is
//   news, it is written many ways that disagree (its truth is the owner's, WB-0012): learned only as a claim.
//   The frontier is in none of it -- whatever happened there, however it was told in the castle town: the far
//   end of the information gradient. Reading changes no fact.
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
// history-41: the dispersal, the crossing, the way read, five days north -- data-world-royal-road
const TO_ROYAL_CITY = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), P("act_read_waystation_board"), M("loc_royal_city")
];
const READ = P("act_read_royal_records");

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
const kn = (s, rumor) => s.knowledge?.[s.player.actorId]?.[rumor];

const arrived = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_ROYAL_CITY).state;
const unrest = (() => { let s = arrived; while (s.facts.fact_realm_unrest?.value !== "known") s = run(s, [DAY]).state; return s; })();

// 1. the written word: only in the royal city; before the unrest is news, nothing of it
function testRecords() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(rejected(run(arrived, [M("loc_far_bank")]).state, READ), "requirements_not_met", "in the royal city");
  assert.strictEqual(arrived.facts.fact_realm_unrest, undefined, "the second caravan's time: the fair, not yet the unrest");
  const read = run(arrived, [READ]);
  assert.deepStrictEqual(texts(read.log[0]), ["txt_royal_records", "txt_royal_records_no_frontier"]);
  assert.strictEqual(read.state.time.minute - arrived.time.minute, 40);
  assert.deepStrictEqual(read.state.knowledge, arrived.knowledge, "nothing learned yet");
  assert.deepStrictEqual(read.state.facts, arrived.facts);
}

// 2. the border's unrest, written many ways: a claim, not the truth
function testUnrest() {
  const read = run(unrest, [READ]);
  assert.deepStrictEqual(texts(read.log[0]), ["txt_royal_records", "txt_royal_records_unrest", "txt_royal_records_no_frontier"]);
  const k = kn(read.state, "rum_realm_unrest");
  assert.strictEqual(k.confidence, 50, "the written accounts disagree");
  assert.deepStrictEqual(k.sources, ["src_royal_records"]);
  assert.deepStrictEqual(read.state.facts, unrest.facts, "reading changes no fact");
  // one who heard it from the ferryman (60) keeps that; the records add a source
  const heard = structuredClone(unrest);
  heard.knowledge.player_1.rum_realm_unrest = { rumorId: "rum_realm_unrest", factId: "fact_realm_unrest", claim: "known", source: "npc_ferryman", sources: ["npc_ferryman"], confidence: 60, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 };
  const both = kn(run(heard, [READ]).state, "rum_realm_unrest");
  assert.strictEqual(both.confidence, 60);
  assert.deepStrictEqual(both.sources, ["npc_ferryman", "src_royal_records"]);
}

// 3. the frontier is in none of it -- however far its word travelled
function testNoFrontier() {
  const famous = structuredClone(unrest);
  Object.assign(famous.flags, { village_honored: true, bandits_truth_north: true, well_truth_north: true, bandits_tale_corrected: true });
  const read = run(famous, [READ]);
  assert.ok(texts(read.log[0]).includes("txt_royal_records_no_frontier"), "not even the corrected word of the castle town");
  const learned = Object.keys(read.state.knowledge.player_1).filter((r) => !(r in famous.knowledge.player_1));
  assert.deepStrictEqual(learned, ["rum_realm_unrest"], "nothing of the frontier learned here");
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  const path = [READ, DAY, DAY, DAY, READ];
  const end = run(arrived, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_royal_records", arrived, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, arrived);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_ROYAL_CITY).state, path).state, end, "the same input, the same world");
}

testRecords();
testUnrest();
testNoFrontier();
testSaveAndDeterminism();
console.log("V2-Core-90 data-world-royal-records.test.js: all checks passed");
