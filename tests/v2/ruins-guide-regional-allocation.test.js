import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const id = 'act_ruins_guide_waystation_provisions';
const hero = s => s.actors[s.player.actorId];
const available = s => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const run = (s, a) => {
  const r = step(s, a, worldData);
  assert.ok(!r.events.some(e => e.type === 'action.rejected'));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
};
const saved = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('regional', s, { savedAt: 1 }))));
const base = createInitialState({ worldSeed: 'regional-allocation-488', data: worldData }).state;
base.flags = { ...base.flags, north_road_guided: true, north_supply_relief_pact: true };
base.signals = { ...base.signals, north_trade_stage: 1, north_trade_stock: 2,
  north_waystation_stock: 0, north_mill_relief_stock: 0, road_trouble: 2,
  north_relief_losses: 2, ruins_guide_caravan_treasury: 2 };
base.fired = { ...base.fired, evt_north_waystation_merchant: { count: 1, lastMinute: 0 },
  evt_north_waystation_relief_delivery: { count: 1, lastMinute: 0 } };
hero(base).locationId = 'loc_far_bank';
hero(base).money = 12;
assert.equal(available(base), true);
const depot = run(base, { type: 'perform', actionId: id });
assert.equal(hero(depot).money, 10);
assert.equal(depot.signals.north_trade_stock, 1);
assert.equal(depot.signals.north_waystation_stock, 1);
assert.equal(depot.signals.ruins_guide_caravan_treasury, 4);
assert.equal(depot.rng.cursor, base.rng.cursor);
assert.deepEqual(run(base, { type: 'perform', actionId: id }), depot);
assert.deepEqual(saved(depot), depot);
assert.equal(JSON.stringify(view(depot, worldData)).includes('npc_ruins_raider'), false);
const lastReserved = structuredClone(base);
lastReserved.signals.north_trade_stock = 1;
lastReserved.flags.ruins_guide_mill_order_pending = true;
assert.equal(available(lastReserved), false, 'the final bundle belongs to the paid mill order');
const twoReserved = structuredClone(base);
twoReserved.flags.ruins_guide_mill_order_pending = true;
assert.equal(available(twoReserved), true);
const split = run(twoReserved, { type: 'perform', actionId: id });
assert.equal(split.signals.north_trade_stock, 1);
assert.equal(split.flags.ruins_guide_mill_order_pending, true);
for (const [key, value] of [['north_trade_stock', 0], ['north_waystation_stock', 2],
  ['ruins_guide_caravan_treasury', 11], ['north_trade_stage', 2]]) {
  const s = structuredClone(base);
  s.signals[key] = value;
  assert.equal(available(s), false, key);
}
const poor = structuredClone(base);
hero(poor).money = 1;
assert.equal(available(poor), false);
const relay = structuredClone(depot);
relay.signals.road_trouble = 1;
relay.fired.evt_north_waystation_merchant = { count: 1, lastMinute: 1440 };
const control = run(base, { type: 'wait', minutes: 20 });
control.signals.road_trouble = 1;
control.fired.evt_north_waystation_merchant = { count: 1, lastMinute: 1440 };
const delivered = run(relay, { type: 'wait', minutes: 1440 });
const undelivered = run(control, { type: 'wait', minutes: 1440 });
assert.equal(undelivered.signals.north_mill_relief_stock, 0);
assert.equal(delivered.signals.north_mill_relief_stock, 1, 'real depot cargo enables NPC relief');
assert.deepEqual(saved(delivered), delivered);
console.log('Regional allocation: finite split, paid-order protection, autonomous relief, Save, RNG PASS');
