// V2-Core-112 (#272 RPG Depth 4, step 2 -- a harder convoy for the geared lead): through the ordinary step() API and the
// real pack. No engine change; additive content only (D-92). Measured (#275): with steel and mail the lead job is safe
// (about 17% partial-or-fail) and silver piles up; a hard-difficulty lead job pays 14 / 10 / 2 against the lead's
// 8 / 6 / 2 -- +17% silver a job for about +8 points of partial-or-fail. A first prototype without the lead's gate was
// dominated by the lead job, so the hard convoy sits ABOVE it:
//   1. who is offered it: the lead's unlock, a convoy wanting a guard, 3 stamina and steel or mail worn -- each one
//      alone missing closes it (the jerkin and the iron sword do not open it; the clerk says so only when it is open);
//   2. what it asks and pays: a hard check (14), three stamina, 14 / 10 / 2 silver, the guild's regard doubles on a
//      success as the lead's does, and a failure a road wound as the lead's does -- and hp: 3 until V2-Core-125 (#307, Road
//      News), since then what the road's condition asks (2 / 4 / 7, quiet / uneasy / dangerous; data-world-road-news), and a
//      success on a dangerous road pays 3 more;
//   3. it is harder than the lead and pays more: on the same roll it is never a better tier than the lead's, and on
//      a rested guard it pays more on a success than the lead does;
//   4. it is the character's (a successor has none), and nothing about the lead or the ordinary escort changed;
//   5. save compatibility (the start is the same without it), save/load and determinism.
// Staged where it must be (the lead's unlock on a rested guard in the town: the road to it is data-world-road-lead's).
// Pay, difficulty and the words are Provisional gameplay values (R-29). No Canon.
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
const CLERK = (optionId) => [P("act_talk_guild_clerk"), C(optionId)];
const DANGER = CLERK("opt_guild_clerk_escort_danger");
const LEAD = CLERK("opt_guild_clerk_escort_lead");
const ASK = CLERK("opt_guild_clerk_ask");
const OFFER = "txt_guild_clerk_danger_offer";
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const BUY = (id) => [P("act_talk_town_merchant"), C(id)];

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
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const check = (result) => result.events.find((e) => e.type === "check.resolved")?.data;
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score ?? 0;
const open = (s, id) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (s) => { let t = s; for (let h = 0; h < 96 && !open(t, "opt_guild_clerk_escort"); h += 1) t = run(t, [HOUR]).state; assert.ok(open(t, "opt_guild_clerk_escort"), "a convoy wants a guard"); return t; };
const rested = (s) => { const c = structuredClone(s); growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; return c; };

// a lead-holder in the town, with silver; the unlock is staged (data-world-road-lead walks the road to it)
const base = (() => {
  const s = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
  me(s).money = 100;
  growth(s).stats.str = 14;
  growth(s).unlocks = { ...(growth(s).unlocks ?? {}), unl_road_lead: true };
  return s;
})();
const outfit = (...ids) => run(base, ids.flatMap((id) => id.startsWith("act_") ? [P(id)] : BUY(id))).state;
const steel = outfit("opt_town_merchant_buy_steel_sword", "act_equip_steel_sword");
const mail = outfit("opt_town_merchant_buy_mail_shirt", "act_equip_mail_shirt");
const geared = waitForConvoy(rested(steel));

// 1. who is offered it
function testOffered() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.ok(open(geared, "opt_guild_clerk_escort_danger"), "a lead-holder in steel, rested, with a convoy");
  assert.ok(open(waitForConvoy(rested(mail)), "opt_guild_clerk_escort_danger"), "or in mail");
  assert.ok(run(geared, ASK).said.includes(OFFER), "and the clerk says so");

  const without = (edit) => { const c = structuredClone(geared); edit(c); return c; };
  const noUnlock = without((c) => { delete growth(c).unlocks.unl_road_lead; });
  assert.strictEqual(open(noUnlock, "opt_guild_clerk_escort_danger"), false, "no lead unlock");
  assert.ok(!run(noUnlock, ASK).said.includes(OFFER));
  const tired = without((c) => { growth(c).resources.stamina.current = 2; });
  assert.strictEqual(open(tired, "opt_guild_clerk_escort_danger"), false, "2 stamina is not enough");
  assert.strictEqual(open(without((c) => { growth(c).resources.stamina.current = 3; }), "opt_guild_clerk_escort_danger"), true, "3 is");
  assert.ok(!run(tired, ASK).said.includes(OFFER));
  const unarmed = run(geared, [P("act_unequip_steel_sword")]).state;
  assert.strictEqual(open(unarmed, "opt_guild_clerk_escort_danger"), false, "no steel worn");
  assert.ok(!run(unarmed, ASK).said.includes(OFFER));
  const jerkin = run(rested(base), [...BUY("opt_town_merchant_buy_jerkin"), P("act_equip_leather_jerkin")]).state;
  assert.strictEqual(open(waitForConvoy(jerkin), "opt_guild_clerk_escort_danger"), false, "the jerkin does not open it");
  const iron = run(rested(base), [...BUY("opt_town_merchant_buy_sword"), P("act_equip_iron_sword")]).state;
  assert.strictEqual(open(waitForConvoy(iron), "opt_guild_clerk_escort_danger"), false, "nor does the iron sword");
  // no convoy wanting a guard: closed (the first three caravans' rule and the owed shares are the same as the lead's)
  const idle = run(geared, [...CLERK("opt_guild_clerk_escort"), M("loc_castle_town")]).state;
  assert.strictEqual(open(idle, "opt_guild_clerk_escort_danger"), open(idle, "opt_guild_clerk_escort"), "open exactly when a convoy wants a guard (and she can lead)");
}

