// V2-Core-132 (#328, MG-045/046, D-113): the ford and the town, through the ordinary step() API and the real pack.
//   1. the merchant knows his want today; a caravan carries that word south to the ferryman (his own knowledge, dated the
//      day it passed, D-112) and takes a sack of the mill's flour north while the town wants it -- the want moves
//      without the player
//   2. the ferryman passes the word on: the player learns what the town wanted *then*, heard today
//   3. the word can be old: the world moves on, what the ferryman knows does not until the next caravan
//   4. the carrier's note (X3-A): a supplier the merchant knows is given a note for the next carriage; the flour crosses on
//      his account and the carriage's sack is bought even when the want is met; then the next note. Since V2-Core-148
//      (D-126, M8 step 3 K1) that sack goes at the note's price (4) while the town wants too; the market's price is for the
//      carrier's second sack, once the note's is sold
//   5. a note shown with nothing to carry: the ferryman sees it, doubts every note until the next caravan brings the
//      merchant's answer (less regard for the carrier), and refuses that carrier's notes for good
//   6. a real save from before (fixtures/save-before-ford-and-town.json, written by the pack at 000b535): it loads, and
//      the next caravan starts the word
//   7. save/load and determinism
// node:assert/strict only (§13.1).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
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

// 1-2. the word's way south, and what the caravan takes
function testTheWordAndTheCaravan() {
  assert.deepStrictEqual(validateData(worldData), []);
  const bought = run(start, [...MILLER("opt_miller_buy_flour"), ...MILLER("opt_miller_buy_flour"), ...TO_FORD]).state;
  assert.equal(bought.signals.town_flour_wanted, 2);
  // no caravan since the trade opened: the ferryman has nothing to tell of the town's want
  const early = run(bought, FERRY("opt_ferryman_news"));
  assert.equal(mine(early.state).rum_town_flour_wanted, undefined);
  assert.ok(!texts(early.log[1]).includes("txt_ferryman_town_wants"));
  // the next caravan: the town's word reaches the ferryman (his own knowledge, not the player's), and it takes a sack north
  let s = bought;
  while ((s.signals.caravan_visits ?? 0) < 2) s = run(s, [DAY]).state;
  const passed = day(s);
  assert.equal(s.knowledge.npc_ferryman.rum_town_flour_wanted.aboutDay, passed, "dated the day the caravan passed");
  assert.equal(s.knowledge.npc_ferryman.rum_town_flour_wanted.source, "npc_town_merchant");
  assert.equal(mine(s).rum_town_flour_wanted, undefined, "the player has not heard it");
  assert.equal(s.signals.town_flour_wanted, 1, "the caravan met one of the town's two");
  assert.equal(s.signals.mill_flour_stock, 1, "out of the mill's two");
  assert.equal(s.facts.fact_caravan_flour.value, "north");
  assert.equal(s.facts.fact_town_flour.value, "wanted");
  // a day later the player asks: what the town wanted then, heard now
  s = run(s, [DAY]).state;
  const told = run(s, FERRY("opt_ferryman_news"));
  const word = mine(told.state).rum_town_flour_wanted;
  assert.equal(word.aboutDay, passed);
  assert.equal(word.lastSeenDay, passed + 1);
  assert.deepEqual(word.sources, ["npc_ferryman"]);
  assert.equal(word.confidence, 70);
  assert.equal(mine(told.state).rum_caravan_took_flour.aboutDay, passed);
  assert.ok(texts(told.log[1]).includes("txt_ferryman_town_wants") && texts(told.log[1]).includes("txt_ferryman_caravan_took"));
  return told.state;
}

