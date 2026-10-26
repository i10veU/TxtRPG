import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const actor = s => s.actors[s.player.actorId];
const act = actionId => ({ type: 'perform', actionId });
const available = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const run = (s, action) => {
  const result = step(s, action, worldData);
  assert.equal(result.events.some(e => e.type === 'action.rejected'), false, JSON.stringify(action));
  assert.deepEqual(validateState(result.state), []);
  assert.deepEqual(checkDataCompatibility(result.state, worldData), []);
  return result.state;
};
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('supply-charter', s, { savedAt: 1 }))));
const base = createInitialState({ worldSeed: 'supply-charter-489', data: worldData }).state;
base.flags = { ...base.flags, north_road_guided: true };
base.signals = { ...base.signals, north_trade_stage: 0, north_trade_stock: 0,
  north_waystation_stock: 0, north_mill_relief_stock: 0, road_trouble: 0,
  ruins_guide_caravan_treasury: 0 };
actor(base).locationId = 'loc_mill_hamlet';
actor(base).money = 12;
assert.equal(available(base, 'act_ruins_guide_charter_depot'), true);
const ordinary = run(base, { type: 'wait', minutes: 30 });
const depot = run(base, act('act_ruins_guide_charter_depot'));
assert.equal(depot.flags.ruins_guide_supply_charter, true);
assert.equal(depot.flags.ruins_guide_depot_priority, true);
assert.equal(actor(depot).money, 9);
assert.equal(depot.signals.north_trade_stage, 1);
assert.equal(depot.signals.north_trade_stock, 1, 'depot receives a real cargo bundle');
assert.equal(depot.signals.north_waystation_stock, ordinary.signals.north_waystation_stock + 1);
assert.equal(depot.signals.ruins_guide_caravan_treasury, 9);
assert.equal(ordinary.signals.north_trade_stock, 2);
assert.deepEqual(run(base, act('act_ruins_guide_charter_depot')), depot);
assert.deepEqual(save(depot), depot);
assert.equal(depot.rng.cursor, base.rng.cursor);
assert.equal(JSON.stringify(view(depot, worldData)).includes('npc_ruins_raider'), false);

// Choosing mill priority instead redirects the next autonomous caravan's
// scarce cargo to the actual village warehouse, even without a relief pact.
const millBase = structuredClone(base);
millBase.flags.ruins_guide_supply_charter = true;
millBase.flags.ruins_guide_depot_priority = true;
const millChoice = run(millBase, act('act_ruins_guide_prioritize_mill'));
assert.equal(millChoice.flags.ruins_guide_depot_priority, false);
assert.equal(actor(millChoice).money, 11);
assert.equal(millChoice.signals.north_trade_stock, 2);
const millArrived = run(millChoice, { type: 'wait', minutes: 1440 });
assert.equal(millArrived.signals.north_trade_stage, 2);
assert.equal(millArrived.signals.north_mill_relief_stock, 1);
assert.equal(millArrived.signals.north_trade_stock, 1);
const depotArrived = run(depot, { type: 'wait', minutes: 1440 });
assert.equal(depotArrived.signals.north_mill_relief_stock, 0);
assert.equal(depotArrived.signals.north_trade_stock, 1);
assert.deepEqual(save(millArrived), millArrived);
assert.equal(available(millChoice, 'act_ruins_guide_prioritize_depot'), true);
assert.equal(available(millChoice, 'act_ruins_guide_prioritize_mill'), false);

// Prepaid mill cargo must never be consumed by the depot preference.
const reserved = structuredClone(base);
reserved.flags.ruins_guide_supply_charter = true;
reserved.flags.ruins_guide_depot_priority = true;
reserved.flags.ruins_guide_mill_order_pending = true;
reserved.signals.north_trade_stock = 1;
reserved.signals.north_waystation_stock = 0;
const protectedCargo = run(reserved, { type: 'wait', minutes: 1 });
assert.equal(protectedCargo.signals.north_trade_stock, 1);
assert.equal(protectedCargo.signals.north_waystation_stock, 1, 'ordinary depot restock only');
assert.equal(protectedCargo.flags.ruins_guide_mill_order_pending, true);

// Full depots cannot be overfilled; policy persists across Save and successor.
const full = structuredClone(base);
full.flags.ruins_guide_supply_charter = true;
full.flags.ruins_guide_depot_priority = true;
full.signals.north_waystation_stock = 3;
const noOverflow = run(full, { type: 'wait', minutes: 1 });
assert.equal(noOverflow.signals.north_waystation_stock, 3);
assert.equal(noOverflow.signals.north_trade_stock, 2);
const heirSeed = structuredClone(millArrived);
actor(heirSeed).alive = false;
heirSeed.pending = { kind: 'newCharacter' };
const heir = run(heirSeed, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(heir.flags.ruins_guide_supply_charter, true);
assert.equal(heir.flags.ruins_guide_depot_priority, false);
console.log('Supply charter: NPC depot/mill priorities, finite cargo, prepaid protection, Save, heir, RNG PASS');
