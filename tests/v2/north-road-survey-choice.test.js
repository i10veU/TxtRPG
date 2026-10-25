// A trailcraft specialist can turn a surveyed northern road into public
// infrastructure, or salvage its cache for immediate supplies instead.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const P = (actionId) => ({ type: 'perform', actionId });
const A = (s) => s.actors[s.player.actorId];
const G = (s) => A(s).growth.growth_wanderer;
const can = (s, id) => view(s, worldData).actions.some((a) => a.actionId === id && a.available);
const rejected = (r) => r.events.some((e) => e.type === 'action.rejected');
const reload = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('north-survey', s, { savedAt: 1 }))));
function perform(s, id) {
  const r = step(s, P(id), worldData);
  assert.equal(rejected(r), false, id);
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  assert.deepEqual(reload(r.state), r.state);
  return r.state;
}
function start() {
  const s = createInitialState({ worldSeed: 'north-road-survey-466', data: worldData }).state;
  A(s).locationId = 'loc_far_bank'; A(s).money = 12;
  A(s).inventory.item_mill_bread = 2;
  s.flags ??= {}; s.flags.waystation_supply_delivered = true;
  G(s).skills = { ...G(s).skills, investigation: 1 };
  G(s).unlocks = { ...G(s).unlocks, unl_trailcraft: true };
  return s;
}
const raw = start();
assert.equal(can(raw, 'act_survey_north_road'), true);
assert.equal(can(raw, 'act_mark_north_road_pass'), false);
assert.equal(can(raw, 'act_salvage_north_road_cache'), false);
const novice = structuredClone(raw); delete G(novice).unlocks.unl_trailcraft;
assert.equal(can(novice, 'act_survey_north_road'), false);
const unfunded = structuredClone(raw); delete unfunded.flags.waystation_supply_delivered;
assert.equal(can(unfunded, 'act_survey_north_road'), false);
let surveyed, failed;
for (let n = 1; n <= 400 && (!surveyed || !failed); n++) {
  const s = structuredClone(raw); s.rng.seed = n;
  const r = step(s, P('act_survey_north_road'), worldData);
  assert.equal(rejected(r), false);
  const tier = r.events.find((e) => e.type === 'check.resolved')?.data.tier;
  if (tier === 'great' || tier === 'success') surveyed = r.state;
  else failed = r.state;
}
assert.ok(surveyed && failed);
assert.equal(G(surveyed).unlocks.unl_north_road_survey, true);
assert.equal(can(surveyed, 'act_survey_north_road'), false);
assert.equal(can(failed, 'act_survey_north_road'), true);
assert.equal(can(surveyed, 'act_mark_north_road_pass'), true);
assert.equal(can(surveyed, 'act_salvage_north_road_cache'), true);
const tired = structuredClone(surveyed); G(tired).resources.stamina.current = 1;
assert.equal(can(tired, 'act_mark_north_road_pass'), false);
assert.equal(can(tired, 'act_salvage_north_road_cache'), false);

// The same knowledge yields two mutually exclusive world histories.
const guide = perform(surveyed, 'act_mark_north_road_pass');
assert.equal(guide.flags.north_road_guided, true);
assert.equal(guide.flags.north_road_cache_taken, undefined);
assert.equal(can(guide, 'act_mark_north_road_pass'), false);
assert.equal(can(guide, 'act_salvage_north_road_cache'), false);
assert.equal(can(guide, 'act_north_road_convoy'), false);
assert.equal(can(guide, 'act_north_road_guided_convoy'), true);
assert.equal(guide.time.minute - surveyed.time.minute, 90);
assert.deepEqual(guide.rng, surveyed.rng);
assert.deepEqual(perform(surveyed, 'act_mark_north_road_pass'), guide);
for (const [from, to, suffix] of [
  ['loc_far_bank', 'loc_castle_town', 'north'],
  ['loc_castle_town', 'loc_far_bank', 'south']
]) {
  const s = structuredClone(guide); A(s).locationId = from;
  const r = perform(s, `act_${suffix}_road_guided_convoy`);
  assert.equal(A(r).locationId, to);
  assert.equal(r.time.minute - s.time.minute, 540);
  assert.equal(A(r).money, A(s).money - 2);
  assert.equal(A(r).inventory.item_mill_bread, A(s).inventory.item_mill_bread - 1);
  assert.deepEqual(r.rng, s.rng);
}
const heirSeed = structuredClone(guide);
A(heirSeed).alive = false; heirSeed.pending = { kind: 'newCharacter' };
const heir = step(heirSeed, { type: 'startCharacter', templateId: 'start_wanderer' }, worldData).state;
A(heir).locationId = 'loc_far_bank'; A(heir).money = 5; A(heir).inventory.item_mill_bread = 1;
assert.equal(G(heir).unlocks?.unl_north_road_survey, undefined);
assert.equal(can(heir, 'act_north_road_guided_convoy'), true);

const loot = perform(surveyed, 'act_salvage_north_road_cache');
assert.equal(loot.flags.north_road_cache_taken, true);
assert.equal(loot.flags.north_road_guided, undefined);
assert.equal(loot.time.minute - surveyed.time.minute, 60);
assert.equal(A(loot).money, A(surveyed).money + 5);
assert.equal(A(loot).inventory.item_mill_bread, A(surveyed).inventory.item_mill_bread + 2);
assert.equal(can(loot, 'act_salvage_north_road_cache'), false);
assert.equal(can(loot, 'act_mark_north_road_pass'), false);
assert.equal(can(loot, 'act_north_road_convoy'), true);
assert.equal(can(loot, 'act_north_road_guided_convoy'), false);
assert.deepEqual(loot.rng, surveyed.rng);
assert.deepEqual(perform(surveyed, 'act_salvage_north_road_cache'), loot);
console.log('North road: scout -> permanent guided convoy OR one-time cache, save, succession, RNG: PASS');
