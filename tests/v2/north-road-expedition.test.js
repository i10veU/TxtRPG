// Expedition tactics: two travel speeds, two directions, and a persistent supply-route unlock.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';
import { actorResource } from '../../web/v2/core/rules.js';
const A = (s) => s.actors[s.player.actorId];
const can = (s, id) => view(s, worldData).actions.some((a) => a.actionId === id && a.available);
const stamina = (s) => actorResource(A(s), worldData, 'stamina').current;
function seed(at, delivered) {
  const s = createInitialState({ worldSeed: 'north-road-462', data: worldData }).state;
  A(s).locationId = at; A(s).money = 12; A(s).hp.current = 8;
  A(s).inventory.item_mill_bread = 2;
  if (delivered) { s.flags ??= {}; s.flags.waystation_supply_delivered = true; }
  return s;
}
function go(s, id) {
  const r = step(s, { type: 'perform', actionId: id }, worldData);
  assert.equal(r.events.some((e) => e.type === 'action.rejected'), false, id);
  assert.deepEqual(r.state.rng, s.rng);
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  assert.deepEqual(parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('north-road', r.state, { savedAt: 1 })))), r.state);
  return r.state;
}
for (const [from, to, suffix] of [
  ['loc_far_bank', 'loc_castle_town', 'north'],
  ['loc_castle_town', 'loc_far_bank', 'south']
]) {
  const convoyId = `act_${suffix}_road_convoy`;
  const marchId = `act_${suffix}_road_march`;
  const noStation = seed(from, false);
  assert.equal(can(noStation, convoyId), false);
  assert.equal(can(noStation, marchId), true);
  const march = go(noStation, marchId);
  assert.equal(A(march).locationId, to);
  assert.equal(march.time.minute - noStation.time.minute, 480);
  assert.equal(stamina(march), 2);
  assert.equal(A(march).hp.current, 6);
  const tired = structuredClone(noStation);
  A(tired).growth.growth_wanderer.resources.stamina.current = 3;
  assert.equal(can(tired, marchId), false);
  const hurt = structuredClone(noStation); A(hurt).hp.current = 2;
  assert.equal(can(hurt, marchId), false);
  const supplied = seed(from, true);
  A(supplied).growth.growth_wanderer.resources.stamina.current = 2;
  assert.equal(can(supplied, convoyId), true);
  const convoy = go(supplied, convoyId);
  assert.equal(A(convoy).locationId, to);
  assert.equal(convoy.time.minute - supplied.time.minute, 600);
  assert.equal(A(convoy).money, 9);
  assert.equal(A(convoy).inventory.item_mill_bread, 1);
  assert.equal(stamina(convoy), 5);
  assert.equal(A(convoy).hp.current, 8);
  assert.deepEqual(go(supplied, convoyId), convoy, 'identical seed and choice');
  const poor = structuredClone(supplied); A(poor).money = 2;
  assert.equal(can(poor, convoyId), false);
  const hungry = structuredClone(supplied); A(hungry).inventory.item_mill_bread = 0;
  assert.equal(can(hungry, convoyId), false);
}
console.log('North road expedition: convoy/march both directions, costs, Save, RNG: PASS');
