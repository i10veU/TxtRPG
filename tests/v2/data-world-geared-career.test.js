// V2-Core-113 (#272, RPG Depth 4, step 3 -- integrated: a geared career): one world, two lives, through the ordinary step()
// API and the real pack. No new rule and no data change. Silver turns into steel (V2-Core-111), the geared lead is
// offered the hard convoy (V2-Core-112), the guild's memory and the character's belongings stay in their layers (D-71):
//   1. the career: from the town with an empty purse, convoy by convoy (staged strong and rested so the escort's outcome
//      is not the point), the silver earned buys the steel sword and then the mail shirt at their prices; the hard convoy
//      is first offered at the moment the lead's unlock and the steel are BOTH held -- not before, whatever the silver;
//   2. the hard convoy is taken and pays its tier; a known guard in steel and mail falls on it (staged: the last hp, no
//      strength, a bad roll) -- the guild knew them, so the world counts it;
//   3. the successor starts with nothing of theirs: no steel, no mail, no unlock, no standing -- and nothing in the
//      loadout; the hard convoy is closed to them, the careful way (the world's memory) is open; the prices are the
//      same, and the silver earned again buys the same steel;
//   4. save/load between the lives, and determinism.
// Staged where it must be (strong and rested in 1; the fall in 2). Everything else is the ordinary game. What a guard
// owns is the character's; the count of the fallen and the market's prices are the world's. No Canon.
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
const LEAD = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_lead")];
const DANGER = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_danger")];
const BUY_STEEL = [P("act_talk_town_merchant"), C("opt_town_merchant_buy_steel_sword")];
const BUY_MAIL = [P("act_talk_town_merchant"), C("opt_town_merchant_buy_mail_shirt")];
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
// the successor's walk, from the village to the town (data-world-guard-fallen)
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
const check = (result) => result.events.find((e) => e.type === "check.resolved")?.data;
const clerkOpen = (s, id) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const merchantOpen = (s, id) => evaluateCondition(worldData.choices.choice_town_merchant_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const strong = (s) => { const c = structuredClone(s); growth(c).stats.str = 30; growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; return c; };
const waitForConvoy = (s) => { let t = s; for (let h = 0; h < 96 && !clerkOpen(t, "opt_guild_clerk_escort"); h += 1) t = play(t, [HOUR]).state; assert.ok(clerkOpen(t, "opt_guild_clerk_escort"), "a convoy wants a guard"); return t; };
const owns = (s, item) => (me(s).inventory?.[item] ?? 0) > 0;
const dangerOpen = (s) => clerkOpen(s, "opt_guild_clerk_escort_danger");

// the fall, staged: the last point of hp, no strength, and a bad roll (the first rng cursor at which the hard convoy's
// check fails -- found deterministically on the staged state)
function doomed(s) {
  const c = structuredClone(s);
  me(c).hp.current = 1;
  growth(c).stats.str = 0;
  growth(c).skills = { ...growth(c).skills, swordsmanship: 0 };
  growth(c).resources.stamina.current = 6;
  for (let k = 0; k < 60; k += 1) {
    const t = structuredClone(c);
    t.rng.cursor += k;
    const r = play(t, DANGER);
    if (r.state.pending?.kind === "newCharacter") return r;
  }
  throw new Error("no bad roll within 60 rolls");
}

// 1. the career
function testCareer() {
  let s = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
  assert.strictEqual(me(s).money, 0, "an empty purse");
  const record = { steel: null, mail: null, unlock: null, danger: null };
  let first;
  for (let job = 1; job <= 30 && !record.danger; job += 1) {
    s = waitForConvoy(strong(s));
    // purchases, when the silver is there and not before
    if (!owns(s, "item_steel_sword")) {
      assert.strictEqual(merchantOpen(s, "opt_town_merchant_buy_steel_sword"), me(s).money >= 24, `steel is offered exactly at 24 (${me(s).money} silver, job ${job})`);
      if (me(s).money >= 24) { s = play(s, [...BUY_STEEL, P("act_equip_steel_sword")]).state; record.steel = job; }
    } else if (!owns(s, "item_mail_shirt")) {
      assert.strictEqual(merchantOpen(s, "opt_town_merchant_buy_mail_shirt"), me(s).money >= 48, `mail is offered exactly at 48 (${me(s).money} silver, job ${job})`);
      if (me(s).money >= 48) { s = play(s, [...BUY_MAIL, P("act_equip_mail_shirt")]).state; record.mail = job; }
    }
    if (growth(s).unlocks?.unl_road_lead && record.unlock === null) record.unlock = job;
    // the hard convoy: open exactly when the lead's unlock and steel or mail are both held (with stamina and a convoy)
    const geared = growth(s).unlocks?.unl_road_lead === true && (me(s).loadout?.hand === "item_steel_sword" || me(s).loadout?.body === "item_mail_shirt");
    assert.strictEqual(dangerOpen(s), geared, `the hard convoy is open exactly when unlock and steel are held (job ${job}: unlock ${growth(s).unlocks?.unl_road_lead === true}, hand ${me(s).loadout?.hand})`);
    if (geared) { record.danger = job; first = s; break; }
    const lead = growth(s).unlocks?.unl_road_lead === true;
    s = play(play(s, lead ? LEAD : ESCORT).state, [M("loc_castle_town")]).state;
  }
  // the career is deterministic: the steel on the fifth convoy, the unlock on the eleventh -- and the hard convoy is
  // offered at the eleventh, the moment both are held, six convoys after the steel
  assert.deepStrictEqual(record, { steel: 5, mail: null, unlock: 11, danger: 11 });
  // and not with the sword put away, whatever else is held
  assert.strictEqual(dangerOpen(play(first, [P("act_unequip_steel_sword")]).state), false, "no steel in the hand, no hard convoy");
  assert.ok(owns(first, "item_steel_sword"));
  return first;
}

// 2. the hard convoy, and a fall on it
function testHard(first) {
  // bought the mail too (silver staged only to the price -- the purchases above ran on earned silver)
  const rich = structuredClone(first);
  me(rich).money = 48;
  const armoured = play(rich, [...BUY_MAIL, P("act_equip_mail_shirt")]).state;
  assert.deepStrictEqual(me(armoured).loadout, { hand: "item_steel_sword", body: "item_mail_shirt" });
  const taken = play(strong(armoured), DANGER);
  const mods = check(taken.log[1]).modifiers;
  assert.strictEqual(mods.find((m) => m.source === "item:item_steel_sword")?.value, 1, "the steel is in the check");
  assert.strictEqual(mods.find((m) => m.source === "item:item_mail_shirt")?.value, 2, "and the mail");
  // a known guard is paid a coin more on a success (the guild remembers, D-99): 15 / 11 / 2 for them
  assert.ok([15, 11, 2].includes(me(taken.state).money - me(armoured).money), `the hard convoy pays its tier, and a coin more to a known guard (${me(taken.state).money - me(armoured).money})`);
  assert.strictEqual(check(taken.log[1]).difficulty, 14);
  assert.ok(standing(first) >= 10, "the guild knows the guard");

  const fell = doomed(armoured);
  assert.deepStrictEqual(fell.state.pending, { kind: "newCharacter" }, "the road ended them");
  assert.strictEqual(sig(fell.state, "guards_fallen"), 1, "the guild knew them: counted in the very step that killed them");
  return { fell: fell.state, armoured };
}

// 3. the successor
function testSuccessor({ fell }) {
  const lived = play(fell, [NEW_LIFE]).state;
  assert.strictEqual(sig(lived, "guards_fallen"), 1, "the world's count stays");
  assert.strictEqual(me(lived).loadout?.hand, undefined, "no sword in the hand");
  assert.strictEqual(me(lived).loadout?.body, undefined, "no mail on the body");
  assert.ok(!owns(lived, "item_steel_sword") && !owns(lived, "item_mail_shirt"), "nothing of theirs is owned");
  assert.strictEqual(growth(lived).unlocks?.unl_road_lead, undefined, "no unlock");
  assert.strictEqual(standing(lived), undefined, "no standing");

  const inTown = play(lived, SUCCESSOR_WALK).state;
  const ready = waitForConvoy(inTown);
  assert.strictEqual(dangerOpen(ready), false, "the hard convoy is closed to them");
  assert.ok(clerkOpen(ready, "opt_guild_clerk_escort_careful"), "the careful way, the world's memory, is open");
  assert.strictEqual(merchantOpen(ready, "opt_town_merchant_buy_steel_sword"), false, "and the steel is out of reach for now");
  for (const [optionId, price] of [["opt_town_merchant_buy_steel_sword", 24], ["opt_town_merchant_buy_mail_shirt", 48]]) {
    const at = (money) => { const c = structuredClone(ready); me(c).money = money; return merchantOpen(c, optionId); };
    assert.deepStrictEqual([at(price - 1), at(price)], [false, true], `the same price for the successor: ${price}`);
  }

  // the same price, the same steel: the silver earned again buys it
  let s = ready;
  let jobs = 0;
  while (me(s).money < 24 && jobs < 20) {
    s = play(play(strong(waitForConvoy(s)), ESCORT).state, [M("loc_castle_town")]).state;
    jobs += 1;
  }
  assert.ok(jobs >= 3 && jobs <= 6, `a few convoys again (${jobs})`);
  assert.ok(merchantOpen(s, "opt_town_merchant_buy_steel_sword"), "the same price: the steel is offered at 24");
  return lived;
}

// 4. save/load between the lives, determinism
function testSaveAndDeterminism({ fell }) {
  assert.deepStrictEqual(validateState(fell), []);
  assert.deepStrictEqual(validateData(worldData), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_fell_geared", fell, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, fell);
  const rest = [NEW_LIFE, ...SUCCESSOR_WALK];
  const end = play(fell, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded between the lives, the same end");
  assert.deepStrictEqual(play(fell, rest).state, end, "the same input, the same world");
}

const first = testCareer();
const result = testHard(first);
testSuccessor(result);
testSaveAndDeterminism(result);
console.log("V2-Core-113 data-world-geared-career.test.js: all checks passed");
