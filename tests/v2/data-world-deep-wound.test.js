// V2-Core-121 (#298 Death & Injury, step 1 -- the mild wound heals, the deep wound): through the ordinary step() API and the real
// pack. No engine change, no new state field (one new trait id). The owner approved model M1' (#297): a risky act leaves a
// meaningful middle between living and dying. What is pinned:
//   1. the mild wound (`road_wound`): a failed escort that leaves hp above 2 leaves it; a night's lodging closes it (it used
//      to stay until the salve), and so does a rest at the village; the salve still closes it at once; a success leaves none;
//   2. the deep wound (`road_wound_deep`): a failed escort that leaves hp at 2 or below (not above) makes it, together with the
//      mild one; it adds a further -1 to every combat check (-3 in all); a night heals +2 (not +4) and does not close it
//      while hp is short; it closes -- both wounds -- when a night brings hp back to full, or with the salve (which says so);
//   3. it closes the lead and danger jobs (ordinary escort and the careful way stay open) and the clerk says why; the jobs
//      are offered again when it closes;
//   4. old saves: a character with a mild wound from before heals at the next lodging; nothing deep is made for the past;
//   5. the wound is the character's: a successor starts whole; save/load and determinism.
// The numbers (hp <= 2, -1, +2, rest-clear) are Provisional game values (R-29), set on measurements (#297); they are
// pinned as the current values so a change is a decision, not a drift.
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
const CLERK = (id) => [P("act_talk_guild_clerk"), C(id)];
const ESCORT = CLERK("opt_guild_clerk_escort");
const ASK = CLERK("opt_guild_clerk_ask");
const LODGE = P("act_lodge_castle_town");
const REST = P("act_rest_village");
const TREAT = P("act_treat_road_wound");
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const HOME = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village")];

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
const rejected = (s, a) => step(s, a, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const traits = (s) => growth(s).traits ?? {};
const mild = (s) => traits(s).road_wound === true;
const deep = (s) => traits(s).road_wound_deep === true;
const hp = (s) => me(s).hp.current;
const optionOpen = (s, id) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (s) => { for (let h = 0; h < 96 && !optionOpen(s, "opt_guild_clerk_escort"); h += 1) s = play(s, [HOUR]).state; assert.ok(optionOpen(s, "opt_guild_clerk_escort"), "a convoy wants a guard"); return s; };

const town = (() => { const s = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state; me(s).money = 200; return s; })();
// a guard at hp `h` with a convoy waiting; weak enough that the first bad roll fails
function ready(h, { lead = false, geared = false } = {}) {
  let s = waitForConvoy(structuredClone(town));
  me(s).hp.current = h;
  growth(s).stats.str = 0;
  growth(s).resources.stamina.current = 6;
  if (lead) growth(s).unlocks = { ...(growth(s).unlocks ?? {}), unl_road_lead: true };
  if (geared) s = play(s, [P("act_talk_town_merchant"), C("opt_town_merchant_buy_steel_sword"), P("act_equip_steel_sword")]).state;
  return s;
}
// the first rng cursor at which the escort fails, found deterministically
function fails(s) {
  for (let k = 0; k < 60; k += 1) {
    const t = structuredClone(s);
    t.rng.cursor += k;
    const r = play(t, ESCORT);
    if (r.said.includes("txt_escort_fail")) {
      // the escort ends at the far bank: walk back to the town (unless the fall ended the life)
      const back = r.state.pending ? r : { ...r, state: play(r.state, [M("loc_castle_town")]).state };
      return { before: t, after: back };
    }
  }
  throw new Error("no bad roll within 60 rolls");
}

// 1. the mild wound
function testMild() {
  assert.deepStrictEqual(validateData(worldData), []);
  // hp 6 -> 3 after the fail: above the line, a mild wound only
  const f = fails(ready(6));
  assert.strictEqual(hp(f.after.state), 3);
  assert.ok(mild(f.after.state) && !deep(f.after.state), "hp 3 after the hit: mild only");
  assert.ok(f.after.said.includes("txt_escort_wound") && !f.after.said.includes("txt_escort_deep_wound"));
  // a success leaves none
  const win = play(ready(10), ESCORT);
  assert.ok(!win.said.includes("txt_escort_fail") ? !mild(win.state) : true);
  // a night's lodging closes it, and says so; the village's rest does too; hp heals +4
  const night = play(f.after.state, [LODGE]);
  assert.ok(!mild(night.state), "a night closes a mild wound");
  assert.ok(night.said.includes("txt_rest_wound_closes"));
  assert.strictEqual(hp(night.state), 7, "+4 hp");
  const home = play(f.after.state, [...HOME, REST]);
  assert.ok(!mild(home.state), "and so does a rest at the village");
  // the salve still closes it at once
  const salved = structuredClone(f.after.state);
  me(salved).inventory = { ...(me(salved).inventory ?? {}), item_herbal_salve: 1 };
  const treated = play(salved, [TREAT]);
  assert.ok(!mild(treated.state));
  assert.ok(treated.said.includes("txt_treat_road_wound") && !treated.said.includes("txt_treat_deep_wound"));
  assert.strictEqual(me(treated.state).inventory.item_herbal_salve ?? 0, 0);
}

// 2. the deep wound: where the line is, what it weighs, how it heals
function testDeep() {
  for (const [h, expectDeep] of [[10, false], [8, false], [6, false], [5, true], [4, true]]) {
    const f = fails(ready(h));
    assert.strictEqual(hp(f.after.state), h - 3, `hp ${h} -> ${h - 3}`);
    assert.strictEqual(deep(f.after.state), expectDeep, `a failed escort from hp ${h} (hp ${h - 3} after): deep is ${expectDeep}`);
    assert.ok(mild(f.after.state), "the mild wound comes either way");
    assert.strictEqual(f.after.said.includes("txt_escort_deep_wound"), expectDeep);
    assert.strictEqual(f.after.said.includes("txt_escort_wound"), !expectDeep, "one word for the wound, not two");
  }
  const f = fails(ready(5));
  const wounded = f.after.state;
  assert.strictEqual(hp(wounded), 2);
  // it weighs: -2 (mild) and -1 (deep) on a combat check; compare the same roll with and without
  const next = waitForConvoy(structuredClone(wounded));
  growth(next).resources.stamina.current = 6;
  const check = (s) => play(s, ESCORT).log.at(-1).events.find((e) => e.type === "check.resolved")?.data;
  const e = check(next);
  assert.deepStrictEqual(e.modifiers.filter((m) => m.source.startsWith("trait:road_wound")).map((m) => [m.source, m.value]).sort(),
    [["trait:road_wound", -2], ["trait:road_wound_deep", -1]]);
  const clean = structuredClone(next);
  delete growth(clean).traits.road_wound;
  delete growth(clean).traits.road_wound_deep;
  assert.strictEqual(check(clean).total - e.total, 3, "three points on the same roll");
  // a night heals half as much and does not close it while hp is short
  const night1 = play(wounded, [LODGE]);
  assert.strictEqual(hp(night1.state), 4, "+2 hp, not +4");
  assert.ok(deep(night1.state) && mild(night1.state), "still deep");
  assert.ok(night1.said.includes("txt_rest_deep_wound_stays") && !night1.said.includes("txt_rest_wound_closes"));
  // enough nights: it closes with the one that brings hp back to full -- both wounds
  let s = night1.state;
  let nights = 1;
  while (deep(s) && nights < 10) { s = play(s, [LODGE]).state; nights += 1; }
  assert.strictEqual(nights, 4, "hp 2 -> 4 -> 6 -> 8 -> 10: four nights");
  assert.ok(!deep(s) && !mild(s), "closed, both");
  assert.strictEqual(hp(s), 10);
  assert.ok(play(night1.state, [LODGE, LODGE, LODGE]).said.includes("txt_rest_deep_wound_closes"), "and the last night says so");
  // the village's rest heals the same way
  const village = play(wounded, [...HOME, REST]);
  assert.strictEqual(hp(village.state), 4);
  assert.ok(deep(village.state));
  // the salve closes it at once and says so
  const salved = structuredClone(wounded);
  me(salved).inventory = { ...(me(salved).inventory ?? {}), item_herbal_salve: 2 };
  const treated = play(salved, [TREAT]);
  assert.ok(!deep(treated.state) && !mild(treated.state), "both closed");
  assert.ok(treated.said.includes("txt_treat_deep_wound"));
  assert.strictEqual(me(treated.state).inventory.item_herbal_salve, 1, "one salve used");
  assert.strictEqual(hp(treated.state), 2, "the salve closes the wound; hp is the night's");
  return wounded;
}

// 3. the lead and danger jobs are closed to a deep wound; the clerk says why; they come back when it closes
function testJobs() {
  const geared = ready(5, { lead: true, geared: true });
  assert.ok(optionOpen(geared, "opt_guild_clerk_escort_lead"), "whole: the lead job is open");
  assert.ok(optionOpen(geared, "opt_guild_clerk_escort_danger"), "and the danger job");
  const wounded = fails(geared).after.state;
  assert.ok(deep(wounded));
  growth(wounded).resources.stamina.current = 6;
  const open = waitForConvoy(wounded);
  assert.ok(!optionOpen(open, "opt_guild_clerk_escort_lead"), "deep: no lead job");
  assert.ok(!optionOpen(open, "opt_guild_clerk_escort_danger"), "deep: no danger job");
  assert.ok(optionOpen(open, "opt_guild_clerk_escort"), "the ordinary escort stays open");
  assert.ok(optionOpen(open, "opt_guild_clerk_escort_careful") || !(open.signals?.guards_fallen > 0), "the careful way is a world memory, unaffected");
  assert.strictEqual(rejected(play(open, [P("act_talk_guild_clerk")]).state, C("opt_guild_clerk_escort_lead")), "requirements_not_met", "choosing the lead option is refused");
  const asked = play(open, ASK);
  assert.ok(asked.said.includes("txt_guild_clerk_sees_deep_wound"));
  assert.ok(asked.said.includes("txt_guild_clerk_deep_closes_lead"), "the clerk says why the lead job is closed");
  assert.ok(!asked.said.includes("txt_guild_clerk_lead_offer") && !asked.said.includes("txt_guild_clerk_danger_offer"), "and offers neither");
  assert.ok(!asked.said.includes("txt_guild_clerk_sees_wound"), "the deep word replaces the mild one");
  // the jobs come back with the salve (or the nights)
  const salved = structuredClone(open);
  me(salved).inventory = { ...(me(salved).inventory ?? {}), item_herbal_salve: 1 };
  const healed = waitForConvoy(play(salved, [TREAT]).state);
  growth(healed).resources.stamina.current = 6;
  assert.ok(optionOpen(healed, "opt_guild_clerk_escort_lead"), "healed: the lead job again");
  assert.ok(play(healed, ASK).said.includes("txt_guild_clerk_lead_offer"));
  // an ordinary guard with a deep wound hears the sizing-up, not the lead word
  const plain = fails(ready(5)).after.state;
  const plainAsk = play(waitForConvoy(plain), ASK);
  assert.ok(plainAsk.said.includes("txt_guild_clerk_sees_deep_wound") && !plainAsk.said.includes("txt_guild_clerk_deep_closes_lead"));
}

// 4. old saves: a mild wound from before heals; nothing deep is made for the past
function testOldSave() {
  const old = structuredClone(town);
  growth(old).traits = { road_wound: true }; // exactly what the previous pack wrote
  me(old).hp.current = 2;
  assert.deepStrictEqual(validateState(old), []);
  const night = play(old, [LODGE]);
  assert.ok(!mild(night.state) && !deep(night.state), "healed at the next lodging; nothing deep for a low hp already past");
  assert.ok(night.said.includes("txt_rest_wound_closes"));
  assert.strictEqual(hp(night.state), 6);
  // a save made while a convoy waits: the same, and the clerk has no deep word for it
  const asked = play(waitForConvoy(old), ASK);
  assert.ok(asked.said.includes("txt_guild_clerk_sees_wound") && !asked.said.includes("txt_guild_clerk_sees_deep_wound"));
  assert.strictEqual(old.signals?.guards_maimed, undefined, "no memory is made of it");
}

// 5. the wound is the character's; save/load; determinism
function testSuccessorAndSave(wounded) {
  const doomed = fails(ready(2)).after.state;
  assert.deepStrictEqual(doomed.pending, { kind: "newCharacter" });
  const next = play(doomed, [NEW_LIFE]).state;
  assert.ok(!mild(next) && !deep(next), "a new life, no old wound");
  assert.strictEqual(hp(next), me(createInitialState({ worldSeed: "x", data: worldData }).state).hp.max);
  const start = waitForConvoy(structuredClone(wounded));
  const path = [LODGE, LODGE, LODGE, LODGE];
  const end = play(start, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_deep", start, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, start);
  assert.deepStrictEqual(play(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(start, path).state, end, "the same input, the same world");
}

testMild();
const wounded = testDeep();
testJobs();
testOldSave();
testSuccessorAndSave(wounded);
console.log("V2-Core-121 data-world-deep-wound.test.js: all checks passed");
