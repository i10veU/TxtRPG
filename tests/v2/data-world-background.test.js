// V2-Core-53 (Issue #139, Trait / Talent / Mastery Decision, D-82): a starting background gives a
// trait, and the trait changes a rule -- in data, with the existing trait system and Conditions.
//   - background `start_scout`: the same stats, 3 money (the wanderer 8), `night_vision`
//   - Night Vision: the ruins' lantern requirement (the link from the village and the
//     investigation) becomes "a lantern or night vision"; no bonus (the lantern's +1 stays the
//     lantern's)
//   - chosen where a background is chosen today: the successor's template list (the first
//     character is still `world.startTemplateId`, D-47)
//   - Mastery: tier labels over the skill rank (`masteryTiers`), display only -- no state, no modifier
// No Talent. No engine change, no version bump.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, view } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });
const SYSTEM = worldData.growthSystems.growth_wanderer;
const DIE_WITH_LANTERN = [MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), ...Array.from({ length: 4 }, () => ({ type: "wait", minutes: 30 }))];
const RUMOR = [P("act_talk_elder"), CHOOSE("opt_ask_ruins")];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
const start = (seed = "background-1") => createInitialState({ worldSeed: seed, data: worldData }).state;
function successor(templateId, seed) {
  const dead = run(start(seed), DIE_WITH_LANTERN).state;
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  return run(dead, [{ type: "startCharacter", templateId }]).state;
}
const me = (state) => state.actors[state.player.actorId];

// 1. the background and the trait, in data
function testData() {
  assert.deepStrictEqual(SYSTEM.traits[0], { id: "night_vision" }); // V2-Core-57 adds the investigation talent after it
  const scout = worldData.characterTemplates.start_scout;
  const wanderer = worldData.characterTemplates.start_wanderer;
  assert.deepStrictEqual(scout.growth.growth_wanderer.traits, { night_vision: true, investigation_talent: true });
  assert.deepStrictEqual(scout.growth.growth_wanderer.stats, wanderer.growth.growth_wanderer.stats, "the same stats");
  assert.deepStrictEqual([scout.money, wanderer.money], [3, 8]);
  assert.strictEqual(wanderer.growth.growth_wanderer.traits, undefined, "the wanderer has no trait");
  assert.strictEqual(worldData.world.startTemplateId, "start_wanderer", "the first character is still the wanderer (D-47)");
}

// 2. a successor chooses the scout: the trait comes with the background
function testScoutSuccessor() {
  const s = successor("start_scout");
  assert.strictEqual(s.player.actorId, "player_2");
  assert.deepStrictEqual(me(s).growth.growth_wanderer.traits, { night_vision: true, investigation_talent: true });
  assert.strictEqual(me(s).money, 6, "3 + the succession's 3");
  assert.strictEqual(me(s).inventory.item_lantern, undefined);
  assert.deepStrictEqual(view(s, worldData).actor.growth.growth_wanderer.traits, { night_vision: true, investigation_talent: true });
  const w = successor("start_wanderer");
  assert.strictEqual(me(w).growth.growth_wanderer.traits, undefined);
}

// 3. night vision: into the ruins and searching them without a lantern -- and without its bonus
function testNightVision() {
  const scout = run(successor("start_scout"), RUMOR).state;
  const toRuins = step(scout, MOVE("loc_ruins"), worldData);
  assert.strictEqual(rejectedCode(toRuins), undefined, "the dark way is open to night vision");
  const search = step(toRuins.state, P("act_investigate_ruins"), worldData);
  assert.strictEqual(rejectedCode(search), undefined, "and so is the search");
  const check = search.events.find((e) => e.type === "check.resolved").data;
  assert.ok(!check.modifiers.some((m) => m.source === "item:item_lantern"), "no lantern, no lantern bonus");
  assert.ok(!check.modifiers.some((m) => m.source.startsWith("trait:")), "night vision is a rule, not a bonus");

  // the wanderer without a lantern: both still refused, as before
  const wanderer = run(successor("start_wanderer"), RUMOR).state;
  assert.strictEqual(me(wanderer).inventory.item_lantern, undefined);
  assert.strictEqual(rejectedCode(step(wanderer, MOVE("loc_ruins"), worldData)), "requirements_not_met");
  const placed = structuredClone(wanderer);
  me(placed).locationId = "loc_ruins";
  assert.strictEqual(rejectedCode(step(placed, P("act_investigate_ruins"), worldData)), "requirements_not_met");
  // ...and with one, as before (the lantern's +1 in the check)
  const lit = run(wanderer, [MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins")]);
  assert.ok(!lit.log.some((r) => rejectedCode(r) !== undefined));
  const litCheck = step(lit.state, P("act_investigate_ruins"), worldData).events.find((e) => e.type === "check.resolved").data;
  assert.ok(litCheck.modifiers.some((m) => m.source === "item:item_lantern" && m.value === 1));
}

// 4. the mastery tiers: display labels over the skill rank, from 0 up, covering every rank
function testMasteryTiers() {
  assert.deepStrictEqual(SYSTEM.masteryTiers, [
    { minRank: 0, label: "Untrained" },
    { minRank: 1, label: "Novice" },
    { minRank: 3, label: "Apprentice" },
    { minRank: 5, label: "Adept" }
  ]);
  const maxRank = Math.max(...SYSTEM.skills.map((s) => s.maxRank));
  assert.strictEqual(SYSTEM.masteryTiers[0].minRank, 0);
  assert.ok(SYSTEM.masteryTiers.every((t, i, all) => i === 0 || t.minRank > all[i - 1].minRank), "ascending");
  assert.ok(SYSTEM.masteryTiers.at(-1).minRank <= maxRank, "the top tier is reachable");
  // display only: nothing in the engine reads it -- the same play without it
  const without = structuredClone(worldData);
  delete without.growthSystems.growth_wanderer.masteryTiers;
  const actions = [P("act_observe_village"), P("act_observe_village"), ...RUMOR];
  const a = run(start(), actions).log.map((r) => r.events);
  const b = (() => {
    let s = createInitialState({ worldSeed: "background-1", data: without }).state;
    return actions.map((action) => {
      const r = step(s, action, without);
      s = r.state;
      return r.events;
    });
  })();
  assert.deepStrictEqual(a, b);
}

assert.deepStrictEqual(validateData(worldData), []);
testData();
testScoutSuccessor();
testNightVision();
testMasteryTiers();

console.log("V2-Core-53 data-world-background.test.js: all checks passed");
