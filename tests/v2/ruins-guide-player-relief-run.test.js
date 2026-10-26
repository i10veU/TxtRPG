import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const hero = s => s.actors[s.player.actorId];
const perform = (s, actionId) => {
  const r = step(s, { type: 'perform', actionId }, worldData);
  assert.equal(r.events.some(e => e.type === 'action.rejected'), false, JSON.stringify(r.events));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
};
const available = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('relief-run', s, { savedAt: 1 }))));
const initial = createInitialState({ worldSeed: 'player-relief-run-491', data: worldData }).state;
initial.flags = { ...initial.flags, north_road_guided: true, ruins_guide_supply_charter: true, ruins_guide_procurement_active: true };
initial.signals = { ...initial.signals, north_castle_grain_stock: 2, north_trade_stage: 0,
  north_trade_stock: 0, ruins_guide_caravan_treasury: 0, north_waystation_stock: 0,
  north_mill_relief_stock: 0, ruins_guide_player_relief_deliveries: 0 };
hero(initial).locationId = 'loc_castle_town';
hero(initial).money = 10;
const buy = 'act_ruins_guide_buy_personal_grain';
const mill = 'act_ruins_guide_deliver_personal_mill';
const depot = 'act_ruins_guide_deliver_personal_depot';
assert.equal(available(initial, buy), true, 'castle market offers finite hand-carried grain');
const purchased = perform(initial, buy);
assert.equal(hero(purchased).money, 8);
assert.equal(purchased.signals.north_castle_grain_stock, 1);
assert.equal(hero(purchased).inventory.item_castle_grain_crate, 1);
assert.equal(available(purchased, buy), false, 'one crate at a time');
assert.deepEqual(save(purchased), purchased, 'the physical crate survives a Save round trip');
assert.deepEqual(perform(initial, buy), purchased, 'same seed and action deterministic');
assert.equal(purchased.rng.cursor, initial.rng.cursor);
// The crate must also survive a REAL map traversal, not just test-seeded
// locations; the 12-hour road can advance autonomous caravan schedules.
const road = step(purchased, { type: 'move', to: 'loc_far_bank' }, worldData);
assert.equal(road.events.some(e => e.type === 'action.rejected'), false, JSON.stringify(road.events));
assert.equal(hero(road.state).locationId, 'loc_far_bank');
assert.equal(hero(road.state).inventory.item_castle_grain_crate, 1);
assert.deepEqual(save(road.state), road.state);

// A direct expedition can choose a destination. A merchant with no capital
// still cannot buy grain, but the player can carry a finite bundle.
const toMill = structuredClone(purchased);
hero(toMill).locationId = 'loc_mill_hamlet';
assert.equal(available(toMill, mill), true);
const deliveredMill = perform(toMill, mill);
assert.equal(hero(deliveredMill).inventory.item_castle_grain_crate ?? 0, 0);
assert.equal(deliveredMill.signals.north_mill_relief_stock, 1);
assert.equal(deliveredMill.signals.north_waystation_stock, toMill.signals.north_waystation_stock, 'mill delivery must not alter depot inventory');
assert.equal(deliveredMill.signals.ruins_guide_player_relief_deliveries, 1);
assert.equal(available(deliveredMill, mill), false, 'no repeated delivery of consumed grain');
assert.deepEqual(save(deliveredMill), deliveredMill);

const toDepot = structuredClone(purchased);
hero(toDepot).locationId = 'loc_far_bank';
assert.equal(available(toDepot, depot), true);
const deliveredDepot = perform(toDepot, depot);
assert.equal(hero(deliveredDepot).inventory.item_castle_grain_crate ?? 0, 0);
assert.equal(deliveredDepot.signals.north_waystation_stock, toDepot.signals.north_waystation_stock + 1, 'depot receives exactly one crate');
assert.equal(deliveredDepot.signals.north_mill_relief_stock, 0);
assert.equal(deliveredDepot.signals.ruins_guide_player_relief_deliveries, 1);
assert.equal(deliveredDepot.rng.cursor, purchased.rng.cursor);

const fullMill = structuredClone(toMill);
fullMill.signals.north_mill_relief_stock = 2;
assert.equal(available(fullMill, mill), false, 'full warehouse cannot receive cargo');
const fullDepot = structuredClone(toDepot);
fullDepot.signals.north_waystation_stock = 3;
assert.equal(available(fullDepot, depot), false, 'full depot cannot receive cargo');
const noGrain = structuredClone(initial);
noGrain.signals.north_castle_grain_stock = 0;
assert.equal(available(noGrain, buy), false, 'market cannot create grain');
const legacy = structuredClone(initial);
legacy.flags.ruins_guide_supply_charter = false;
assert.equal(available(legacy, buy), false, 'new career requires established supply charter');
assert.equal(JSON.stringify(view(deliveredMill, worldData)).includes('npc_ruins_raider'), false);
console.log('Player relief run: finite market, two destinations, save, RNG, projection PASS');
