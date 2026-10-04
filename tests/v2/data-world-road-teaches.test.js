// V2-Core-99 (#244, RPG Depth 2, step 1 -- the road teaches): a data fix, through the ordinary step() API and the
// real pack. No engine change, version 0.3.0.
//   The escort's practice (D-95: swordsmanship practice 10 / 10 / 5) wrote `proficiency.swordsmanship` -- the skill's
//   name, a proficiency the growth system never defined -- so since V2-Core-78 the road taught nothing. It now goes
//   to `combat`, the proficiency that ranks swordsmanship (D-81): a rank at every 20 points, +1 on every combat check.
//   1. the pack names only what it defines: every id an Effect, a Condition, a check or a link refers to exists
//      (the class of mismatch this fix closes cannot come back unseen);
//   2. the practice by tier, and the rank it reaches;
//   3. natural play: the honoured scout's swordsmanship grows with her escorts, and her checks with it;
//   4. a save from before the fix: it loads; its dead `swordsmanship` points stay as they are (not converted, not
//      removed) and feed nothing; the road teaches from now on;
//   5. save/load and determinism.
// Practice and ranks are the character's; values are gameplay values. No Canon.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
const DAY = { type: "wait", minutes: 1440 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const BACK_AND_WAIT = [M("loc_castle_town"), DAY, DAY, DAY];
// history-41: the dispersal, the crossing, the road north -- data-world-caravan-guard
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
// integrated-36, the honoured scout of Slice 3 -- data-world-guard-career
const SCOUT_HONOURED = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, REST,
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_ask_sickness"), P("act_talk_herbalist"), C("opt_herbalist_teach"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_search_spring"), P("act_search_spring"), P("act_gather_herbs"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), REST, M("loc_forest_spring"), P("act_gather_herbs"),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_brew"), M("loc_village"), REST, M("loc_forest_spring"), P("act_purify_spring"),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_report_spring"), M("loc_village"),
  ...E("opt_tell_spring_arrows"), ...E("opt_village_honor")
];
const SCOUT_TO_TOWN = [REST, ...E("opt_ask_region"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];

function play(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const lastCheck = (r) => r.log.map((x) => x.events.find((e) => e.type === "check.resolved")).filter(Boolean).at(-1).data;
const skillMod = (c) => c.modifiers.find((m) => m.source === "skill:swordsmanship")?.value ?? 0;
const withStr = (s, str) => { const c = structuredClone(s); growth(c).stats.str = str; growth(c).resources.stamina.current = 6; return c; };

// 1. every id the pack refers to is defined
function referencedIds(data) {
  const systems = Object.values(data.growthSystems);
  const defined = {
    proficiency: new Set(systems.flatMap((g) => (g.proficiencies ?? []).map((x) => x.id))),
    skill: new Set(systems.flatMap((g) => (g.skills ?? []).map((x) => x.id))),
    trait: new Set(systems.flatMap((g) => (g.traits ?? []).map((x) => x.id))),
    resource: new Set(systems.flatMap((g) => (g.resources ?? []).map((x) => x.id))),
    unlock: new Set(systems.flatMap((g) => (g.unlocks ?? []).map((x) => x.id))),
    item: new Set(Object.keys(data.items)), location: new Set(Object.keys(data.locations)), text: new Set(Object.keys(data.texts)),
    choice: new Set(Object.keys(data.choices)), fact: new Set(Object.keys(data.facts)), rumor: new Set(Object.keys(data.rumors))
  };
  const dangling = [];
  const ref = (kind, id, where) => { if (typeof id === "string" && !defined[kind].has(id)) dangling.push(`${kind} ${id} @ ${where}`); };
  const kindOf = { proficiency: ["proficiency", "id"], skill: ["skill", "skill"], trait: ["trait", "trait"], resource: ["resource", "resource"],
    unlock: ["unlock", "id"], item: ["item", "item"], equip: ["item", "item"], unequip: ["item", "item"], move: ["location", "to"],
    location: ["location", "at"], narrate: ["text", "textId"], choice: ["choice", "choice"], fact: ["fact", "fact"], rumor: ["rumor", "rumor"] };
  const walk = (x, where) => {
    if (Array.isArray(x)) return x.forEach((y) => walk(y, where));
    if (!x || typeof x !== "object") return;
    if (kindOf[x.op]) ref(kindOf[x.op][0], x[kindOf[x.op][1]], where);
    if (x.op === undefined && typeof x.skill === "string") ref("skill", x.skill, `${where} (check)`);
    for (const v of Object.values(x)) if (v && typeof v === "object") walk(v, where);
  };
  for (const [id, a] of Object.entries(data.actions)) walk(a, id);
  for (const c of Object.values(data.choices)) for (const o of c.options) walk(o, o.id);
  for (const [id, e] of Object.entries(data.events)) walk(e, id);
  for (const [id, l] of Object.entries(data.locations)) for (const k of l.links ?? []) { ref("location", k.to, id); walk(k.requires, `${id}->${k.to}`); }
  for (const g of systems) walk(g, g.id);
  return dangling;
}
function testPackNamesOnlyWhatItDefines() {
  assert.deepStrictEqual(referencedIds(worldData), [], "no dangling id");
  // the walk does see such a mismatch: the bug this step fixes, put back
  const broken = structuredClone(worldData);
  const escort = broken.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort");
  escort.outcomes.success.find((e) => e.op === "proficiency").id = "swordsmanship";
  assert.deepStrictEqual(referencedIds(broken), ["proficiency swordsmanship @ opt_guild_clerk_escort"]);
}

// 2. the practice by tier goes to `combat`, and ranks swordsmanship
function testPractice() {
  const town = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
  assert.strictEqual(growth(town).proficiency?.combat, undefined, "the wanderer has never fought");
  const seen = new Set();
  for (const str of [1, 8, 14, 30]) {
    const before = withStr(town, str);
    const done = play(before, ESCORT);
    const tier = lastCheck(done).tier === "partial" ? "fail" : lastCheck(done).tier;
    seen.add(tier);
    assert.strictEqual(growth(done.state).proficiency.combat, { great: 10, success: 10, fail: 5 }[tier], `practice on ${tier}`);
    assert.strictEqual(growth(done.state).proficiency.swordsmanship, undefined, "no dead entry");
  }
  assert.deepStrictEqual([...seen].sort(), ["fail", "great", "success"]);
  // 15 points -> 25: the first rank, and the next escort's check carries it
  const near = withStr(town, 14);
  growth(near).proficiency = { ...growth(near).proficiency, combat: 15 };
  const first = play(near, ESCORT);
  assert.strictEqual(lastCheck(first).tier, "success");
  assert.strictEqual(skillMod(lastCheck(first)), 0, "the rank comes after the road, not during it");
  assert.strictEqual(growth(first.state).proficiency.combat, 25);
  assert.strictEqual(growth(first.state).skills.swordsmanship, 1, "a rank at 20");
  const next = play(withStr(play(first.state, BACK_AND_WAIT).state, 14), ESCORT);
  assert.strictEqual(skillMod(lastCheck(next)), 1, "and the next escort carries it");
}

// 3. natural play: the honoured scout grows with her escorts
const scoutInTown = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;
function testScoutGrows() {
  assert.strictEqual(growth(scoutInTown).proficiency.combat, 20, "the leader fight's practice");
  assert.strictEqual(growth(scoutInTown).skills.swordsmanship, 1);
  let s = scoutInTown;
  const mods = [];
  const ranks = [];
  for (let i = 0; i < 3; i += 1) {
    const r = play(s, ESCORT);
    mods.push(skillMod(lastCheck(r)));
    ranks.push(growth(r.state).skills.swordsmanship);
    s = play(r.state, BACK_AND_WAIT).state;
  }
  assert.deepStrictEqual(mods, [1, 1, 2], "every check carries the rank the road has taught so far");
  assert.deepStrictEqual(ranks, [1, 2, 2], "two good escorts, a rank");
  assert.strictEqual(growth(s).proficiency.combat, 50);
  return s;
}

// 4. a save from before the fix: its dead points stay and feed nothing; the road teaches from now on
function testOldSave() {
  const old = structuredClone(scoutInTown);
  growth(old).proficiency.swordsmanship = 20; // two escorts' practice, written where nothing reads it
  assert.deepStrictEqual(validateState(old), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_before_fix", old, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, old, "it loads unchanged");
  const r = play(loaded, ESCORT);
  assert.strictEqual(skillMod(lastCheck(r)), 1, "the dead points feed no check");
  assert.strictEqual(lastCheck(r).total, lastCheck(play(scoutInTown, ESCORT)).total, "the same roll as without them");
  assert.strictEqual(growth(r.state).proficiency.swordsmanship, 20, "not converted, not removed");
  assert.strictEqual(growth(r.state).proficiency.combat, 30, "the road teaches from now on");
}

// 5. save/load and determinism
function testSaveAndDeterminism() {
  const rest = [...ESCORT, ...BACK_AND_WAIT, ...ESCORT];
  const end = play(scoutInTown, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_teaches", scoutInTown, { savedAt: 1 }))));
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  const again = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN, ...rest]).state;
  assert.deepStrictEqual(again, end, "the same input, the same world");
}

testPackNamesOnlyWhatItDefines();
testPractice();
testScoutGrows();
testOldSave();
testSaveAndDeterminism();
console.log("V2-Core-99 data-world-road-teaches.test.js: all checks passed");
