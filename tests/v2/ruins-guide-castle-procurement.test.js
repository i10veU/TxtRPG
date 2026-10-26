import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const hero = state => state.actors[state.player.actorId];
const run = (state, action) => {
  const result = step(state, action, worldData);
  assert.equal(result.events.some(event => event.type === 'action.rejected'), false, JSON.stringify(result.events));
  assert.deepEqual(validateState(result.state), []);
  assert.deepEqual(checkDataCompatibility(result.state, worldData), []);
  return result.state;
};
const saved = state => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('castle-procurement', state, { savedAt: 1 }))));
const initial = createInitialState({ worldSeed: 'castle-procurement-490', data: worldData }).state;
initial.flags = { ...initial.flags, north_road_guided: true, ruins_guide_supply_charter: true,
  ruins_guide_depot_priority: false };
initial.signals = { ...initial.signals, north_trade_stage: 2, north_trade_stock: 0,
  north_waystation_stock: 3, north_mill_relief_stock: 0, road_trouble: 0,
  ruins_guide_caravan_treasury: 4, north_castle_grain_stock: 0 };
hero(initial).locationId = 'loc_mill_hamlet';
hero(initial).money = 12;

// First return switches the chartered merchant from free restocking to
// explicit bounded castle market supply. Legacy unchartered saves are unchanged.
const returned = run(initial, { type: 'wait', minutes: 1 });
assert.equal(returned.signals.north_trade_stage, 0);
assert.equal(returned.flags.ruins_guide_procurement_active, true);
assert.equal(returned.signals.north_castle_grain_stock, 2);
assert.equal(returned.signals.north_trade_stock, 0, 'return must not conjure merchant cargo');
const departed = run(returned, { type: 'wait', minutes: 1440 });
assert.equal(departed.signals.north_trade_stage, 1);
assert.equal(departed.signals.north_trade_stock, 2, 'mill demand buys two real bundles');
assert.equal(departed.signals.north_castle_grain_stock, 0);
assert.equal(departed.signals.ruins_guide_caravan_treasury, 0, 'two bundles cost four silver');
assert.deepEqual(run(returned, { type: 'wait', minutes: 1440 }), departed);
assert.deepEqual(saved(departed), departed);
assert.equal(departed.rng.cursor, returned.rng.cursor);
assert.equal(JSON.stringify(view(departed, worldData)).includes('npc_ruins_raider'), false);

// Lower demand buys one bundle and leaves capital available for later wages.
const lowDemand = structuredClone(returned);
lowDemand.signals.north_mill_relief_stock = 2;
lowDemand.signals.north_waystation_stock = 3;
const one = run(lowDemand, { type: 'wait', minutes: 1440 });
assert.equal(one.signals.north_trade_stock, 1);
assert.equal(one.signals.north_castle_grain_stock, 1);
assert.equal(one.signals.ruins_guide_caravan_treasury, 2);

// Insolvent merchants cannot obtain free cargo. The player can inject capital
// from the mill; the payment enters the same finite treasury.
const insolvent = structuredClone(returned);
insolvent.signals.ruins_guide_caravan_treasury = 0;
const dry = run(insolvent, { type: 'wait', minutes: 1440 });
assert.equal(dry.signals.north_trade_stock, 0);
assert.equal(dry.signals.north_castle_grain_stock, 2);
assert.equal(dry.signals.ruins_guide_caravan_treasury, 0);
const actionId = 'act_ruins_guide_fund_procurement';
assert.equal(view(insolvent, worldData).actions.some(a => a.actionId === actionId && a.available), true);
const funded = run(insolvent, { type: 'perform', actionId });
assert.equal(hero(funded).money, 8);
assert.equal(funded.signals.ruins_guide_caravan_treasury, 4);
assert.deepEqual(saved(funded), funded);

// Legacy (unchartered) caravan still uses its old replenishment route.
const legacy = structuredClone(initial);
legacy.flags.ruins_guide_supply_charter = false;
const legacyReturn = run(legacy, { type: 'wait', minutes: 1 });
assert.equal(legacyReturn.signals.north_trade_stock, 2);
assert.equal(legacyReturn.flags.ruins_guide_procurement_active ?? false, false);
console.log('Castle procurement: real market stock, demand, capital, funding, legacy, Save, RNG PASS');
