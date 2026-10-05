// V2-Core-111 (#272 RPG Depth 4, step 1 -- steel for the road): through the ordinary step() API and the real pack. No
// engine change; additive content only (D-92):
//   the castle town's merchant sells a steel sword (hand slot, +1 combat, 24 silver) and a mail shirt (body slot, +2
//   combat, 48 silver). Measured (#272), each +1 combat modifier lowers an honest guard's partial-or-fail rate by about
//   eight points, and a steady guard earns about seven silver a convoy: the prices are three to four convoys and about
//   seven. Same slots, so they REPLACE: the steel sword takes the iron sword's hand (and with it the iron sword's one
//   fight technique), the mail takes the jerkin's body. Prices, modifiers and the merchant's words are Provisional
//   gameplay values (R-29). No Canon.
//   1. the merchant: offered only with the money, one of each, the exact price;
//   2. worn or wielded, they count -- carried, they do not; they replace what the slot held and taking them off leaves
//      the slot empty; the modifier is the one on the roll (the same roll, +1 / +2 / +3);
//   3. a better gear never makes a roll worse (the same rng cursor, 120 of them), and the fail rate falls with it;
//   4. the clerk's remark about a missing jerkin is not said to a guard in mail;
//   5. what they cost in convoys (a steady guard), save compatibility, save/load and determinism.
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
const MERCHANT = (optionId) => [P("act_talk_town_merchant"), C(optionId)];
const CLERK = (optionId) => [P("act_talk_guild_clerk"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const BUY_STEEL = MERCHANT("opt_town_merchant_buy_steel_sword");
const BUY_MAIL = MERCHANT("opt_town_merchant_buy_mail_shirt");
const BUY_JERKIN = MERCHANT("opt_town_merchant_buy_jerkin");
const WIELD = P("act_equip_steel_sword");
const SHEATHE = P("act_unequip_steel_sword");
const WEAR_MAIL = P("act_equip_mail_shirt");
const TAKE_OFF_MAIL = P("act_unequip_mail_shirt");
const WEAR_JERKIN = P("act_equip_leather_jerkin");
const WIELD_IRON = P("act_equip_iron_sword");
const NO_LEATHER = "txt_guild_clerk_no_leather";
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
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const check = (result) => result.events.find((e) => e.type === "check.resolved")?.data;
const itemMod = (c, item) => c.modifiers.find((m) => m.source === `item:${item}`)?.value ?? 0;
const offered = (s, optionId) => evaluateCondition(worldData.choices.choice_town_merchant_dialogue.options.find((o) => o.id === optionId).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (s) => { let t = s; for (let h = 0; h < 96 && !wanted(t); h += 1) t = run(t, [HOUR]).state; assert.ok(wanted(t), "a convoy wants a guard"); return t; };
// the escort of a rested guard on a given rng cursor: the check's result
const escortAt = (s, k) => { const c = structuredClone(waitForConvoy(s)); growth(c).resources.stamina.current = 6; c.rng.cursor += k; return check(run(c, CLERK("opt_guild_clerk_escort")).log[1]); };
const RANK = { fail: 0, partial: 1, success: 2, great: 3 };

const town = (() => { const s = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state; me(s).money = 100; growth(s).stats.str = 14; return s; })();
const withGear = (...actions) => run(town, actions).state;

// 1. the merchant
function testMerchant() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.items.item_steel_sword.slot, "hand");
  assert.strictEqual(worldData.items.item_mail_shirt.slot, "body");
  for (const [optionId, price] of [["opt_town_merchant_buy_steel_sword", 24], ["opt_town_merchant_buy_mail_shirt", 48]]) {
    const poor = structuredClone(town);
    me(poor).money = price - 1;
    assert.strictEqual(offered(poor, optionId), false, `${price - 1} silver is not enough`);
    me(poor).money = price;
    assert.strictEqual(offered(poor, optionId), true, `${price} silver is`);
  }
  const steel = run(town, BUY_STEEL);
  assert.deepStrictEqual(steel.said, ["txt_town_merchant_sell_steel_sword"]);
  assert.strictEqual(me(steel.state).money, 76);
  assert.strictEqual(me(steel.state).inventory.item_steel_sword, 1);
  assert.strictEqual(offered(steel.state, "opt_town_merchant_buy_steel_sword"), false, "one is enough");
  const mail = run(town, BUY_MAIL);
  assert.deepStrictEqual(mail.said, ["txt_town_merchant_sell_mail_shirt"]);
  assert.strictEqual(me(mail.state).money, 52);
  assert.strictEqual(offered(mail.state, "opt_town_merchant_buy_mail_shirt"), false, "one is enough");
}

// 2. worn or wielded, they count; they replace what the slot held
function testWorn() {
  const held = withGear(...BUY_STEEL, ...BUY_MAIL);
  assert.strictEqual(rejected(town, WIELD), "requirements_not_met", "nothing to wield");
  assert.strictEqual(rejected(town, WEAR_MAIL), "requirements_not_met", "nothing to wear");
  const k = 7;
  const bare = escortAt(held, k);
  assert.strictEqual(itemMod(bare, "item_steel_sword") + itemMod(bare, "item_mail_shirt"), 0, "carried, not worn: no help");

  const wielded = run(held, [WIELD]);
  assert.deepStrictEqual(wielded.said, ["txt_equip_steel_sword"]);
  assert.strictEqual(me(wielded.state).loadout.hand, "item_steel_sword");
  assert.strictEqual(rejected(wielded.state, WIELD), "requirements_not_met", "already wielded");
  const s1 = escortAt(wielded.state, k);
  assert.strictEqual(itemMod(s1, "item_steel_sword"), 1);
  assert.strictEqual(s1.total - bare.total, 1, "one point on the same roll");

  const mailed = run(held, [WEAR_MAIL]);
  assert.deepStrictEqual(mailed.said, ["txt_equip_mail_shirt"]);
  assert.strictEqual(me(mailed.state).loadout.body, "item_mail_shirt");
  const m2 = escortAt(mailed.state, k);
  assert.strictEqual(itemMod(m2, "item_mail_shirt"), 2);
  assert.strictEqual(m2.total - bare.total, 2, "two points on the same roll");

  // both together: three
  const both = run(held, [WIELD, WEAR_MAIL]).state;
  const b3 = escortAt(both, k);
  assert.strictEqual(b3.total - bare.total, 3);

  // they replace what the slot held, and the old one is still owned
  const iron = run(withGear(...BUY_JERKIN, WEAR_JERKIN, P("act_talk_town_merchant"), C("opt_town_merchant_buy_sword")), []).state;
  assert.ok(me(iron).inventory.item_leather_jerkin, "the jerkin is owned");
  const outfitted = run(iron, [WIELD_IRON]).state;
  assert.strictEqual(me(outfitted).loadout.hand, "item_iron_sword");
  assert.strictEqual(me(outfitted).loadout.body, "item_leather_jerkin");
  const traded = run({ ...outfitted, actors: { ...outfitted.actors, [outfitted.player.actorId]: { ...me(outfitted), money: 100 } } }, [...BUY_STEEL, ...BUY_MAIL, WIELD, WEAR_MAIL]).state;
  assert.strictEqual(me(traded).loadout.hand, "item_steel_sword", "the steel replaced the iron sword");
  assert.strictEqual(me(traded).loadout.body, "item_mail_shirt", "the mail replaced the jerkin");
  assert.strictEqual(me(traded).inventory.item_iron_sword, 1, "the iron sword is still owned");
  assert.strictEqual(me(traded).inventory.item_leather_jerkin, 1, "and so is the jerkin");
  const t = escortAt(traded, k);
  assert.strictEqual(itemMod(t, "item_leather_jerkin"), 0, "the jerkin no longer counts once the mail is on");
  assert.strictEqual(t.total - bare.total, 3, "mail and steel, not mail and steel and jerkin");

  // taking them off leaves the slots empty
  const off = run(traded, [SHEATHE, TAKE_OFF_MAIL]);
  assert.deepStrictEqual(off.said, ["txt_unequip_steel_sword", "txt_unequip_mail_shirt"]);
  assert.strictEqual(me(off.state).loadout?.hand, undefined);
  assert.strictEqual(me(off.state).loadout?.body, undefined);
  assert.strictEqual(rejected(off.state, SHEATHE), "requirements_not_met");
  assert.strictEqual(rejected(off.state, TAKE_OFF_MAIL), "requirements_not_met");
  return both;
}

// 3. better gear never makes a roll worse, and the fail rate falls with it
function testRates(both) {
  const held = withGear(...BUY_STEEL, ...BUY_MAIL);
  const sets = [
    ["bare", held],
    ["jerkin", withGear(...BUY_JERKIN, WEAR_JERKIN)],
    ["steel + jerkin", withGear(...BUY_JERKIN, WEAR_JERKIN, ...BUY_STEEL, WIELD)],
    ["steel + mail", both]
  ];
  const rates = sets.map(([name, s]) => {
    let bad = 0;
    for (let k = 0; k < 120; k += 1) if (RANK[escortAt(s, k).tier] < RANK.success) bad += 1;
    return [name, bad];
  });
  for (let i = 1; i < rates.length; i += 1) assert.ok(rates[i][1] <= rates[i - 1][1], `${rates[i][0]} is no worse than ${rates[i - 1][0]}: ${JSON.stringify(rates)}`);
  assert.ok(rates[3][1] <= rates[0][1] - 20, `steel and mail cut the partial-or-fail count by at least 20 of 120: ${JSON.stringify(rates)}`);
  // the same roll, a better tier or equal -- never lower
  for (let k = 0; k < 120; k += 1) {
    assert.ok(RANK[escortAt(both, k).tier] >= RANK[escortAt(held, k).tier], `the same roll (${k}) is never worse in steel and mail`);
  }
  return rates;
}

// 4. the clerk's remark about a missing jerkin is not for a guard in mail
function testClerk() {
  const held = withGear(...BUY_MAIL, ...BUY_JERKIN);
  const ready = waitForConvoy(held);
  assert.ok(run(ready, CLERK("opt_guild_clerk_ask")).said.includes(NO_LEATHER), "nothing worn: the clerk mentions the leather");
  assert.ok(!run(run(ready, [WEAR_JERKIN]).state, CLERK("opt_guild_clerk_ask")).said.includes(NO_LEATHER), "a jerkin: nothing said");
  assert.ok(!run(run(ready, [WEAR_MAIL]).state, CLERK("opt_guild_clerk_ask")).said.includes(NO_LEATHER), "mail: nothing said");
}

// 5. what they cost in convoys (a steady guard), save compatibility, save/load, determinism
function testPriceAndSave() {
  // a steady, rested guard (staged strong -- the escort's outcome is not the point) earns a convoy's pay each job
  const strong = (s) => { const c = structuredClone(s); growth(c).stats.str = 30; growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; return c; };
  let s = structuredClone(town);
  me(s).money = 0;
  const jobsTo = (price) => { let t = s; let n = 0; while (me(t).money < price && n < 20) { t = run(run(strong(waitForConvoy(t)), CLERK("opt_guild_clerk_escort")).state, [M("loc_castle_town")]).state; n += 1; } s = t; return n; };
  const toSteel = jobsTo(24);
  const toMail = jobsTo(48) + toSteel;
  assert.ok(toSteel >= 3 && toSteel <= 4, `the steel sword is three or four convoys of silver (${toSteel})`);
  assert.ok(toMail >= 6 && toMail <= 8, `the mail is about seven (${toMail})`);

  const without = structuredClone(worldData);
  for (const id of ["item_steel_sword", "item_mail_shirt"]) delete without.items[id];
  for (const id of ["act_equip_steel_sword", "act_unequip_steel_sword", "act_equip_mail_shirt", "act_unequip_mail_shirt"]) delete without.actions[id];
  without.choices.choice_town_merchant_dialogue.options = without.choices.choice_town_merchant_dialogue.options.filter((o) => !/steel|mail/.test(o.id));
  for (const id of Object.keys(without.texts)) if (/steel_sword|mail_shirt/.test(id)) delete without.texts[id];
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "steel-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "steel-1", data: without, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }

  const path = [...BUY_STEEL, ...BUY_MAIL, WIELD, WEAR_MAIL, ...CLERK("opt_guild_clerk_ask")];
  const start = waitForConvoy(structuredClone(town));
  const end = run(start, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_steel", start, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, start);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(start, path).state, end, "the same input, the same world");
}

testMerchant();
const both = testWorn();
testRates(both);
testClerk();
testPriceAndSave();
console.log("V2-Core-111 data-world-steel-road.test.js: all checks passed");
