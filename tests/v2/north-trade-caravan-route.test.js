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

// The caravan is also an encounter: its driver can teach a route that belongs
// to this character, not to world signals or a future successor.
const safeRideSeed = structuredClone(first);
safeRideSeed.signals.road_trouble = 1;
assert.equal(can(safeRideSeed, 'act_ask_north_caravan_route'), true);
assert.equal(can(safeRideSeed, 'act_ride_north_caravan'), false, 'unknown destination stays hidden');
const taught = run(safeRideSeed, act('act_ask_north_caravan_route'));
assert.equal(can(taught, 'act_ask_north_caravan_route'), false);
assert.equal(can(taught, 'act_ride_north_caravan'), true);
assert.equal(taught.knowledge[taught.player.actorId].rum_road_hamlet.source, 'npc_north_caravan_driver');
const ridden = run(taught, act('act_ride_north_caravan'));
assert.equal(actor(ridden).locationId, 'loc_mill_hamlet');
assert.equal(actor(ridden).money, actor(taught).money - 2);
assert.equal(sig(ridden, 'north_trade_stage'), 2);
assert.equal(ridden.time.minute - taught.time.minute, 90);
assert.deepEqual(ridden.rng, taught.rng);
assert.deepEqual(save(ridden), ridden);

// A trained investigator may instead lead a stalled caravan through danger.
// Success moves both the player and the same finite cargo; failure moves neither.
const scoutSeed = structuredClone(taught);
scoutSeed.signals.road_trouble = 2;
const skill = actor(scoutSeed).growth.growth_wanderer;
skill.skills = { ...skill.skills, investigation: 1 };
skill.unlocks = { ...skill.unlocks, unl_trailcraft: true };
assert.equal(can(scoutSeed, 'act_ride_north_caravan'), false);
assert.equal(can(scoutSeed, 'act_scout_north_caravan'), true);
const noTraining = structuredClone(scoutSeed);
delete actor(noTraining).growth.growth_wanderer.unlocks.unl_trailcraft;
assert.equal(can(noTraining, 'act_scout_north_caravan'), false);
let scoutingSuccess, scoutingFailure;
for (let seed = 1; seed < 300 && (!scoutingSuccess || !scoutingFailure); seed++) {
  const before = structuredClone(scoutSeed);
  before.rng.seed = seed;
  const result = step(before, act('act_scout_north_caravan'), worldData);
  assert.equal(result.events.some(e => e.type === 'action.rejected'), false);
  const tier = result.events.find(e => e.type === 'check.resolved')?.data.tier;
  if (['great', 'success'].includes(tier)) scoutingSuccess ??= { before, after: result.state };
  if (['partial', 'fail'].includes(tier)) scoutingFailure ??= { before, after: result.state };
}
assert.ok(scoutingSuccess && scoutingFailure);
assert.equal(actor(scoutingSuccess.after).locationId, 'loc_mill_hamlet');
assert.equal(sig(scoutingSuccess.after, 'north_trade_stage'), 2);
assert.equal(sig(scoutingSuccess.after, 'road_trouble'), 1);
assert.equal(actor(scoutingSuccess.after).growth.growth_wanderer.unlocks.unl_caravan_pathfinder, true);
assert.equal(sig(scoutingFailure.after, 'north_trade_stage'), 1);
assert.equal(sig(scoutingFailure.after, 'north_trade_stock'), 2);
assert.equal(actor(scoutingFailure.after).locationId, 'loc_far_bank');
assert.deepEqual(save(scoutingSuccess.after), scoutingSuccess.after);
assert.deepEqual(save(scoutingFailure.after), scoutingFailure.after);
assert.deepEqual(run(scoutingSuccess.before, act('act_scout_north_caravan')), scoutingSuccess.after);
const discountedRide = structuredClone(scoutingSuccess.after);
actor(discountedRide).locationId = 'loc_far_bank';
discountedRide.signals.north_trade_stage = 1;
actor(discountedRide).money = 1;
const discounted = run(discountedRide, act('act_ride_north_caravan'));
assert.equal(actor(discounted).money, 0, 'earned personal pathfinder credential halves future fares');
const heirScout = structuredClone(scoutingSuccess.after);
actor(heirScout).alive = false;
heirScout.pending = { kind: 'newCharacter' };
const newHeir = run(heirScout, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(actor(newHeir).growth.growth_wanderer.unlocks?.unl_caravan_pathfinder, undefined);
assert.equal(sig(newHeir, 'north_trade_stock'), sig(scoutingSuccess.after, 'north_trade_stock'));

console.log('North merchant caravan: staged travel, road danger, trade, relief, RNG, Save, successor PASS');
