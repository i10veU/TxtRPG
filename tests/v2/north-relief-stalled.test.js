// A dangerous road interrupts NPC relief logistics; the player can rescue or divert a stranded wagon.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const actor = s => s.actors[s.player.actorId];
const signal = (s, id) => s.signals?.[id] ?? 0;
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const perform = actionId => ({ type: 'perform', actionId });
const run = (s, action) => {
  const r = step(s, action, worldData);
  assert.equal(r.events.some(e => e.type === 'action.rejected'), false, JSON.stringify(action));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
};
const initial = createInitialState({ worldSeed: 'north-relief-stalled-470', data: worldData }).state;
actor(initial).locationId = 'loc_far_bank';
actor(initial).money = 20;
initial.flags ??= {};
initial.flags.north_road_guided = true;
initial.flags.waystation_supply_delivered = true;
initial.flags.north_supply_relief_pact = true;
initial.signals ??= {};
initial.signals.road_trouble = 2;

const stalled = run(initial, { type: 'wait', minutes: 1 });
assert.equal(signal(stalled, 'north_relief_stalled'), 1, 'unsafe roads delay the NPC shipment');
assert.equal(signal(stalled, 'north_waystation_stock'), 1, 'one of two fresh bundles is held on the road');
assert.equal(signal(stalled, 'north_mill_relief_stock'), 0, 'no phantom arrival at destination');
assert.equal(can(stalled, 'act_escort_stalled_relief'), true);
assert.equal(can(stalled, 'act_seize_stalled_relief'), true);

const rescued = run(stalled, perform('act_escort_stalled_relief'));
assert.equal(signal(rescued, 'north_relief_stalled'), 0);
assert.equal(signal(rescued, 'north_mill_relief_stock'), 1);
assert.equal(signal(rescued, 'north_relief_losses'), 0);
assert.equal(can(rescued, 'act_seize_stalled_relief'), false);
assert.deepEqual(rescued.rng, stalled.rng);
assert.deepEqual(run(stalled, perform('act_escort_stalled_relief')), rescued);

const seized = run(stalled, perform('act_seize_stalled_relief'));
assert.equal(signal(seized, 'north_relief_stalled'), 0);
assert.equal(signal(seized, 'north_mill_relief_stock'), 0);
assert.equal(signal(seized, 'north_relief_losses'), 1);
assert.equal(actor(seized).inventory.item_mill_bread, (actor(stalled).inventory.item_mill_bread ?? 0) + 3);
assert.equal(can(seized, 'act_escort_stalled_relief'), false);
assert.deepEqual(seized.rng, stalled.rng);
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('north-relief-stalled', s, { savedAt: 1 }))));
assert.deepEqual(save(rescued), rescued);
assert.deepEqual(save(seized), seized);

const auto = structuredClone(stalled);
auto.signals.road_trouble = 1;
const cleared = run(auto, { type: 'wait', minutes: 1440 });
assert.equal(signal(cleared, 'north_relief_stalled'), 0, 'safer road allows NPC recovery');
assert.ok(signal(cleared, 'north_mill_relief_stock') >= 1, 'recovered supplies reach the village');
const privateWorld = structuredClone(initial);
privateWorld.flags.north_supply_relief_pact = false;
privateWorld.flags.north_supply_private_sale = true;
const privateDay = run(privateWorld, { type: 'wait', minutes: 1440 });
assert.equal(signal(privateDay, 'north_relief_stalled'), 0);
assert.equal(can(privateDay, 'act_escort_stalled_relief'), false);
const heirSeed = structuredClone(seized);
actor(heirSeed).alive = false;
heirSeed.pending = { kind: 'newCharacter' };
const heir = run(heirSeed, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(signal(heir, 'north_relief_losses'), 1, 'world remembers stolen supplies across generations');
console.log('North relief stalled: autonomous delay/recovery, rescue vs seizure, no duplication, Save, succession, RNG PASS');
