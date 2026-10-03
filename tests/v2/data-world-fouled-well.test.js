// V2-Core-64 (#160, Fantasy World Vertical Slice 2, step 1 -- discovery): the fouled well, through the
// ordinary step() API and the real pack. No engine change; additive content only:
//   the village well (a PER check) -- a success records the water's source (the world's fact) and the
//   character sees it first-hand; the market herbalist tells the same (a dialogue NPC, +5 trust once,
//   her `consulted` tag); knowing the source opens the way to the forest spring; there the miasma is a
//   checked `data.events` entry (CON: resisted, or 2 HP; every 30 minutes while the case is open), and
//   searching the spring (PER) finds what fouls it.
// A 0.3.0 save loads it unchanged: the new content changes nothing createInitialState writes.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const ASK_HERBALIST = [M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_ask_sickness"), M("loc_village")];
// well-9: the well succeeds; the miasma on arrival is not resisted; the search succeeds; the next miasma is resisted
const SEED = "well-9";
const CANONICAL = [P("act_inspect_well"), ...ASK_HERBALIST, M("loc_forest_spring"), P("act_search_spring")];

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
const start = (seed = SEED) => createInitialState({ worldSeed: seed, data: worldData }).state;
const me = (state) => state.actors[state.player.actorId];
const tierOf = (result) => result.events.find((e) => e.type === "check.resolved")?.data.tier;
const checks = (result) => result.events.filter((e) => e.type === "check.resolved").map((e) => e.data);
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const knows = (state, rumorId) => evaluateCondition({ op: "rumor", rumor: rumorId }, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
const herbalistEdge = (state) => state.relations?.[`npc_herbalist:${state.player.actorId}`];
const springOpen = (state) => {
  const link = worldData.locations.loc_village.links.find((l) => l.to === "loc_forest_spring");
  return evaluateCondition(link.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};

// 1. the shape: valid, and the new checks read the stats nothing read before
function testShape() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.version, "0.3.0", "no version bump");
  assert.strictEqual(worldData.actions.act_inspect_well.check.stat, "per");
  assert.strictEqual(worldData.actions.act_search_spring.check.stat, "per");
  assert.strictEqual(worldData.events.evt_spring_miasma.check.stat, "con");
  assert.strictEqual(worldData.npcs.npc_herbalist.actor, undefined, "a dialogue NPC, not an actor");
  for (const id of ["fact_well_source", "fact_spring_cause"]) assert.strictEqual(worldData.facts[id].initial, undefined, id);
}

// 2. the well: a success records the source and the character sees it; a failure only practises
function testWell() {
  const s = start();
  assert.strictEqual(springOpen(s), false, "the way is unknown");
  assert.strictEqual(rejected(s, M("loc_forest_spring")), "requirements_not_met");
  const ok = step(s, P("act_inspect_well"), worldData);
  assert.strictEqual(tierOf(ok), "success");
  assert.deepStrictEqual(checks(ok)[0].modifiers.find((m) => m.source === "stat:per"), { source: "stat:per", value: -1 });
  assert.strictEqual(ok.state.facts.fact_well_source.value, "forest_spring");
  assert.ok(knows(ok.state, "rum_well_source"));
  assert.deepStrictEqual(ok.state.knowledge.player_1.rum_well_source.sources, ["obs_village_well"]);
  assert.strictEqual(me(ok.state).growth.growth_wanderer.proficiency.investigation, 10);
  assert.ok(texts(ok).includes("txt_inspect_well_success"));
  assert.strictEqual(springOpen(ok.state), true);
  assert.strictEqual(ok.state.time.minute, 20);

  const missed = step(start("well-0"), P("act_inspect_well"), worldData);
  assert.strictEqual(tierOf(missed), "fail");
  assert.strictEqual(missed.state.facts?.fact_well_source, undefined);
  assert.strictEqual(knows(missed.state, "rum_well_source"), false);
  assert.strictEqual(me(missed.state).growth.growth_wanderer.proficiency.investigation, 5);
  assert.strictEqual(springOpen(missed.state), false);
}

