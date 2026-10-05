// V2-Core-114 (#279 succession legacy, step 1 -- the fallen's kit): through the ordinary step() API and the real pack. No
// engine change; additive content only (D-92). The Canon (K-14, WB-0005) says a successor inherits nothing; it also says
// a thing the previous life left in the world, found by the next, is an event in the world. So the legacy is what the
// world KEEPS, found and paid for, never handed over:
//   1. when a guard the guild knew falls, the steel sword and the mail shirt they owned stay with the guild -- a world
//      count per kind (`kit_steel`, `kit_mail`), counted in the very step that killed them, for what they OWNED (worn or
//      not), once each fall; a guard the guild did not know leaves none, nor does a guard who owned neither;
//   2. the clerk lets the next guard have each kind at half the merchant's price (12 and 24 silver) while one is held and
//      the buyer does not already own that kind; the count goes down by the one taken;
//   3. nothing is handed over: the successor starts exactly as before (no gear, no standing, the template's purse and
//      the Canon's 3 silver);
//   4. the clerk mentions the kit exactly while one is held;
//   5. save compatibility (the start is the same without it), save/load and determinism.
// Staged where it must be (the guild's standing set where escorts would have put it; the fall -- a known guard does not
// die by chance). The kit, the half price and the clerk's words are Provisional (R-29). No Canon.
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
const HOUR = { type: "wait", minutes: 60 };
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const BUY = (id) => [P("act_talk_town_merchant"), C(id)];
const TAKE_STEEL = [P("act_talk_guild_clerk"), C("opt_guild_clerk_fallen_steel")];
const TAKE_MAIL = [P("act_talk_guild_clerk"), C("opt_guild_clerk_fallen_mail")];
const OFFER = "txt_guild_clerk_kit_offer";
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const SUCCESSOR_WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];

