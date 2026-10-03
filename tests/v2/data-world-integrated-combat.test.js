// V2-Core-60 (#147 Phase E): Integrated Combat -- Talent, Practice/Skill, Mastery, Equipment, Resource,
// Technique and the NPC's capability in one real fight, through the ordinary step() API and the real
// pack. No new rule: each part is pinned by its own unit (D-81..D-88); this checks that they compose.
//   the scout (night vision + investigation talent) observes three times (17 each: 51, the keen eye),
//   buys and wields the iron sword, hears the rumor, searches the dark ruins without a lantern (+32:
//   83, investigation rank 4 = Apprentice), earns the elder's trust and the old wound, and fights:
//   every technique is offered for its own reason; the counter (3) and the old wound (2) spend the
//   scout's stamina; the leader's clean hit is his heavy blow (his stamina); with 1 stamina left only
//   the free techniques remain; two sword cuts fell him (combat 20: swordsmanship 1 = Novice).
// Saved and loaded mid-fight, the rest of the fight is the same; the same input gives the same fight.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { check, evaluateCondition } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const SEED = "integrated-36";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const ASK = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_FIGHT = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...ASK("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"),
  M("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...ASK("opt_report_findings"), ...ASK("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader")
];
const FIGHT = ["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"];
const SYSTEM = worldData.growthSystems.growth_wanderer;

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
const me = (state) => state.actors.player_1;
const growth = (state) => me(state).growth.growth_wanderer;
const leader = (state) => state.actors.npc_bandit_leader;
const stamina = (actor) => actor.growth.growth_wanderer.resources.stamina.current;
const tierLabel = (rank) => SYSTEM.masteryTiers.filter((t) => rank >= t.minRank).at(-1).label;
// the fight options offered now (the UI shows exactly the options whose `requires` hold)
const offered = (state) =>
  worldData.choices.choice_fight_leader.options
    .filter((o) => o.requires === undefined || evaluateCondition(o.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" }))
    .map((o) => o.id);
const start = () => createInitialState({ worldSeed: SEED, data: worldData, templateId: "start_scout" }).state;

// 1. the way in: talent -> practice -> skill and mastery; equipment; trust and the rumor
function testBuildUp() {
  const { state, log } = run(start(), TO_FIGHT);
  const observed = log.slice(0, 3).map((r) => r.events.find((e) => e.type === "proficiency.changed").data.delta);
  assert.deepStrictEqual(observed, [17, 17, 17], "the talent: +2 on every investigation gain");
  assert.strictEqual(growth(state).proficiency.investigation, 83, "51 + the search's 32");
  assert.strictEqual(growth(state).skills.investigation, 4);
  assert.strictEqual(tierLabel(growth(state).skills.investigation), "Apprentice");
  assert.strictEqual(growth(state).unlocks.unl_keen_eye, true);
  assert.strictEqual(me(state).inventory.item_lantern, undefined, "night vision: no lantern needed");
  assert.deepStrictEqual(me(state).loadout, { hand: "item_iron_sword" });
  assert.strictEqual(me(state).money, 0, "3 - the sword's 3");
  assert.strictEqual(state.relations["npc_elder:player_1"].score, 15);
  assert.ok(state.knowledge.player_1.rum_leader_old_wound);
  assert.deepStrictEqual(state.pending, { kind: "choice", choiceId: "choice_fight_leader", sourceId: "act_fight_leader" });
  return state;
}

// 2. availability: every technique offered, each for its own capability
function testAvailability(ready) {
  assert.deepStrictEqual(offered(ready), ["opt_fight_strike", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_counter", "opt_fight_flee"]);
  const without = (mutate) => {
    const s = structuredClone(ready);
    mutate(s);
    return offered(s);
  };
  assert.ok(!without((s) => { s.actors.player_1.loadout = {}; }).includes("opt_fight_sword_cut"), "equipment");
  assert.ok(!without((s) => { delete s.knowledge.player_1.rum_leader_old_wound; }).includes("opt_fight_weak_spot"), "the rumor");
  assert.ok(!without((s) => { delete s.actors.player_1.growth.growth_wanderer.unlocks.unl_keen_eye; }).includes("opt_fight_counter"), "the keen eye");
  const tired = without((s) => { s.actors.player_1.growth.growth_wanderer.resources.stamina.current = 1; });
  assert.ok(!tired.includes("opt_fight_counter") && !tired.includes("opt_fight_weak_spot"), "stamina");
  assert.ok(tired.includes("opt_fight_sword_cut") && tired.includes("opt_fight_strike"), "the free techniques stay");
}

// 3. the fight: costs, the leader's blow, the free techniques at the end, practice -> skill, victory
function testFight(ready) {
  const { state, log } = run(ready, FIGHT.map(C));
  const tiers = log.map((r) => r.events.find((e) => e.type === "check.resolved").data.tier);
  assert.deepStrictEqual(tiers, ["partial", "fail", "success", "success"]);

  // the counter: the scout pays 3; a partial is no clean hit, so the leader pays nothing
  const [counter, weak, cut1, cut2] = log;
  const spent = (r, who) => r.events.filter((e) => e.type === "resource.changed" && e.actorId === who).map((e) => e.data.delta);
  assert.deepStrictEqual([spent(counter, "player_1"), spent(counter, "npc_bandit_leader")], [[-3], []]);
  // the old wound: the scout pays 2; it fails -- the leader's heavy blow, paid with his stamina
  assert.deepStrictEqual([spent(weak, "player_1"), spent(weak, "npc_bandit_leader")], [[-2], [-3]]);
  assert.ok(weak.events.some((e) => e.type === "narration" && e.data.textId === "txt_fight_leader_heavy_blow"));
  // with 1 stamina only the free techniques remain; the sword cuts cost nothing
  assert.strictEqual(stamina(me(weak.state)), 1);
  assert.deepStrictEqual(offered(weak.state), ["opt_fight_strike", "opt_fight_sword_cut", "opt_fight_flee"]);
  assert.deepStrictEqual([spent(cut1, "player_1"), spent(cut2, "player_1")], [[], []]);

  // practice -> skill -> mastery, from the fight itself (the talent is not combat's)
  assert.strictEqual(growth(state).proficiency.combat, 20, "4 exchanges x 5");
  assert.strictEqual(growth(state).skills.swordsmanship, 1);
  assert.strictEqual(tierLabel(growth(state).skills.swordsmanship), "Novice");
  // practice is the exchange's outcome, after its check: the 4th exchange was rolled at combat 15 (rank 0),
  // and the rank it earned counts from the next check on (the same check, made now, has the +1)
  const skillMod = (modifiers) => modifiers.find((m) => m.source === "skill:swordsmanship")?.value;
  assert.strictEqual(skillMod(cut2.events.find((e) => e.type === "check.resolved").data.modifiers), undefined);
  const cutSpec = worldData.choices.choice_fight_leader.options.find((o) => o.id === "opt_fight_sword_cut").check;
  assert.strictEqual(skillMod(check(cutSpec, { state, data: worldData, actorId: "player_1" }).result.modifiers), 1);

  // the end: he falls, the case closes, his gang is cowed; the scout stands with 1 HP and 1 stamina
  assert.strictEqual(leader(state).alive, false);
  assert.strictEqual(stamina(leader(state)), 3, "one blow spent");
  assert.strictEqual(state.cases.case_ruins_mystery.stage, "resolved");
  assert.ok(state.relations["org_bandits:player_1"].tags.includes("cowed"));
  assert.deepStrictEqual([me(state).alive, me(state).hp.current, stamina(me(state))], [true, 1, 1]);
  assert.strictEqual(state.pending, null);
  assert.deepStrictEqual(validateState(state), []);
  return state;
}

// 4. save/load mid-fight: the rest of the fight is the same; determinism end to end
function testSaveLoadAndDeterminism(ready, finished) {
  const mid = run(ready, FIGHT.slice(0, 2).map(C)).state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_mid_fight", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(run(loaded, FIGHT.slice(2).map(C)).state, finished, "loaded, the same end");
  assert.deepStrictEqual(run(start(), [...TO_FIGHT, ...FIGHT.map(C)]).state, finished, "the same input, the same fight");
}

const ready = testBuildUp();
testAvailability(ready);
const finished = testFight(ready);
testSaveLoadAndDeterminism(ready, finished);

console.log("V2-Core-60 data-world-integrated-combat.test.js: all checks passed");
