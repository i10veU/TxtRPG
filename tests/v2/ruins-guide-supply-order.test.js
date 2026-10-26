import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const act = actionId => ({ type: 'perform', actionId });
const hero = s => s.actors[s.player.actorId];
const available = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const run = (s, action) => {
  const result = step(s, action, worldData);
  assert.ok(!result.events.some(e => e.type === 'action.rejected'), JSON.stringify(result.events));
  assert.deepEqual(validateState(result.state), []);
  assert.deepEqual(checkDataCompatibility(result.state, worldData), []);
  return result.state;
};
const saved = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('mill-supply-order', s, { savedAt: 1 }))));
const initial = createInitialState({ worldSeed: 'mill-supply-order-487', data: worldData }).state;
initial.flags = { ...initial.flags, north_road_guided: true, north_supply_relief_pact: true,
  ruins_raider_cleared: true, ruins_raider_guide_recruited: true, ruins_guide_waymarks: true };
initial.signals = { ...initial.signals, north_trade_stage: 1, north_trade_stock: 2,
  north_mill_relief_stock: 0, north_relief_losses: 0, road_trouble: 2,
  ruins_guide_caravan_treasury: 0, ruins_guide_experience: 3 };
initial.actors.npc_ruins_raider.locationId = 'loc_river_ford';
hero(initial).locationId = 'loc_mill_hamlet';
hero(initial).money = 10;
hero(initial).inventory.item_mill_bread = 5;

assert.equal(available(initial, 'act_ruins_guide_mill_supply_order'), true,
  'an empty mill can commission a real merchant shipment');
const ordered = run(initial, act('act_ruins_guide_mill_supply_order'));
assert.equal(hero(ordered).money, 7);
assert.equal(ordered.signals.ruins_guide_caravan_treasury, 3);
assert.equal(ordered.flags.ruins_guide_mill_order_pending, true);
assert.equal(available(ordered, 'act_ruins_guide_mill_supply_order'), false, 'one order at a time');
assert.deepEqual(saved(ordered), ordered);

const boardedFrom = structuredClone(ordered);
hero(boardedFrom).locationId = 'loc_river_ford';
boardedFrom.signals.road_trouble = 1;
const boarded = run(boardedFrom, act('act_ruins_guide_board_convoy'));
const delivered = run(boarded, act('act_ruins_guide_veteran_crossing'));
assert.equal(delivered.signals.north_trade_stock, 1, 'the order consumes exactly one real cargo bundle');
assert.equal(delivered.signals.north_mill_relief_stock, 1);
assert.equal(delivered.flags.ruins_guide_mill_order_pending, false);
assert.equal(delivered.signals.ruins_guide_mill_orders_delivered, 1);
assert.equal(delivered.signals.ruins_guide_caravan_treasury, 3, 'the prepaid fee stays in merchant capital');
assert.equal(delivered.rng.cursor, boarded.rng.cursor);
assert.deepEqual(run(boarded, act('act_ruins_guide_veteran_crossing')), delivered);
assert.deepEqual(saved(delivered), delivered);
assert.equal(JSON.stringify(view(delivered, worldData)).includes('npc_ruins_raider'), false);

const blocked = structuredClone(ordered);
blocked.signals.road_trouble = 3;
const stuck = run(blocked, { type: 'wait', minutes: 1440 });
assert.equal(stuck.flags.ruins_guide_mill_order_pending, true, 'a blocked road does not teleport cargo');
assert.equal(stuck.signals.ruins_guide_mill_orders_delivered ?? 0, 0);

const autoReady = structuredClone(ordered);
autoReady.signals.road_trouble = 1;
const automatic = run(autoReady, { type: 'wait', minutes: 1440 });
assert.equal(automatic.flags.ruins_guide_mill_order_pending, false, 'real autonomous arrival fulfills the order');
assert.equal(automatic.signals.ruins_guide_mill_orders_delivered, 1);
assert.equal(automatic.signals.north_trade_stock, 1, 'only one merchant bundle is transferred');
assert.ok(automatic.signals.north_mill_relief_stock >= 1 && automatic.signals.north_mill_relief_stock <= 2);
assert.deepEqual(saved(automatic), automatic);

const full = structuredClone(ordered);
full.signals.north_mill_relief_stock = 2;
full.signals.road_trouble = 1;
const noSpace = run(full, { type: 'wait', minutes: 1440 });
assert.equal(noSpace.flags.ruins_guide_mill_order_pending, true, 'full storage defers delivery');
assert.equal(noSpace.signals.north_mill_relief_stock, 2);
assert.equal(noSpace.signals.ruins_guide_mill_orders_delivered ?? 0, 0);

const dedicated = structuredClone(boarded);
dedicated.signals.north_relief_losses = 2;
const dedicatedDelivered = run(dedicated, act('act_ruins_guide_relief_freight'));
assert.equal(dedicatedDelivered.signals.north_trade_stock, 1, 'dedicated relief still moves only one bundle');
assert.equal(dedicatedDelivered.signals.north_mill_relief_stock, 1);
assert.equal(dedicatedDelivered.flags.ruins_guide_mill_order_pending, false,
  'dedicated relief must also settle the paid order');
assert.equal(dedicatedDelivered.signals.ruins_guide_mill_orders_delivered, 1);

const emptyCargo = structuredClone(ordered);
emptyCargo.signals.north_trade_stock = 0;
emptyCargo.signals.road_trouble = 1;
const emptyArrival = run(emptyCargo, { type: 'wait', minutes: 1440 });
assert.equal(emptyArrival.flags.ruins_guide_mill_order_pending, true,
  'no actual cargo means the order cannot be fulfilled');
assert.equal(emptyArrival.signals.ruins_guide_mill_orders_delivered ?? 0, 0);

const veteran = structuredClone(boarded);
veteran.signals.ruins_guide_mill_orders_delivered = 3;
const capped = run(veteran, act('act_ruins_guide_veteran_crossing'));
assert.equal(capped.signals.ruins_guide_mill_orders_delivered, 3,
  'persistent completed-order counter is bounded');
assert.equal(available(delivered, 'act_ruins_guide_mill_supply_order'), false,
  'a stocked warehouse has no new demand');

assert.equal(available(ordered, 'act_ruins_guide_cancel_mill_order'), true);
const canceled = run(ordered, act('act_ruins_guide_cancel_mill_order'));
assert.equal(canceled.flags.ruins_guide_mill_order_pending, false);
assert.equal(hero(canceled).money, hero(ordered).money, 'booking fee is not minted back on cancellation');
assert.deepEqual(saved(canceled), canceled);
console.log('Mill supply order: demand, escrow, autonomous/manual delivery, blocked road, full storage, cancellation, Save, RNG, projection PASS');