function play(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)} at ${state.actors[state.player.actorId].locationId}`);
    log.push(result);
    state = result.state;
  }
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const sig = (s, k) => s.signals?.[k] ?? 0;
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const owns = (s, item) => (me(s).inventory?.[item] ?? 0) > 0;
const clerkOpen = (s, id) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (s) => { let t = s; for (let h = 0; h < 96 && !clerkOpen(t, "opt_guild_clerk_escort"); h += 1) t = play(t, [HOUR]).state; assert.ok(clerkOpen(t, "opt_guild_clerk_escort"), "a convoy wants a guard"); return t; };
const withMoney = (s, money) => { const c = structuredClone(s); me(c).money = money; return c; };

const town = (() => { const s = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state; me(s).money = 200; growth(s).stats.str = 14; return s; })();
// a guard with what they own: "both", "steel", "mail", "none"; known (standing 10) or not (5)
function guardWith(kit, known = true) {
  const buys = { both: [...BUY("opt_town_merchant_buy_steel_sword"), ...BUY("opt_town_merchant_buy_mail_shirt")], steel: BUY("opt_town_merchant_buy_steel_sword"), mail: BUY("opt_town_merchant_buy_mail_shirt"), none: [] }[kit];
  const s = play(town, buys).state;
  s.relations = { ...s.relations, [`npc_guild_clerk:${s.player.actorId}`]: { score: known ? 10 : 5 } };
  return s;
}
// the fall, staged: the last point of hp, no strength, and a bad roll (the first rng cursor at which the escort's check
// fails -- found deterministically on the staged state)
function falls(s) {
  const c = waitForConvoy(structuredClone(s));
  me(c).hp.current = 1;
  growth(c).stats.str = 0;
  growth(c).skills = { ...growth(c).skills, swordsmanship: 0 };
  growth(c).resources.stamina.current = 6;
  for (let k = 0; k < 60; k += 1) {
    const t = structuredClone(c);
    t.rng.cursor += k;
    const r = play(t, ESCORT);
    if (r.state.pending?.kind === "newCharacter") return r;
  }
  throw new Error("no bad roll within 60 rolls");
}
const afterFall = (kit, known) => falls(guardWith(kit, known));

// 1. what the guild keeps
function testKept() {
  assert.deepStrictEqual(validateData(worldData), []);
  const both = afterFall("both", true);
  assert.deepStrictEqual(both.state.pending, { kind: "newCharacter" });
  assert.strictEqual(sig(both.state, "kit_steel"), 1, "the steel stays with the guild, in the very step");
  assert.strictEqual(sig(both.state, "kit_mail"), 1, "and the mail");
  assert.ok(both.log.at(-1).events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_known_guard_fell"));
  const steel = afterFall("steel", true).state;
  assert.deepStrictEqual([sig(steel, "kit_steel"), sig(steel, "kit_mail")], [1, 0], "only what they owned");
  const mail = afterFall("mail", true).state;
  assert.deepStrictEqual([sig(mail, "kit_steel"), sig(mail, "kit_mail")], [0, 1]);
  const none = afterFall("none", true).state;
  assert.deepStrictEqual([sig(none, "kit_steel"), sig(none, "kit_mail")], [0, 0], "owned neither: nothing kept");
  assert.strictEqual(sig(none, "guards_fallen"), 1, "the fall is counted all the same");
  // a guard the guild did not know leaves nothing (as with the count of the fallen)
  const unknown = afterFall("both", false).state;
  assert.deepStrictEqual([sig(unknown, "kit_steel"), sig(unknown, "kit_mail"), sig(unknown, "guards_fallen")], [0, 0, 0], "the guild did not know them: nothing kept");
  // owned, not worn, still kept (the guild keeps what they carried)
  assert.strictEqual(me(guardWith("both", true)).loadout?.hand, undefined, "bought, not wielded");
  // the jerkin and the iron sword are not the guild's to keep
  const lesser = play(town, [...BUY("opt_town_merchant_buy_jerkin"), ...BUY("opt_town_merchant_buy_sword")]).state;
  lesser.relations = { ...lesser.relations, [`npc_guild_clerk:${lesser.player.actorId}`]: { score: 10 } };
  const lessFall = falls(lesser).state;
  assert.deepStrictEqual([sig(lessFall, "kit_steel"), sig(lessFall, "kit_mail")], [0, 0]);
  return both.state;
}

// 2. found and paid for
function testSold(fell) {
  const lived = play(fell, [NEW_LIFE]).state;
  // 3. nothing is handed over
  const startMoney = me(createInitialState({ worldSeed: "kit-1", data: worldData }).state).money;
  assert.strictEqual(me(lived).money, startMoney + 3, "the template's purse and the 3 silver of the Canon, and nothing else");
  assert.ok(!owns(lived, "item_steel_sword") && !owns(lived, "item_mail_shirt"), "no gear");
  assert.strictEqual(me(lived).loadout?.hand, undefined);
  assert.strictEqual(me(lived).loadout?.body, undefined);
  assert.strictEqual(standing(lived), undefined, "no standing");
  assert.strictEqual(sig(lived, "kit_steel"), 1, "the world's count stays");

  const inTown = play(lived, SUCCESSOR_WALK).state;
  for (const [optionId, price] of [["opt_guild_clerk_fallen_steel", 12], ["opt_guild_clerk_fallen_mail", 24]]) {
    assert.strictEqual(clerkOpen(withMoney(inTown, price - 1), optionId), false, `${price - 1} silver is not enough`);
    assert.strictEqual(clerkOpen(withMoney(inTown, price), optionId), true, `${price} is`);
  }
  // the steel: half the merchant's 24
  const rich = withMoney(inTown, 40);
  const took = play(rich, TAKE_STEEL);
  assert.deepStrictEqual(took.said, ["txt_guild_clerk_kit_steel"]);
  assert.strictEqual(me(took.state).money, 28, "twelve silver");
  assert.ok(owns(took.state, "item_steel_sword"));
  assert.strictEqual(sig(took.state, "kit_steel"), 0, "the kit is gone from the guild");
  assert.strictEqual(clerkOpen(took.state, "opt_guild_clerk_fallen_steel"), false, "one of the kind is enough, and the kit is taken");
  // and the mail: half of 48, independent of the steel
  const both = play(withMoney(took.state, 30), TAKE_MAIL);
  assert.deepStrictEqual(both.said, ["txt_guild_clerk_kit_mail"]);
  assert.strictEqual(me(both.state).money, 6, "twenty-four silver");
  assert.ok(owns(both.state, "item_mail_shirt"));
  assert.strictEqual(sig(both.state, "kit_mail"), 0);
  // a guard who already owns the kind is not offered it, though the kit is held
  const owner = play(withMoney(inTown, 100), BUY("opt_town_merchant_buy_steel_sword")).state;
  assert.strictEqual(sig(owner, "kit_steel"), 1);
  assert.strictEqual(clerkOpen(owner, "opt_guild_clerk_fallen_steel"), false, "already owns steel: not offered the kit");
  const armoured = play(withMoney(inTown, 100), BUY("opt_town_merchant_buy_mail_shirt")).state;
  assert.strictEqual(sig(armoured, "kit_mail"), 1);
  assert.strictEqual(clerkOpen(armoured, "opt_guild_clerk_fallen_mail"), false, "already owns mail: not offered the kit");
  // no fall, no kit: nothing to take in a world where no guard fell
  assert.strictEqual(clerkOpen(withMoney(town, 100), "opt_guild_clerk_fallen_steel"), false);
  assert.strictEqual(clerkOpen(withMoney(town, 100), "opt_guild_clerk_fallen_mail"), false);
  return { inTown, both: both.state };
}

// 3'. two falls, two kits
function testTwoFalls(fell) {
  const lived = play(fell, [NEW_LIFE, ...SUCCESSOR_WALK]).state;
  const second = withMoney(lived, 200);
  const geared = play(second, [...BUY("opt_town_merchant_buy_steel_sword")]).state;
  geared.relations = { ...geared.relations, [`npc_guild_clerk:${geared.player.actorId}`]: { score: 10 } };
  const again = falls(geared).state;
  assert.strictEqual(sig(again, "kit_steel"), 2, "the second fall adds its own: two blades held");
  assert.strictEqual(sig(again, "kit_mail"), 1, "the one mail is still held");
}

// 4. the clerk's word, exactly while a kit is held
function testWord({ inTown, both }) {
  const ready = waitForConvoy(withMoney(inTown, 100));
  assert.ok(play(ready, ASK).said.includes(OFFER), "the clerk mentions the kit while one is held");
  assert.ok(!play(waitForConvoy(withMoney(town, 100)), ASK).said.includes(OFFER), "and does not where none is");
  const none = structuredClone(ready);
  none.signals = { ...none.signals, kit_steel: 0, kit_mail: 0 };
  assert.ok(!play(none, ASK).said.includes(OFFER), "nor when both are taken");
  const mailOnly = structuredClone(ready);
  mailOnly.signals = { ...mailOnly.signals, kit_steel: 0 };
  assert.ok(play(mailOnly, ASK).said.includes(OFFER), "one kind is enough to mention");
  assert.ok(both);
}

// 5. save compatibility, save/load, determinism
function testSave(fell) {
  const without = structuredClone(worldData);
  without.events.evt_known_guard_fell.effects = without.events.evt_known_guard_fell.effects.slice(0, 1);
  without.choices.choice_guild_clerk_dialogue.options = without.choices.choice_guild_clerk_dialogue.options.filter((o) => !/fallen_(steel|mail)/.test(o.id));
  for (const id of Object.keys(without.texts)) if (/txt_guild_clerk_kit_/.test(id)) delete without.texts[id];
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "kit-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "kit-1", data: without, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }
  assert.deepStrictEqual(validateState(fell), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_kit", fell, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, fell);
  const rest = [NEW_LIFE, ...SUCCESSOR_WALK, ...ASK];
  const end = play(withMoney(fell, 0), rest).state;
  assert.deepStrictEqual(play(withMoney(loaded, 0), rest).state, end, "loaded between the lives, the same end");
  assert.deepStrictEqual(play(withMoney(fell, 0), rest).state, end, "the same input, the same world");
}

const fell = testKept();
const found = testSold(fell);
testTwoFalls(fell);
testWord(found);
testSave(fell);
console.log("V2-Core-114 data-world-fallen-kit.test.js: all checks passed");