// 2. what it asks and pays
function testPays() {
  const r = run(geared, DANGER);
  const c = check(r.log[1]);
  assert.strictEqual(c.difficulty, 14, "a hard check");
  assert.strictEqual(growth(geared).resources.stamina.current - growth(r.state).resources.stamina.current, 3, "three stamina");
  assert.strictEqual(r.state.time.minute - geared.time.minute, 720, "half a day");
  // pay by tier, found across rng cursors (V2-Core-125: on the road as it is in this world at that hour)
  const trouble = geared.signals?.road_trouble ?? 0;
  const pay = {};
  const regard = {};
  for (let k = 0; k < 200 && Object.keys(pay).length < 3; k += 1) {
    const t = structuredClone(geared);
    t.rng.cursor += k;
    const out = run(t, DANGER);
    const tier = check(out.log[1]).tier === "partial" ? "fail" : check(out.log[1]).tier;
    pay[tier] ??= me(out.state).money - me(t).money;
    regard[tier] ??= standing(out.state) - standing(t);
    if (tier === "fail") {
      assert.strictEqual(me(t).hp.current - me(out.state).hp.current, [2, 4, 7][trouble], "a failure costs what the road asks");
      assert.strictEqual(growth(out.state).traits?.road_wound, true, "and a road wound");
    } else {
      assert.strictEqual(me(out.state).hp.current, me(t).hp.current, "a success costs no hp");
    }
  }
  assert.deepStrictEqual(pay, trouble === 2 ? { great: 17, success: 13, fail: 2 } : { great: 14, success: 10, fail: 2 });
  assert.strictEqual(regard.great, 10, "the guild's regard doubles, as the lead's does");
  assert.strictEqual(regard.success, 10);
  assert.strictEqual(regard.fail, 0);
}

// 3. harder than the lead, and it pays more
function testHarder() {
  let worse = 0;
  for (let k = 0; k < 120; k += 1) {
    const a = structuredClone(geared); a.rng.cursor += k;
    const lead = check(run(a, LEAD).log[1]);
    const danger = check(run(a, DANGER).log[1]);
    assert.strictEqual(lead.roll, danger.roll, "the same roll");
    assert.strictEqual(danger.difficulty - lead.difficulty, 3, "three points harder");
    const rank = { fail: 0, partial: 1, success: 2, great: 3 };
    assert.ok(rank[danger.tier] <= rank[lead.tier], `never a better tier than the lead's (${k})`);
    if (rank[danger.tier] < rank[lead.tier]) worse += 1;
  }
  assert.ok(worse > 10, `and often worse (${worse} of 120)`);
}

// 4. the character's; nothing else changed
function testCharacters() {
  // the hard convoy can end the guard (staged: the last hp, no strength, and the first bad roll) -- and the next life
  // has none of the lead's unlock, so none of it
  const staged = structuredClone(geared);
  me(staged).hp.current = 1;
  growth(staged).stats.str = 0;
  growth(staged).skills = { ...growth(staged).skills, swordsmanship: 0 };
  let fell;
  for (let k = 0; k < 60 && !fell; k += 1) {
    const t = structuredClone(staged);
    t.rng.cursor += k;
    const r = run(t, DANGER);
    if (r.state.pending?.kind === "newCharacter") fell = r.state;
  }
  assert.ok(fell, "a bad roll ends the guard");
  const next = run(fell, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(growth(next).unlocks?.unl_road_lead, undefined, "the next life has no unlock");
  assert.strictEqual(open(next, "opt_guild_clerk_escort_danger"), false, "and is not offered the hard convoy");
  // the lead and the ordinary escort are as before: the same pay
  const r = run(geared, LEAD);
  assert.ok([8, 6, 2].includes(me(r.state).money - me(geared).money), "the lead pays 8 / 6 / 2 still");
}

// 5. save compatibility, save/load and determinism
function testSave() {
  const without = structuredClone(worldData);
  without.choices.choice_guild_clerk_dialogue.options = without.choices.choice_guild_clerk_dialogue.options.filter((o) => o.id !== "opt_guild_clerk_escort_danger");
  for (const id of Object.keys(without.texts)) if (/^txt_danger_|danger_offer/.test(id)) delete without.texts[id];
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "danger-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "danger-1", data: without, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }
  const path = [...DANGER, M("loc_castle_town"), ...ASK];
  const end = run(geared, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_danger", geared, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, geared);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(geared, path).state, end, "the same input, the same world");
}

testOffered();
testPays();
testHarder();
testCharacters();
testSave();
console.log("V2-Core-112 data-world-danger-road.test.js: all checks passed");
