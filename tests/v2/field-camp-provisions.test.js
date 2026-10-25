import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { validateData } from '../../web/v2/core/rules.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';
const P = (actionId) => ({ type: 'perform', actionId });
function fixture(locationId = 'loc_far_bank', bread = 1) {
  const s = createInitialState({ worldSeed: 'field-camp-17', data: worldData }).state;
  const a = s.actors[s.player.actorId];
  a.locationId = locationId;
  a.inventory.item_mill_bread = bread;
  a.hp.current = 4;
  a.growth.growth_wanderer.resources.stamina.current = 0;
  assert.deepEqual(validateState(s), []);
  return s;
}
const actor = (s) => s.actors[s.player.actorId];
const energy = (s) => actor(s).growth.growth_wanderer.resources.stamina.current;
const offered = (s, id) => view(s, worldData).actions.some((a) => a.actionId === id && a.available);
const reload = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('field-camp', s, { savedAt: 1 }))));
assert.deepEqual(validateData(worldData), []);
for (const [id, minutes, hp, stamina, text] of [
  ['act_camp_quick', 120, 1, 3, 'txt_camp_quick'],
  ['act_camp_full', 480, 3, 6, 'txt_camp_full']
]) {
  const before = fixture();
  assert.equal(offered(before, id), true);
  const result = step(before, P(id), worldData);
  assert.ok(!result.events.some((e) => e.type === 'action.rejected'));
  const after = result.state;
  assert.equal(after.time.minute - before.time.minute, minutes);
  assert.equal(actor(after).hp.current - actor(before).hp.current, hp);
  assert.equal(energy(after) - energy(before), stamina);
  assert.equal(actor(after).inventory.item_mill_bread ?? 0, 0);
  assert.equal(actor(after).locationId, actor(before).locationId);
  assert.ok(result.events.some((e) => e.type === 'narration' && e.data.textId === text));
  assert.deepEqual(after.rng, before.rng);
  assert.deepEqual(step(fixture(), P(id), worldData).state, after);
  assert.deepEqual(reload(after), after);
  assert.deepEqual(validateState(after), []);
  assert.deepEqual(checkDataCompatibility(after, worldData), []);
  assert.equal(offered(after, id), false);
}
for (const loc of ['loc_village', 'loc_market', 'loc_ruins', 'loc_band_camp', 'loc_castle_town']) {
  for (const id of ['act_camp_quick', 'act_camp_full']) {
    const s = fixture(loc);
    assert.equal(offered(s, id), false);
    assert.deepEqual(step(s, P(id), worldData).state, s);
  }
}
for (const loc of ['loc_crossroads', 'loc_river_ford', 'loc_far_bank', 'loc_mill_hamlet', 'loc_royal_city']) {
  assert.equal(offered(fixture(loc), 'act_camp_quick'), true);
}
for (const id of ['act_camp_quick', 'act_camp_full']) {
  const s = fixture('loc_far_bank', 0);
  assert.equal(offered(s, id), false);
  assert.deepEqual(step(s, P(id), worldData).state, s);
}
console.log('Field camp: short/full, food, locations, Save, RNG: PASS');
