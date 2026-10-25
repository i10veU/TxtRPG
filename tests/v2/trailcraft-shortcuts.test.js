// Personal exploration mastery unlocks faster paths, but never unknown destinations.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';
const P = (actionId) => ({ type: 'perform', actionId });
const A = (s) => s.actors[s.player.actorId];
const G = (s) => A(s).growth.growth_wanderer;
const can = (s, id) => view(s, worldData).actions.some((a) => a.actionId === id && a.available);
const reject = (r) => r.events.some((e) => e.type === 'action.rejected');
const save = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('trail', s, { savedAt: 1 }))));
const base = createInitialState({ worldSeed: 'trailcraft-465', data: worldData }).state;
A(base).locationId = 'loc_crossroads';
G(base).skills = { investigation: 1 };
G(base).proficiency = { investigation: 20 };
assert.equal(can(base, 'act_survey_trailcraft'), true);
assert.equal(can(base, 'act_trailcraft_ford_north'), false);
const novice = structuredClone(base); G(novice).skills.investigation = 0;
assert.equal(can(novice, 'act_survey_trailcraft'), false);
let learned, missed;
for (let n = 1; n <= 400 && (!learned || !missed); n++) {
  const s = structuredClone(base); s.rng.seed = n;
  const r = step(s, P('act_survey_trailcraft'), worldData);
  assert.equal(reject(r), false);
  assert.equal(r.state.time.minute - s.time.minute, 90);
  assert.equal(G(r.state).resources.stamina.current, 4);
  const tier = r.events.find((e) => e.type === 'check.resolved')?.data.tier;
  if (tier === 'success' || tier === 'great') learned = r.state;
  else missed = r.state;
}
assert.ok(learned && missed);
assert.equal(G(learned).unlocks.unl_trailcraft, true);
assert.equal(can(learned, 'act_survey_trailcraft'), false);
assert.equal(can(learned, 'act_trailcraft_ford_north'), false, 'unknown road stays hidden');
assert.equal(can(missed, 'act_survey_trailcraft'), true);
assert.equal(learned.flags?.unl_trailcraft, undefined);
assert.deepEqual(save(learned), learned);
let mapped;
for (let n = 1; n <= 400 && !mapped; n++) {
  const s = structuredClone(learned); s.rng.seed = n;
  const r = step(s, P('act_read_milestone'), worldData);
  if (r.state.knowledge?.[r.state.player.actorId]?.rum_road_ford && r.state.knowledge?.[r.state.player.actorId]?.rum_road_hamlet) mapped = r.state;
}
assert.ok(mapped, 'actual milestone discovery required');
for (const [id, from, to, minutes] of [
  ['act_trailcraft_ford_north', 'loc_crossroads', 'loc_river_ford', 30],
  ['act_trailcraft_ford_south', 'loc_river_ford', 'loc_crossroads', 30],
  ['act_trailcraft_hamlet_east', 'loc_crossroads', 'loc_mill_hamlet', 25],
  ['act_trailcraft_hamlet_west', 'loc_mill_hamlet', 'loc_crossroads', 25]
]) {
  const s = structuredClone(mapped); A(s).locationId = from;
  assert.equal(can(s, id), true, id);
  const r = step(s, P(id), worldData);
  assert.equal(reject(r), false);
  assert.equal(A(r.state).locationId, to);
  assert.equal(r.state.time.minute - s.time.minute, minutes);
  assert.equal(G(r.state).resources.stamina.current, G(s).resources.stamina.current - 1);
  assert.deepEqual(r.state.rng, s.rng);
  assert.deepEqual(step(s, P(id), worldData).state, r.state);
  assert.deepEqual(save(r.state), r.state);
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  const untrained = structuredClone(s); delete G(untrained).unlocks.unl_trailcraft;
  assert.equal(can(untrained, id), false);
  assert.equal(reject(step(untrained, P(id), worldData)), true);
  const tired = structuredClone(s); G(tired).resources.stamina.current = 0;
  assert.equal(can(tired, id), false);
}
const dying = structuredClone(mapped); A(dying).alive = false; dying.pending = { kind: 'newCharacter' };
const heir = step(dying, { type: 'startCharacter', templateId: 'start_wanderer' }, worldData).state;
A(heir).locationId = 'loc_crossroads';
assert.equal(can(heir, 'act_trailcraft_ford_north'), false);
console.log('Trailcraft: personal survey, discovered routes, four shortcuts, Save, succession, RNG: PASS');
