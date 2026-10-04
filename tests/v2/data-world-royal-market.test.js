// V2-Core-89 (#217, Fantasy World Vertical Slice 8, step 2 -- the greatest market): through the ordinary step()
// API and the real pack. No engine change; additive content only (D-92/D-98):
//   the royal city's market (World Bible WB-0011: the realm's greatest market) is observed, not traded: an hour
//   among its stalls shows the centre's scale. In the fair's window (the second caravan's news) the fair the
//   ferryman spoke of stands at its source -- what was heard is now seen (`rum_realm_fair` observed at the
//   royal city, D-14). After the fair, what it left behind. No prices, no new Canon; the narration is
//   Provisional; the market's inner structure stays the owner's (WB-0023).
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
// history-41: the dispersal, the crossing, the way read, five days north -- data-world-royal-road
const TO_ROYAL_CITY = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), P("act_read_waystation_board"), M("loc_royal_city")
];
const MARKET = P("act_walk_royal_market");

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
const visits = (s, n, fair) => {
  const c = structuredClone(s);
  c.signals.caravan_visits = n;
  if (fair) c.facts.fact_realm_fair = { value: "known" }; else delete c.facts.fact_realm_fair;
  return c;
};

const arrived = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_ROYAL_CITY).state;

// 1. the market: only in the royal city; an hour; the centre's scale
function testMarket() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(arrived.actors.player_1.locationId, "loc_royal_city");
  const farBank = run(arrived, [M("loc_far_bank")]).state;
  assert.strictEqual(rejected(farBank, MARKET), "requirements_not_met", "in the royal city");
  const walked = run(arrived, [MARKET]);
  assert.strictEqual(texts(walked.log[0])[0], "txt_royal_market");
  assert.strictEqual(walked.state.time.minute - arrived.time.minute, 60);
  assert.deepStrictEqual(walked.state.facts, arrived.facts, "observing changes no fact");
  const again = run(walked.state, [MARKET]);
  assert.strictEqual(texts(again.log[0])[0], "txt_royal_market", "as often as one likes");
}

// 2. the fair's window: the fair seen at its source -- heard becomes seen
function testTheFair() {
  // natural play: five days after the first caravan, the second has brought the fair's news
  assert.strictEqual(arrived.signals.caravan_visits, 2);
  const before = structuredClone(arrived);
  before.knowledge.player_1.rum_realm_fair = { rumorId: "rum_realm_fair", factId: "fact_realm_fair", claim: "known", source: "npc_ferryman", sources: ["npc_ferryman"], confidence: 60, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 };
  const seen = run(before, [MARKET]);
  assert.deepStrictEqual(texts(seen.log[0]), ["txt_royal_market", "txt_royal_market_fair"]);
  const fair = kn(seen.state, "rum_realm_fair");
  // the same claim reconfirmed by a new source: the engine's rule (D-14/§ rumor) -- a confirmation and the source
  // are added; the pack sets no confidence gain for it (rules.rumor absent), so confidence stays as heard
  assert.strictEqual(fair.confirmations, 2, "heard, then seen");
  assert.ok(fair.sources.includes("obs_loc_royal_city") && fair.sources.includes("npc_ferryman"), "the hearing and the seeing both kept");
  assert.strictEqual(fair.confidence, 60);
  // one who never heard of it learns it here, first-hand
  const fresh = run(arrived, [MARKET]).state;
  assert.strictEqual(kn(fresh, "rum_realm_fair").confidence, 90);
  assert.deepStrictEqual(kn(fresh, "rum_realm_fair").sources, ["obs_loc_royal_city"]);
  // seeing reads the world's truth: with no fair in the world there is nothing to see, whatever the count says
  const noFair = run(visits(arrived, 2, false), [MARKET]).state;
  assert.strictEqual(kn(noFair, "rum_realm_fair"), undefined, "observed, not told");
}

// 3. before and after the fair
function testBeforeAndAfter() {
  const before = run(visits(arrived, 1, false), [MARKET]);
  assert.deepStrictEqual(texts(before.log[0]), ["txt_royal_market"], "no fair yet, nothing said of one");
  assert.strictEqual(kn(before.state, "rum_realm_fair"), undefined);
  const after = run(visits(arrived, 3, true), [MARKET]);
  assert.deepStrictEqual(texts(after.log[0]), ["txt_royal_market", "txt_royal_market_after_fair"]);
  assert.strictEqual(kn(after.state, "rum_realm_fair"), undefined, "the fair is past: nothing to see of it but its traces");
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  const path = [MARKET, M("loc_far_bank")];
  const end = run(arrived, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_royal_market", arrived, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, arrived);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_ROYAL_CITY).state, path).state, end, "the same input, the same world");
}

testMarket();
testTheFair();
testBeforeAndAfter();
testSaveAndDeterminism();
console.log("V2-Core-89 data-world-royal-market.test.js: all checks passed");
