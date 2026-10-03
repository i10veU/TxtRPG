// V2-Core-67 (#160, Fantasy World Vertical Slice 2, step 4 -- integrated playthrough): the two stories
// of the fantasy world in one world, through the ordinary step() API and the real pack. No new rule.
// A small deterministic play policy (below) works the fouled well from any state -- it consults and
// learns from the herbalist, finds the cause, gathers (resting when HP or stamina runs low), has the
// remedy brewed, purifies and reports -- so the slice is played as a player would, not as a fixed script:
//   1. one scout: the bandit leader's fight (tests/v2/data-world-integrated-combat.test.js), then the
//      well -- both histories stand side by side; stamina serves the fight and the gathering alike;
//   2. succession: a reckless first character falls at the spring with a remedy in hand; the successor
//      learns it all anew and finishes it -- the world's facts stay, the knowledge, the herbs and the
//      herbalist's trust do not; the thanks are the successor's;
//   3. eight seeds: the policy always resolves the well, and every end state is valid.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const ASK = (optionId) => [P("act_talk_elder"), C(optionId)];

// the next actions towards the purified spring, from any state (null: nothing left to do). `reckless`
// never rests for HP (only for stamina it needs)
function nextForWell(s, { reckless = false } = {}) {
  if (s.pending?.kind === "newCharacter") return [{ type: "startCharacter", templateId: "start_wanderer" }];
  const id = s.player.actorId;
  const me = s.actors[id];
  const loc = me.locationId;
  const hp = reckless ? me.hp.max : me.hp.current;
  const stamina = me.growth.growth_wanderer.resources?.stamina?.current ?? 6;
  const inventory = me.inventory ?? {};
  const knows = s.knowledge?.[id] ?? {};
  const tags = s.relations?.[`npc_herbalist:${id}`]?.tags ?? [];
  const go = (to) => (loc === to ? null : loc === "loc_village" ? [M(to)] : [M("loc_village")]);
  if (s.cases?.case_fouled_well?.stage === "resolved") {
    return tags.includes("purifier") && !tags.includes("thanked") ? go("loc_market") ?? H("opt_herbalist_report_spring") : null;
  }
  if (!tags.includes("consulted")) return go("loc_market") ?? H("opt_herbalist_ask_sickness");
  if (!tags.includes("taught") && me.money >= 2) return go("loc_market") ?? H("opt_herbalist_teach");
  if ((inventory.item_purifying_herb ?? 0) >= 2 && !inventory.item_spring_remedy) return go("loc_market") ?? H("opt_herbalist_brew");
  const gathering = !inventory.item_spring_remedy && knows.rum_spring_cause;
  if (loc === "loc_village" && (hp < 8 || (gathering && stamina < 2))) return [P("act_rest_village")];
  if (hp <= 4 || (gathering && stamina < 2)) return go("loc_village");
  if (inventory.item_spring_remedy && knows.rum_spring_cause) return go("loc_forest_spring") ?? [P("act_purify_spring")];
  if (!knows.rum_spring_cause) return go("loc_forest_spring") ?? [P("act_search_spring")];
  return go("loc_forest_spring") ?? [P("act_gather_herbs")];
}
function apply(state, action, log) {
  const result = step(state, action, worldData);
  assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
  log.push({ action, result });
  return result.state;
}
// play the well with the policy; the first character may be reckless (succession continues sensibly)
function playWell(state, { recklessFirst = false, limit = 300 } = {}) {
  const log = [];
  for (let i = 0; i < limit; i += 1) {
    const next = nextForWell(state, { reckless: recklessFirst && state.player.actorId === "player_1" });
    if (next === null) return { state, log };
    for (const action of next) state = apply(state, action, log);
  }
  assert.fail("the well was not resolved within the limit");
}
const run = (state, actions) => actions.reduce((s, a) => apply(s, a, []), state);
const fired = (log, id) => log.filter(({ result }) => result.events.some((e) => e.type === "trigger.fired" && e.data.eventId === id)).length;
const died = (log) => log.findIndex(({ result }) => result.events.some((e) => e.type === "actor.died"));
const g = (state, id = state.player.actorId) => state.actors[id].growth.growth_wanderer;
const offered = (state, choiceId, optionId) => {
  const option = worldData.choices[choiceId].options.find((o) => o.id === optionId);
  return evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};

// the bandit leader's fight (V2-Core-60's seed and route)
const TO_FIGHT = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...ASK("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"),
  M("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...ASK("opt_report_findings"), ...ASK("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C)
];
const scoutAfterTheFight = () => run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, TO_FIGHT);