// 3. in the town the merchant's word is today's; the ferryman's stays what it was until the next caravan
function testTheWordGetsOld(atFordToldState) {
  const town = run(atFordToldState, [...FERRY("opt_ferryman_cross"), M("loc_castle_town")]).state;
  assert.equal(me(town).money, me(atFordToldState).money - 3, "the fare");
  const asked = run(town, MERCHANT("opt_town_merchant_ask")).state;
  assert.equal(mine(asked).rum_town_flour_wanted.aboutDay, day(asked), "the merchant's word moves the day on");
  assert.ok(mine(asked).rum_town_flour_wanted.sources.includes("npc_town_merchant"));
  // the town's want met to the last sack (staged: the want at one, the fair over) -- the world says enough, the ferryman
  // still knows "wanted", dated the day his caravan passed
  const plain = structuredClone(asked);
  plain.signals.caravan_visits = 3;
  const sold = run(plain, MERCHANT("opt_town_merchant_sell_flour")).state;
  assert.equal(rel(sold, "npc_town_merchant"), 5, "a supplier the merchant knows a little");
  assert.ok(!atMerchant(sold, "opt_town_merchant_order"), "not yet one he asks for flour (10)");
  // the sack met the town's last want; a caravan's cadence since the want last came has passed, so it comes back at once
  // (two) -- the world's want moved twice today, after the day the ferryman's word is about
  assert.equal(sold.signals.town_flour_wanted, 2);
  assert.equal(sold.facts.fact_town_flour.value, "wanted");
  const ferryWord = sold.knowledge.npc_ferryman.rum_town_flour_wanted;
  assert.ok(sold.facts.fact_town_flour.since > ferryWord.aboutDay * 1440 + 1439, "the world moved on after the ferryman's word");
  assert.equal(ferryWord.aboutDay, mine(atFordToldState).rum_town_flour_wanted.aboutDay, "and what he knows did not");
  return sold;
}

