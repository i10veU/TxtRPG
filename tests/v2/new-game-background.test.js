// V2-Core-54 (Issue #141, D-83): the first character chooses a background too.
// `createInitialState({ worldSeed, data, templateId })` -- the optional `templateId` names the
// background (a characterTemplate, the same name `startCharacter` uses); without it the world's
// `startTemplateId`, exactly as before. An unknown or non-string `templateId` throws. Only the
// first character's actor comes from the choice; the seed, RNG, provenance, NPCs and facts do not
// change. No new background, no save/schema change.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState, view } from "../../web/v2/core/engine.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const SEED = "new-game-background";
const create = (extra = {}) => createInitialState({ worldSeed: SEED, data: worldData, ...extra });

// 1. no choice is the world's start template, exactly as before
function testDefault() {
  const plain = create();
  assert.deepStrictEqual(create({ templateId: undefined }), plain);
  assert.deepStrictEqual(create({ templateId: worldData.world.startTemplateId }), plain);
  assert.deepStrictEqual(plain.events, []);
  assert.strictEqual(plain.state.actors.player_1.growth.growth_wanderer.traits, undefined);
}

// 2. the scout: the first character is a scout, with night vision; nothing else differs
function testScout() {
  const plain = create().state;
  const scout = create({ templateId: "start_scout" }).state;
  assert.deepStrictEqual(scout.actors.player_1.growth.growth_wanderer.traits, { night_vision: true, investigation_talent: true });
  assert.strictEqual(scout.actors.player_1.money, 3);
  assert.strictEqual(scout.actors.player_1.id, "player_1");
  assert.deepStrictEqual(scout.player, { actorId: "player_1", characterCount: 1 });
  const rest = (s) => {
    const copy = structuredClone(s);
    delete copy.actors.player_1;
    return copy;
  };
  assert.deepStrictEqual(rest(scout), rest(plain), "the seed, RNG, provenance, NPCs and facts are the same");
  assert.deepStrictEqual(validateState(scout), []);
  assert.deepStrictEqual(view(scout, worldData).actor.growth.growth_wanderer.traits, { night_vision: true, investigation_talent: true });
  assert.deepStrictEqual(create({ templateId: "start_scout" }), create({ templateId: "start_scout" }), "deterministic");

  // night vision from the first step: the dark ruins without a lantern
  const told = [{ type: "perform", actionId: "act_talk_elder" }, { type: "choose", optionId: "opt_ask_ruins" }, { type: "move", to: "loc_ruins" }]
    .reduce((s, a) => {
      const r = step(s, a, worldData);
      assert.ok(!r.events.some((e) => e.type === "action.rejected"), JSON.stringify(a));
      return r.state;
    }, scout);
  assert.strictEqual(told.actors.player_1.locationId, "loc_ruins");
}

// 3. a bad choice is the caller's error, not a world without a character
function testBadChoice() {
  assert.throws(() => create({ templateId: "start_knight" }), /templateId/);
  assert.throws(() => create({ templateId: 7 }), /templateId/);
  assert.throws(() => create({ templateId: null }), /templateId/);
}

// 4. save/load and compatibility: the choice is in the state, nothing else is needed
function testSave() {
  const scout = create({ templateId: "start_scout" }).state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_scout", scout, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, scout);
  assert.deepStrictEqual(checkDataCompatibility(loaded, worldData), []);
}

testDefault();
testScout();
testBadChoice();
testSave();

console.log("V2-Core-54 new-game-background.test.js: all checks passed");
