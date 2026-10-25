// Losses in public convoy logistics create a playable village shortage with two recovery routes.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const A = s => s.actors[s.player.actorId];
const signal = (s, key) => s.signals?.[key] ?? 0;
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const act = actionId => ({ type: 'perform', actionId });
const run = (s, action) => {
  const result = step(s, action, worldData);
  assert.equal(result.events.some(e => e.type === 'action.rejected'), false, JSON.stringify(action));
  assert.deepEqual(validateState(result.state), []);
  assert.deepEqual(checkDataCompatibility(result.state, worldData), []);
  return result.state;
};
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('north-relief-shortage', s, { savedAt: 1 }))));
const initial = createInitialState({ worldSeed: 'north-relief-shortage-471', data: worldData }).state;
A(initial).locationId = 'loc_mill_hamlet';
A(initial).money = 30;
A(initial).inventory.item_mill_bread = 6;
initial.flags ??= {};
initial.flags.north_road_guided = true;
initial.flags.waystation_supply_delivered = true;
initial.flags.north_supply_relief_pact = true;
initial.signals ??= {};
initial.signals.north_mill_relief_stock = 1;
// Prime the existing daily merchant and relief events before comparing routes.
const primed = run(initial, { type: 'wait', minutes: 1 });
primed.signals.north_mill_relief_stock = 1;

assert.equal(can(primed, 'act_buy_mill_relief_rations'), true);
assert.equal(can(primed, 'act_buy_mill_relief_rations_crisis'), false);
const normal = run(primed, act('act_buy_mill_relief_rations'));
assert.equal(A(normal).money, 29);
assert.equal(A(normal).inventory.item_mill_bread, 8);

const crisis = structuredClone(primed);
crisis.signals.north_relief_losses = 2;
assert.equal(can(crisis, 'act_buy_mill_relief_rations'), false, 'losses must close the ordinary price');
assert.equal(can(crisis, 'act_buy_mill_relief_rations_crisis'), true, 'village shortages change the purchase choice');
assert.equal(can(crisis, 'act_donate_north_relief_bread'), true, 'a character can replace lost food');
const expensive = run(crisis, act('act_buy_mill_relief_rations_crisis'));
assert.equal(A(expensive).money, 28);
assert.equal(A(expensive).inventory.item_mill_bread, 7, 'crisis rations are smaller');
assert.equal(signal(expensive, 'north_mill_relief_stock'), 0);
assert.deepEqual(expensive.rng, crisis.rng);

const donated = run(crisis, act('act_donate_north_relief_bread'));
assert.equal(A(donated).inventory.item_mill_bread, 3);
assert.equal(signal(donated, 'north_mill_relief_stock'), 2, 'donated bread replaces one warehouse bundle');
assert.equal(donated.flags.north_relief_shortage_recovered, true);
assert.equal(signal(donated, 'north_relief_losses'), 2, 'historic losses remain recorded');
assert.equal(can(donated, 'act_buy_mill_relief_rations'), true);
assert.equal(can(donated, 'act_buy_mill_relief_rations_crisis'), false);
assert.equal(can(donated, 'act_donate_north_relief_bread'), false, 'recovery is not farmable');
assert.deepEqual(run(crisis, act('act_donate_north_relief_bread')), donated);
assert.deepEqual(donated.rng, crisis.rng);
assert.deepEqual(save(donated), donated);

const town = structuredClone(crisis);
A(town).locationId = 'loc_castle_town';
assert.equal(can(town, 'act_fund_north_relief_caravan'), true);
const funded = run(town, act('act_fund_north_relief_caravan'));
assert.equal(A(funded).money, 24);
assert.equal(signal(funded, 'north_mill_relief_stock'), 2);
assert.equal(funded.flags.north_relief_shortage_recovered, true);
assert.equal(can(funded, 'act_fund_north_relief_caravan'), false);
assert.deepEqual(funded.rng, town.rng);
assert.deepEqual(save(funded), funded);

const heirSeed = structuredClone(donated);
A(heirSeed).alive = false;
heirSeed.pending = { kind: 'newCharacter' };
const heir = run(heirSeed, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(heir.flags.north_relief_shortage_recovered, true);
assert.equal(signal(heir, 'north_relief_losses'), 2);
A(heir).locationId = 'loc_mill_hamlet';
A(heir).money = 3;
assert.equal(can(heir, 'act_buy_mill_relief_rations'), true);

const privateWorld = structuredClone(crisis);
privateWorld.flags.north_supply_relief_pact = false;
privateWorld.flags.north_supply_private_sale = true;
assert.equal(can(privateWorld, 'act_donate_north_relief_bread'), false);
assert.equal(can(privateWorld, 'act_buy_mill_relief_rations_crisis'), false);
A(privateWorld).locationId = 'loc_castle_town';
assert.equal(can(privateWorld, 'act_fund_north_relief_caravan'), false);

const insufficient = structuredClone(crisis);
A(insufficient).inventory.item_mill_bread = 2;
assert.equal(can(insufficient, 'act_donate_north_relief_bread'), false);
A(insufficient).locationId = 'loc_castle_town';
A(insufficient).money = 5;
assert.equal(can(insufficient, 'act_fund_north_relief_caravan'), false);

console.log('North relief shortage: lost convoys change rations, two recoveries, Save, succession, RNG and private exclusion PASS');
