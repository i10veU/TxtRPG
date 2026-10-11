// V2-Core-135 (#335, MG-045/046, D-114): how long a word holds, and the miller's reading of the caravan's purchase.
//   1. `validDays` on rumour definitions: the town's want and the road's condition hold a caravan's cadence (3 days);
//      what the caravan took is history (none). validateData refuses anything but a positive integer
//   2. the caravan buys the mill's sack while the town wants one: the miller reads it as "the town wants flour" (his
//      guess, 50, dated that day) while the ferryman, who hears the caravan's step out, knows the want was met ("enough")
//      -- two words about the same day that disagree, from two sources with different vantage points
//   3. the player hears the miller at the mill (no walk, a guess) and the ferryman at the ford (a walk, a word) -- both
//      entries stay, the newer or surer one is the player's to choose
//   4. before any purchase, the miller has nothing to read; save/load keeps his word
// node:assert/strict only (§13.1).
import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const MILLER = (o) => [P("act_talk_miller"), C(o)];
const MERCHANT = (o) => [P("act_talk_town_merchant"), C(o)];
const FERRY = (o) => [P("act_talk_ferryman"), C(o)];
const DAY = { type: "wait", minutes: 1440 };
// history-41 to the mill with the settlements trading -- as data-world-flour-fair
const TO_TRADE = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet"), ...MILLER("opt_miller_flour"),
  M("loc_crossroads"), M("loc_village"), ...E("opt_deliver_flour"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_mill_hamlet")
];
const TO_FORD = [M("loc_crossroads"), M("loc_river_ford")];

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
const texts = (r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const me = (s) => s.actors[s.player.actorId];
const mine = (s) => s.knowledge[s.player.actorId] ?? {};
const day = (s) => Math.floor(s.time.minute / 1440);
const rel = (s, npc) => s.relations?.[`${npc}:${s.player.actorId}`]?.score ?? 0;
const offered = (s, choice, id) => evaluateCondition(worldData.choices[choice].options.find((o) => o.id === id).requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const atFord = (s, id) => offered(s, "choice_ferryman_dialogue", id);
const atMerchant = (s, id) => offered(s, "choice_town_merchant_dialogue", id);

// a trader without the elder's letter (staged: the letter would make every crossing free and hide the fare), twenty silver
const start = (() => {
  const s = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TRADE).state;
  s.actors.player_1.money = 20;
  delete s.actors.player_1.inventory.item_passage_letter;
  return s;
})();


// 1. validDays
function testValidDays() {
  assert.deepStrictEqual(validateData(worldData), []);
  for (const id of ["rum_town_flour_wanted", "rum_town_flour_enough", "rum_town_flour_caravan_bought", "rum_road_quiet", "rum_road_uneasy", "rum_road_dangerous", "rum_road_talk_quiet", "rum_road_talk_unsettled"]) {
    assert.equal(worldData.rumors[id].validDays, 3, `${id}: a caravan's cadence`);
  }
  assert.equal(worldData.rumors.rum_caravan_took_flour.validDays, undefined, "history does not expire");
  for (const bad of [0, -1, 1.5, "3", null]) {
    const copy = { ...worldData, rumors: { ...worldData.rumors, rum_road_quiet: { ...worldData.rumors.rum_road_quiet, validDays: bad } } };
    assert.ok(validateData(copy).some((e) => e.includes("rumors.rum_road_quiet.validDays")), `refused: ${JSON.stringify(bad)}`);
  }
}

// 2-3. a town wanting one sack, its want last come back just now (staged as data-world-ford-and-town's #333 case), the
// trader waiting at the mill: the caravan buys the sack and meets the want
function testTheMillersReading() {
  const before = run(start, MILLER("opt_miller_news"));
  assert.equal(before.state.knowledge.npc_miller, undefined, "no purchase yet: nothing to read");
  assert.ok(!texts(before.log[1]).includes("txt_miller_caravan_bought"));
  assert.equal(mine(before.state).rum_town_flour_caravan_bought, undefined);

  let s = structuredClone(start);
  s.signals.town_flour_wanted = 1;
  s.fired.evt_town_flour_demand.lastMinute = s.fired.evt_caravan.lastMinute + 4320 - 60;
  const cv = s.signals.caravan_visits ?? 0;
  while ((s.signals.caravan_visits ?? 0) === cv) s = run(s, [DAY]).state;
  const passed = day(s);
  assert.equal(s.signals.town_flour_wanted, 0, "the caravan met the want");
  const millers = s.knowledge.npc_miller.rum_town_flour_caravan_bought;
  assert.equal(millers.claim, "wanted", "the miller reads the purchase as a want");
  assert.equal(millers.aboutDay, passed);
  assert.equal(millers.confidence, 50, "a guess");
  assert.equal(s.knowledge.npc_ferryman.rum_town_flour_enough.aboutDay, passed, "the ferryman knows how the step ended");

  // the miller tells it at the mill (no walk) -- the player's own entry, from him, dated the purchase
  const told = run(s, MILLER("opt_miller_news"));
  assert.ok(texts(told.log[1]).includes("txt_miller_caravan_bought"));
  const heard = mine(told.state).rum_town_flour_caravan_bought;
  assert.equal(heard.source, "npc_miller");
  assert.equal(heard.aboutDay, passed);
  assert.equal(heard.claim, "wanted");
  // the ferryman tells the other word of the same day; both stay (different rumours, D-14 does not drop either)
  const both = run(told.state, [...TO_FORD, ...FERRY("opt_ferryman_news")]).state;
  assert.equal(mine(both).rum_town_flour_enough.aboutDay, passed);
  assert.equal(mine(both).rum_town_flour_enough.confidence, 70);
  assert.ok(mine(both).rum_town_flour_caravan_bought, "the miller's word is still there");
  assert.equal(both.signals.town_flour_wanted, 0, "and the truth is the ferryman's: the want was met");

  // a later purchase moves his word's day forward; a save keeps it
  const saved = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_miller", told.state, { savedAt: 1 }))));
  assert.deepEqual(saved.knowledge.npc_miller, told.state.knowledge.npc_miller);
  assert.deepEqual(validateState(told.state), []);
  const path = [DAY, DAY, DAY, ...MILLER("opt_miller_news")];
  assert.deepEqual(run(saved, path).state, run(told.state, path).state, "loaded, the same end");
}

testValidDays();
testTheMillersReading();
console.log("V2-Core-135 data-world-miller-reading.test.js: all checks passed");
