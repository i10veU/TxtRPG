// Moving northern trade caravan: finite cargo, player trade, dangerous-road escort and public relief.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const actor = s => s.actors[s.player.actorId];
const sig = (s, key) => s.signals?.[key] ?? 0;
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const act = actionId => ({ type: 'perform', actionId });
const run = (s, action) => {
  const r = step(s, action, worldData);
  assert.equal(r.events.some(e => e.type === 'action.rejected'), false, JSON.stringify(action));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
};
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('north-trade-caravan', s, { savedAt: 1 }))));
const initial = createInitialState({ worldSeed: 'north-trade-caravan-472', data: worldData }).state;
actor(initial).locationId = 'loc_far_bank';
actor(initial).money = 30;
actor(initial).inventory.item_mill_bread = 8;
initial.flags ??= {};
initial.flags.north_road_guided = true;
initial.flags.north_supply_relief_pact = true;
initial.signals ??= {};
initial.signals.road_trouble = 2;
initial.signals.north_relief_losses = 2;
initial.signals.north_mill_relief_stock = 0;
const first = run(initial, { type: 'wait', minutes: 1 });
assert.equal(sig(first, 'north_trade_stage'), 1, 'merchant caravan reaches far bank on first merchant dispatch');
assert.equal(sig(first, 'north_trade_stock'), 2, 'two finite merchant cargo bundles arrive');
assert.equal(can(first, 'act_sell_bread_to_north_caravan'), true);
assert.equal(can(first, 'act_escort_north_trade_caravan'), true, 'dangerous road strands merchant caravan');

const sold = run(first, act('act_sell_bread_to_north_caravan'));
assert.equal(actor(sold).money, 32);
assert.equal(actor(sold).inventory.item_mill_bread, 6);
assert.equal(sig(sold, 'north_trade_stock'), 3);
assert.equal(can(sold, 'act_sell_bread_to_north_caravan'), false, 'cargo cap prevents infinite trade');
assert.deepEqual(sold.rng, first.rng);
assert.deepEqual(save(sold), sold);

const stuck = run(first, { type: 'wait', minutes: 1440 });
assert.equal(sig(stuck, 'north_trade_stage'), 1, 'dangerous road blocks autonomous travel');
const rescued = run(first, act('act_escort_north_trade_caravan'));
assert.equal(sig(rescued, 'north_trade_stage'), 2);
assert.equal(sig(rescued, 'road_trouble'), 1, 'escort makes the road safer');
assert.equal(actor(rescued).money, 34);
assert.equal(sig(rescued, 'north_mill_relief_stock'), 1, 'merchant gives one cargo bundle to crisis warehouse');
assert.equal(sig(rescued, 'north_trade_stock'), 1, 'relief transfer consumes real merchant cargo');
assert.equal(can(rescued, 'act_escort_north_trade_caravan'), false);
assert.deepEqual(rescued.rng, first.rng);
assert.deepEqual(run(first, act('act_escort_north_trade_caravan')), rescued);
assert.deepEqual(save(rescued), rescued);

const atMill = structuredClone(rescued);
actor(atMill).locationId = 'loc_mill_hamlet';
assert.equal(can(atMill, 'act_buy_bread_from_north_caravan'), true);
const bought = run(atMill, act('act_buy_bread_from_north_caravan'));
assert.equal(actor(bought).money, 31);
assert.equal(actor(bought).inventory.item_mill_bread, 10);
assert.equal(sig(bought, 'north_trade_stock'), 0);
assert.equal(can(bought, 'act_buy_bread_from_north_caravan'), false);

const returned = run(bought, { type: 'wait', minutes: 1440 });
assert.equal(sig(returned, 'north_trade_stage'), 0, 'caravan returns to castle town');
assert.equal(sig(returned, 'north_trade_stock'), 2, 'castle replenishes stock to two');
assert.deepEqual(save(returned), returned);

const heirSeed = structuredClone(returned);
actor(heirSeed).alive = false;
heirSeed.pending = { kind: 'newCharacter' };
const heir = run(heirSeed, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(sig(heir, 'north_trade_stock'), 2);
assert.equal(sig(heir, 'north_trade_stage'), 0);

const noRoad = structuredClone(initial);
noRoad.flags.north_road_guided = false;
const noRoadTick = run(noRoad, { type: 'wait', minutes: 1 });
assert.equal(sig(noRoadTick, 'north_trade_stage'), 0);
assert.equal(can(noRoadTick, 'act_sell_bread_to_north_caravan'), false);

console.log('North merchant caravan: staged travel, road danger, trade, relief, RNG, Save, successor PASS');