// 1. one scout, both stories
function testOneCharacterBothStories() {
  const afterFight = scoutAfterTheFight();
  assert.strictEqual(afterFight.cases.case_ruins_mystery.stage, "resolved");
  assert.strictEqual(g(afterFight).resources.stamina.current, 1, "the fight spent the scout's stamina");
  const { state, log } = playWell(afterFight);
  assert.strictEqual(died(log), -1, "nobody fell");
  assert.strictEqual(state.player.actorId, "player_1");
  // both histories, side by side
  assert.strictEqual(state.cases.case_ruins_mystery.stage, "resolved");
  assert.strictEqual(state.cases.case_fouled_well.stage, "resolved");
  assert.ok(state.relations["org_bandits:player_1"].tags.includes("cowed"));
  assert.strictEqual(fired(log, "evt_market_reopens"), 1, "the market's relief, on the way to the herbalist");
  assert.strictEqual(fired(log, "evt_well_clears"), 1);
  assert.ok(offered(state, "choice_elder_dialogue", "opt_ask_bandit_news"), "the elder still tells the bandits' fate");
  assert.deepStrictEqual(state.relations["npc_herbalist:player_1"].tags, ["consulted", "purifier", "taught", "thanked"]);
  // the market's 3 silver paid for the lesson; rest restored the stamina the fight had spent; the
  // gathering spent it again
  const restAfterFight = log.findIndex(({ action }) => action.actionId === "act_rest_village");
  const firstGather = log.findIndex(({ action }) => action.actionId === "act_gather_herbs");
  assert.ok(restAfterFight >= 0 && restAfterFight < firstGather);
  assert.ok(log.filter(({ action }) => action.actionId === "act_gather_herbs").every(({ result }) =>
    result.events.some((e) => e.type === "resource.changed" && e.actorId === "player_1" && e.data.delta === -2)));
  // three practices grew three skills
  assert.deepStrictEqual(g(state).skills, { investigation: 5, swordsmanship: 1, herbalism: 3 });
  assert.deepStrictEqual(validateState(state), []);
  // save/load in the middle of the well (after the remedy is brewed), the same end
  const brewed = log.findIndex(({ action }) => action.optionId === "opt_herbalist_brew");
  const mid = log[brewed].result.state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_two_stories", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(playWell(loaded).state, state, "loaded, the same end");
  assert.deepStrictEqual(playWell(scoutAfterTheFight()).state, state, "the same input, the same world");
}

// 2. succession: the first character falls at the spring with a remedy; the successor finishes it
function testSuccessionFinishesTheStory() {
  const { state, log } = playWell(createInitialState({ worldSeed: "two-1", data: worldData }).state, { recklessFirst: true });
  const fall = died(log);
  assert.ok(fall >= 0, "the first character fell");
  const atDeath = log[fall].result.state;
  assert.strictEqual(atDeath.actors.player_1.locationId, "loc_forest_spring");
  assert.strictEqual(atDeath.actors.player_1.inventory.item_spring_remedy, 1, "with the remedy in hand");
  assert.deepStrictEqual(atDeath.pending, { kind: "newCharacter" });
  assert.strictEqual(atDeath.cases?.case_fouled_well, undefined, "not purified");
  // the successor starts with nothing of theirs: no knowledge, no herbs, no trust
  const start2 = log[fall + 1].result.state;
  assert.strictEqual(start2.player.actorId, "player_2");
  assert.deepStrictEqual(start2.knowledge?.player_2 ?? {}, {});
  assert.deepStrictEqual(start2.actors.player_2.inventory, {});
  assert.strictEqual(start2.actors.player_2.money, 11, "a wanderer's 8 and the succession's 3 -- the only bridge (rules.succession)");
  assert.strictEqual(start2.relations?.["npc_herbalist:player_2"], undefined);
  // ... but the world remembers what was found
  assert.strictEqual(start2.facts.fact_spring_cause.value, "rotting_carcass");
  // and finishes it
  assert.strictEqual(state.player.actorId, "player_2");
  assert.strictEqual(state.cases.case_fouled_well.stage, "resolved");
  assert.deepStrictEqual(state.relations["npc_herbalist:player_1"].tags, ["consulted", "taught"], "the first never purified");
  assert.deepStrictEqual(state.relations["npc_herbalist:player_2"].tags, ["consulted", "purifier", "taught", "thanked"]);
  const successorActions = log.slice(fall + 1).map(({ action }) => action.actionId ?? action.optionId);
  assert.ok(successorActions.includes("act_search_spring"), "the successor found the cause with their own eyes");
  assert.strictEqual(fired(log, "evt_well_clears"), 1);
  assert.deepStrictEqual(validateState(state), []);
  // deterministic
  assert.deepStrictEqual(playWell(createInitialState({ worldSeed: "two-1", data: worldData }).state, { recklessFirst: true }).state, state);
}

// 3. the policy resolves the well on every seed, and every end is a valid state
function testManySeeds() {
  for (let i = 1; i <= 8; i += 1) {
    const { state } = playWell(createInitialState({ worldSeed: `two-${i}`, data: worldData }).state);
    assert.strictEqual(state.cases.case_fouled_well.stage, "resolved", `two-${i}`);
    assert.ok(state.relations[`npc_herbalist:${state.player.actorId}`].tags.includes("thanked"), `two-${i}`);
    assert.deepStrictEqual(validateState(state), [], `two-${i}`);
  }
}

testOneCharacterBothStories();
testSuccessionFinishesTheStory();
testManySeeds();

console.log("V2-Core-67 data-world-two-stories.test.js: all checks passed");