// 3. the herbalist: at the market; she tells the source; +5 and her tag once; small talk is only talk
function testHerbalist() {
  const s = start("well-0");
  assert.strictEqual(rejected(s, P("act_talk_herbalist")), "requirements_not_met", "she keeps a stall at the market");
  const { state, log } = run(s, [M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_small_talk")]);
  assert.strictEqual(herbalistEdge(state), undefined, "small talk earns nothing");
  assert.deepStrictEqual(texts(log[2]), ["txt_herbalist_small_talk"]);
  const asked = run(state, [P("act_talk_herbalist"), C("opt_herbalist_ask_sickness")]).state;
  assert.strictEqual(herbalistEdge(asked).score, 5);
  assert.deepStrictEqual(herbalistEdge(asked).tags, ["consulted"]);
  assert.deepStrictEqual(asked.knowledge.player_1.rum_well_source.sources, ["npc_herbalist"]);
  assert.strictEqual(asked.facts?.fact_well_source, undefined, "told, not seen: the world's fact is not set");
  const again = run(asked, [P("act_talk_herbalist"), C("opt_herbalist_ask_sickness")]).state;
  assert.strictEqual(herbalistEdge(again).score, 5, "asking again earns nothing");
  assert.strictEqual(springOpen(asked), true, "hearing it is enough to find the way");
}

// 4. the spring: the miasma (CON) on arrival and every 30 minutes; the search (PER) finds the cause
function testSpring() {
  const { state, log } = run(start(), CANONICAL);
  const arrival = log[5];
  assert.strictEqual(arrival.state.actors.player_1.locationId, "loc_forest_spring");
  assert.deepStrictEqual(checks(arrival).map((c) => [c.tier, c.modifiers]), [["fail", [{ source: "stat:con", value: -1 }]]]);
  assert.ok(arrival.events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_spring_miasma"));
  assert.ok(texts(arrival).includes("txt_spring_miasma"));
  assert.strictEqual(arrival.state.actors.player_1.hp.current, 8, "not resisted: 2 HP");

  const search = log[6];
  assert.deepStrictEqual(checks(search).map((c) => c.tier), ["success", "success"], "the search, then the miasma (40 minutes later)");
  assert.ok(texts(search).includes("txt_search_spring_success") && texts(search).includes("txt_spring_miasma_resisted"));
  assert.strictEqual(state.actors.player_1.hp.current, 8, "resisted: nothing");
  assert.strictEqual(state.facts.fact_spring_cause.value, "rotting_carcass");
  assert.deepStrictEqual(state.knowledge.player_1.rum_spring_cause.sources, ["obs_loc_forest_spring"]);
  assert.strictEqual(state.actors.player_1.growth.growth_wanderer.proficiency.investigation, 30, "10 + 20");

  // within 30 minutes nothing fires again; the cooldown, not the place, decides
  const waited = step(state, { type: "wait", minutes: 10 }, worldData);
  assert.deepStrictEqual(checks(waited), []);
  // a failed search only practises
  const failed = run(start("well-6"), CANONICAL).log[6];
  assert.strictEqual(tierOf(failed), "fail");
  assert.strictEqual(failed.state.facts?.fact_spring_cause, undefined);
  assert.ok(texts(failed).includes("txt_search_spring_fail"));
  // once the case is resolved the miasma is gone (the event reads the world's case)
  const cleared = structuredClone(log[4].state);
  cleared.cases = { case_fouled_well: { stage: "resolved", since: 0 } };
  const calm = step(cleared, M("loc_forest_spring"), worldData);
  assert.deepStrictEqual(checks(calm), []);
  assert.strictEqual(calm.state.actors.player_1.hp.current, 10);
  // the search needs the knowledge, not only the place
  const lost = structuredClone(state);
  delete lost.knowledge.player_1.rum_well_source;
  assert.strictEqual(rejected(lost, P("act_search_spring")), "requirements_not_met");
}

// 5. the boundaries: the facts are the world's, the knowledge and the herbalist's trust the character's
function testSuccessor() {
  const { state } = run(start(), CANONICAL);
  // the ruins' hazard ends the first character (the lantern, then waiting under the falling stones)
  const toRuins = [M("loc_village"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins")];
  let died = run(state, toRuins).state;
  for (let i = 0; i < 5 && died.pending?.kind !== "newCharacter"; i += 1) died = run(died, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(died.pending, { kind: "newCharacter" });
  const next = run(died, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(next.player.actorId, "player_2");
  assert.strictEqual(knows(next, "rum_well_source"), false, "knowledge is not inherited");
  assert.strictEqual(springOpen(next), false);
  assert.strictEqual(herbalistEdge(next), undefined, "her trust was in the first character");
  assert.strictEqual(next.facts.fact_well_source.value, "forest_spring", "the world's fact stays");
  assert.strictEqual(next.facts.fact_spring_cause.value, "rotting_carcass");
}

// 6. save compatibility and determinism: the content writes nothing at creation; a save round-trips
function testSaveAndDeterminism() {
  const old = structuredClone(worldData);
  for (const id of ["act_inspect_well", "act_talk_herbalist", "act_search_spring"]) delete old.actions[id];
  delete old.choices.choice_herbalist_dialogue;
  delete old.events.evt_spring_miasma;
  delete old.locations.loc_forest_spring;
  old.locations.loc_village.links = old.locations.loc_village.links.filter((l) => l.to !== "loc_forest_spring");
  for (const id of ["fact_well_source", "fact_spring_cause"]) delete old.facts[id];
  for (const id of ["rum_well_source", "rum_spring_cause"]) delete old.rumors[id];
  delete old.npcs.npc_herbalist;
  assert.deepStrictEqual(validateData(old), []);
  for (const templateId of ["start_wanderer", "start_scout"]) {
    const before = createInitialState({ worldSeed: SEED, data: old, templateId }).state;
    assert.deepStrictEqual(createInitialState({ worldSeed: SEED, data: worldData, templateId }).state, before, `${templateId}: same start`);
    assert.deepStrictEqual(checkDataCompatibility(before, worldData), [], "a 0.3.0 save is compatible");
    run(before, CANONICAL); // and plays the new content
  }
  const mid = run(start(), CANONICAL.slice(0, 6)).state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_well", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  const end = run(start(), CANONICAL).state;
  assert.deepStrictEqual(run(loaded, CANONICAL.slice(6)).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(start(), CANONICAL).state, end, "the same input, the same result");
  assert.deepStrictEqual(validateState(end), []);
}

testShape();
testWell();
testHerbalist();
testSpring();
testSuccessor();
testSaveAndDeterminism();

console.log("V2-Core-64 data-world-fouled-well.test.js: all checks passed");
