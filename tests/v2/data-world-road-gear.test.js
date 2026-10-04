// V2-Core-94 (#226, RPG Depth 1, step 3 -- gear for the road): through the ordinary step() API and the real pack. No
// engine change; additive content only (D-92/D-99):
//   the castle town's merchant sells a leather jerkin (3 silver; one is enough). It is equipment (the world's "body"
//   slot) with a +1 combat modifier that counts only while worn (D-87): wearing it steadies the escort -- and every
//   combat check -- and offsets half of a road wound. Wearing and taking it off are actions of their own. Price and
//   modifier are gameplay values; the merchant's words are Provisional.
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
const MERCHANT = (optionId) => [P("act_talk_town_merchant"), C(optionId)];
const WEAR = P("act_equip_leather_jerkin");
const TAKE_OFF = P("act_unequip_leather_jerkin");
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
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const check = (result) => result.events.find((e) => e.type === "check.resolved")?.data;
const jerkinMod = (result) => check(result).modifiers.find((m) => m.source === "item:item_leather_jerkin")?.value ?? 0;
const offered = (s, optionId) => evaluateCondition(worldData.choices.choice_town_merchant_dialogue.options.find((o) => o.id === optionId).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const escort = (s) => { const c = structuredClone(s); growth(c).resources.stamina.current = 6; const r = run(c, CLERK("opt_guild_clerk_escort")); return { state: r.state, result: r.log[1] }; };

const town = (() => { const s = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state; me(s).money = 10; growth(s).stats.str = 14; return s; })();

// 1. the jerkin: sold in the town, one is enough
function testBuy() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.items.item_leather_jerkin.slot, "body");
  const bought = run(town, MERCHANT("opt_town_merchant_buy_jerkin"));
  assert.deepStrictEqual(texts(bought.log[1]), ["txt_town_merchant_sell_jerkin"]);
  assert.strictEqual(me(bought.state).money, 7);
  assert.strictEqual(me(bought.state).inventory.item_leather_jerkin, 1);
  assert.strictEqual(offered(bought.state, "opt_town_merchant_buy_jerkin"), false, "one is enough");
  const poor = structuredClone(town);
  me(poor).money = 2;
  assert.strictEqual(offered(poor, "opt_town_merchant_buy_jerkin"), false, "3 silver");
  return bought.state;
}

// 2. it counts only while worn
function testWorn(held) {
  assert.strictEqual(rejected(town, WEAR), "requirements_not_met", "nothing to wear");
  assert.strictEqual(jerkinMod(escort(held).result), 0, "carried, not worn: no help");
  const worn = run(held, [WEAR]);
  assert.deepStrictEqual(texts(worn.log[0]), ["txt_equip_leather_jerkin"]);
  assert.strictEqual(me(worn.state).loadout.body, "item_leather_jerkin");
  assert.strictEqual(rejected(worn.state, WEAR), "requirements_not_met", "already worn");
  const e = escort(worn.state);
  assert.strictEqual(jerkinMod(e.result), 1);
  assert.strictEqual(check(e.result).total - check(escort(held).result).total, 1, "one point on the same roll");
  // the sword's slot is its own: both can be worn and wielded
  assert.strictEqual(me(worn.state).loadout.hand, undefined);
  const off = run(worn.state, [TAKE_OFF]);
  assert.deepStrictEqual(texts(off.log[0]), ["txt_unequip_leather_jerkin"]);
  assert.strictEqual(me(off.state).loadout?.body, undefined);
  assert.strictEqual(me(off.state).inventory.item_leather_jerkin, 1, "taken off, still owned");
  assert.strictEqual(rejected(off.state, TAKE_OFF), "requirements_not_met");
  return worn.state;
}

// 3. with a road wound: the jerkin offsets half of it
function testWithWound(worn) {
  const hurt = structuredClone(worn);
  growth(hurt).traits = { ...(growth(hurt).traits ?? {}), road_wound: true };
  const mods = check(escort(hurt).result).modifiers;
  const sum = mods.filter((m) => m.source === "item:item_leather_jerkin" || m.source === "trait:road_wound").reduce((a, m) => a + m.value, 0);
  assert.strictEqual(sum, -1, "-2 + 1");
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  const path = [...MERCHANT("opt_town_merchant_buy_jerkin"), WEAR, ...CLERK("opt_guild_clerk_escort")];
  const start = structuredClone(town);
  growth(start).resources.stamina.current = 6;
  const end = run(start, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_gear", start, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, start);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(start, path).state, end, "the same input, the same world");
}

const held = testBuy();
const worn = testWorn(held);
testWithWound(worn);
testSaveAndDeterminism();
console.log("V2-Core-94 data-world-road-gear.test.js: all checks passed");