// 4. the carrier's note
function testTheNote(sold) {
  let s = run(sold, MERCHANT("opt_town_merchant_sell_flour")).state;
  assert.equal(rel(s, "npc_town_merchant"), 10, "two sacks: a supplier he knows");
  // a standing order: given to a supplier he knows whatever the town wants today -- one note, one carriage
  assert.ok(atMerchant(s, "opt_town_merchant_order"));
  const noted = run(s, MERCHANT("opt_town_merchant_order"));
  assert.ok(texts(noted.log[1]).includes("txt_town_merchant_order"));
  s = noted.state;
  assert.equal(me(s).inventory.item_merchant_note, 1);
  assert.ok(!atMerchant(s, "opt_town_merchant_order"), "one note at a time");
  // south (the way back costs nothing), flour at the mill, north again on the merchant's account
  s = run(s, [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_mill_hamlet"), DAY, ...MILLER("opt_miller_buy_flour"), ...TO_FORD]).state;
  const money = me(s).money;
  assert.ok(atFord(s, "opt_ferryman_cross_note"));
  assert.ok(!atFord(s, "opt_ferryman_cross_note_empty"), "with flour, only the honest way");
  s = run(s, FERRY("opt_ferryman_cross_note")).state;
  assert.equal(me(s).money, money, "no fare");
  assert.equal(me(s).inventory.item_merchant_note ?? 0, 0, "the note stays with the ferryman's book");
  assert.equal(s.signals.merchant_ferry_account, 3, "written down to the merchant");
  assert.equal(rel(s, "npc_ferryman"), 2);
  assert.ok(s.relations[`npc_town_merchant:${s.player.actorId}`].tags.includes("carrying"));
  assert.ok(!atMerchant(s, "opt_town_merchant_order"), "no new note while a carriage is under way");
  s = run(s, [M("loc_castle_town")]).state;
  // the carriage's sack is bought at the note's price (4) whatever the town wants: even when it has enough ...
  const full = structuredClone(s);
  full.signals.town_flour_wanted = 0;
  assert.ok(atMerchant(full, "opt_town_merchant_sell_flour_note"));
  assert.ok(!atMerchant(full, "opt_town_merchant_sell_flour") && !atMerchant(full, "opt_town_merchant_sell_flour_fair"));
  // ... and while it wants (V2-Core-148, D-126, M8 step 3 K1): the market's price is the free trader's, not the carrier's
  const wanting = structuredClone(full);
  wanting.signals.town_flour_wanted = 2;
  wanting.actors.player_1.inventory.item_flour_sack = 2; // staged: the note's sack and one of the carrier's own
  assert.ok(atMerchant(wanting, "opt_town_merchant_sell_flour_note"), "while the town wants, the note's sack still sells at 4");
  assert.ok(!atMerchant(wanting, "opt_town_merchant_sell_flour") && !atMerchant(wanting, "opt_town_merchant_sell_flour_fair"), "not at the market's price while carrying");
  const paid = run(wanting, MERCHANT("opt_town_merchant_sell_flour_note"));
  assert.equal(me(paid.state).money, me(wanting).money + 4);
  assert.equal(paid.state.signals.town_flour_wanted, 1, "the town's want is met by one sack");
  assert.ok(texts(paid.log[1]).includes("txt_town_merchant_buy_flour_note_wanted") && !texts(paid.log[1]).includes("txt_town_merchant_buy_flour_note"));
  assert.ok(texts(paid.log[1]).includes("txt_town_merchant_note_back"));
  // the carriage done, the carrier's own sack takes the market's chance like any other
  assert.ok(atMerchant(paid.state, "opt_town_merchant_sell_flour"), "the second sack sells at the market's price");
  const kept = run(full, MERCHANT("opt_town_merchant_sell_flour_note"));
  assert.equal(me(kept.state).money, me(full).money + 4);
  assert.ok(texts(kept.log[1]).includes("txt_town_merchant_buy_flour_note") && !texts(kept.log[1]).includes("txt_town_merchant_buy_flour_note_wanted"));
  assert.ok(texts(kept.log[1]).includes("txt_town_merchant_note_back"));
  assert.equal(kept.state.relations[`npc_town_merchant:${kept.state.player.actorId}`].tags?.includes("carrying") ?? false, false, "the carriage done");
  assert.equal(rel(kept.state, "npc_town_merchant"), 15);
  assert.ok(atMerchant(kept.state, "opt_town_merchant_order"), "and the next note");
  // the next caravan settles the account
  let t = kept.state;
  const cv = t.signals.caravan_visits;
  while (t.signals.caravan_visits === cv) t = run(t, [DAY]).state;
  assert.equal(t.signals.merchant_ferry_account ?? 0, 0, "the caravan brings the merchant's payment");
  return kept.state;
}

// 5. the note shown with nothing to carry
function testTheMisusedNote(inTown) {
  let s = run(inTown, MERCHANT("opt_town_merchant_order")).state;
  delete s.actors.player_1.inventory.item_flour_sack; // staged: nothing to carry, the note in hand
  s = run(s, [M("loc_far_bank"), M("loc_river_ford")]).state;
  assert.equal(me(s).inventory.item_merchant_note, 1);
  assert.ok(atFord(s, "opt_ferryman_cross_note_empty") && !atFord(s, "opt_ferryman_cross_note"));
  const before = { ferry: rel(s, "npc_ferryman"), merchant: rel(s, "npc_town_merchant"), money: me(s).money };
  const misused = run(s, FERRY("opt_ferryman_cross_note_empty"));
  s = misused.state;
  assert.ok(texts(misused.log[1]).includes("txt_ferryman_note_misused"));
  assert.equal(me(s).money, before.money, "it works once");
  assert.equal(me(s).inventory.item_merchant_note ?? 0, 0);
  assert.equal(rel(s, "npc_ferryman"), before.ferry - 10);
  assert.equal(s.signals.ferry_note_doubt, 1);
  // back at the ford: every note is doubted until the merchant has answered, and he says so
  s = run(s, [M("loc_river_ford")]).state;
  const told = run(s, FERRY("opt_ferryman_news"));
  assert.ok(texts(told.log[1]).includes("txt_ferryman_doubts_notes"));
  // the next caravan: the merchant answers -- less regard; the account settled, the doubt lifted
  const cv = s.signals.caravan_visits;
  while (s.signals.caravan_visits === cv) s = run(s, [DAY]).state;
  assert.equal(rel(s, "npc_town_merchant"), before.merchant - 15);
  assert.equal(s.signals.ferry_note_doubt ?? 0, 0);
  assert.equal(s.relations[`npc_ferryman:${s.player.actorId}`].tags.includes("note_misused"), false);
  // but the ferryman does not forget this carrier: a note from the merchant and flour to carry, still refused
  const again = structuredClone(s);
  again.actors.player_1.inventory.item_merchant_note = 1;
  again.actors.player_1.inventory.item_flour_sack = 1;
  assert.ok(!atFord(again, "opt_ferryman_cross_note") && !atFord(again, "opt_ferryman_cross_note_empty"));
  assert.ok(atFord(again, "opt_ferryman_cross"), "the fare is still taken");
  assert.deepEqual(validateState(s), []);
}

// 6. a real save from before
function testOldSave() {
  const record = JSON.parse(readFileSync(new URL("./fixtures/save-before-ford-and-town.json", import.meta.url), "utf8"));
  const old = parseLoadedRecord(record);
  assert.deepEqual(validateState(old), []);
  assert.equal(old.signals.town_word_south, undefined);
  assert.equal(old.knowledge.npc_ferryman, undefined);
  for (const k of Object.values(old.knowledge.player_1)) assert.equal(Object.hasOwn(k, "aboutDay"), false, "an old word has no event day -- none is invented");
  // the ferryman has nothing of the town to tell until a caravan passes under the new pack
  const asked = run(old, FERRY("opt_ferryman_news"));
  assert.ok(!texts(asked.log[1]).includes("txt_ferryman_town_wants"));
  let s = asked.state;
  const cv = s.signals.caravan_visits;
  while (s.signals.caravan_visits === cv) s = run(s, [DAY]).state;
  assert.ok(s.knowledge.npc_ferryman.rum_town_flour_wanted || s.knowledge.npc_ferryman.rum_town_flour_enough);
  const later = run(s, FERRY("opt_ferryman_news")).state;
  const word = mine(later).rum_town_flour_wanted ?? mine(later).rum_town_flour_enough;
  assert.ok(Number.isInteger(word.aboutDay));
  assert.deepEqual(validateState(later), []);
}

// 7. save/load and determinism
function testSaveAndDeterminism() {
  const path = [...MILLER("opt_miller_buy_flour"), ...TO_FORD, DAY, DAY, DAY, ...FERRY("opt_ferryman_news"), ...FERRY("opt_ferryman_cross"), M("loc_castle_town"), ...MERCHANT("opt_town_merchant_ask")];
  const end = run(start, path).state;
  assert.deepEqual(validateState(end), []);
  const restored = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_ford_and_town", start, { savedAt: 1 }))));
  assert.deepEqual(run(restored, path).state, end, "loaded, the same end");
  const mid = run(start, path.slice(0, 7)).state;
  const midLoaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_ford_and_town", mid, { savedAt: 1 }))));
  assert.deepEqual(run(midLoaded, path.slice(7)).state, end, "saved with the ferryman's own knowledge, the same end");
}

// V2-Core-134 (#333): the ferryman's word is the want the step ends with -- after the caravan's own sack and after the want's
// return. A town wanting one sack, its want last come back just now (staged), a mill with flour: the caravan meets that want,
// nothing comes back yet, and what the ferryman passes on is "enough", dated that day
function testTheWordAfterTheSack() {
  let s = run(start, TO_FORD).state;
  s.signals.town_flour_wanted = 1; // staged: the town wants one sack
  // staged: and its want came back an hour before the next caravan (so nothing comes back in the caravan's step)
  s.fired.evt_town_flour_demand.lastMinute = s.fired.evt_caravan.lastMinute + 4320 - 60;
  const cv = s.signals.caravan_visits ?? 0;
  while ((s.signals.caravan_visits ?? 0) === cv) s = run(s, [DAY]).state;
  assert.equal(s.signals.town_flour_wanted, 0, "the caravan met it");
  assert.equal(s.signals.town_word_south, 2, "and the ferryman knows the town has enough");
  assert.equal(s.knowledge.npc_ferryman.rum_town_flour_enough.aboutDay, day(s));
  assert.equal(s.knowledge.npc_ferryman.rum_town_flour_wanted, undefined, "not the want the caravan set out to meet");
  const told = run(s, FERRY("opt_ferryman_news"));
  assert.ok(texts(told.log[1]).includes("txt_ferryman_town_enough") && texts(told.log[1]).includes("txt_ferryman_caravan_took"));
  // and when the want comes back in the same step, the word is the want that came back
  let t = run(start, TO_FORD).state;
  t.signals.town_flour_wanted = 1;
  const cv2 = t.signals.caravan_visits ?? 0;
  while ((t.signals.caravan_visits ?? 0) === cv2) t = run(t, [DAY]).state;
  assert.equal(t.signals.town_word_south, t.signals.town_flour_wanted >= 1 ? 1 : 2, "the word is the want the step ends with");
}

testTheWordAfterTheSack();
const toldAtFord = testTheWordAndTheCaravan();
const sold = testTheWordGetsOld(toldAtFord);
const inTown = testTheNote(sold);
testTheMisusedNote(inTown);
testOldSave();
testSaveAndDeterminism();
console.log("V2-Core-132 data-world-ford-and-town.test.js: all checks passed");
