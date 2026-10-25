// Post-J3 expedition loop: carrying a mill-hamlet ration crate across the ferry
// establishes a persistent far-bank resupply market. Breaking it for survival
// instead permanently forecloses that world-level service.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { validateData } from '../../web/v2/core/rules.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const P = (actionId) => ({ type: 'perform', actionId });
const C = (optionId) => ({ type: 'choose', optionId });
const A = (s) => s.actors[s.player.actorId];
const has = (s, id) => view(s, worldData).actions.some((a) => a.actionId === id && a.available);
const rejected = (r) => r.events.some((e) => e.type === 'action.rejected');
const reload = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('supply-run', s, { savedAt: 1 }))));
const narrations = (r) => r.events.filter((e) => e.type === 'narration').map((e) => e.data.textId);
function seed() {
  const s = createInitialState({ worldSeed: 'waystation-supply-25', data: worldData }).state;
  A(s).locationId = 'loc_mill_hamlet';
  A(s).money = 12;
  s.relations ??= {};
  s.relations['org_mill_hamlet:org_village'] = { score: 0, mode: 'neutral', tags: ['trading'] };
  assert.deepEqual(validateState(s), []);
  return s;
}
function perform(s, action) {
  const r = step(s, action, worldData);
  assert.equal(rejected(r), false, 'unexpected rejection: ' + JSON.stringify(action));
  return r;
}
function collect() {
  const start = seed();
  assert.equal(has(start, 'act_accept_waystation_supply'), true);
  const r = perform(start, P('act_accept_waystation_supply'));
  assert.equal(A(r.state).inventory.item_waystation_supply_crate, 1);
  assert.equal(r.state.time.minute - start.time.minute, 30);
  assert.deepEqual(r.state.rng, start.rng);
  assert.equal(has(r.state, 'act_accept_waystation_supply'), false, 'no crate duplication');
  assert.deepEqual(reload(r.state), r.state);
  return r.state;
}
function deliver() {
  let s = collect();
  s = structuredClone(s);
  A(s).locationId = 'loc_river_ford'; // already traversed the known southern road
  s = perform(s, P('act_talk_ferryman')).state;
  s = perform(s, C('opt_ferryman_cross')).state; // real ferry charge and world time
  assert.equal(A(s).locationId, 'loc_far_bank');
  const before = s;
  assert.equal(has(before, 'act_deliver_waystation_supply'), true);
  assert.equal(has(before, 'act_buy_waystation_bread'), false);
  const done = perform(before, P('act_deliver_waystation_supply'));
  const after = done.state;
  assert.equal(after.flags.waystation_supply_delivered, true);
  assert.equal(after.flags.waystation_supply_diverted, undefined);
  assert.equal(A(after).inventory.item_waystation_supply_crate ?? 0, 0);
  assert.equal(A(after).money - A(before).money, 6);
  assert.equal(A(after).inventory.item_mill_bread ?? 0, 1);
  assert.equal(after.time.minute - before.time.minute, 45);
  assert.deepEqual(after.rng, before.rng);
  assert.ok(narrations(done).includes('txt_waystation_supply_delivered'));
  assert.equal(has(after, 'act_deliver_waystation_supply'), false);
  assert.equal(has(after, 'act_buy_waystation_bread'), true, 'supply route opens new resupply option');
  const bought = perform(after, P('act_buy_waystation_bread')).state;
  assert.equal(A(bought).money, A(after).money - 2);
  assert.equal(A(bought).inventory.item_mill_bread, 2);
  assert.equal(has(bought, 'act_camp_quick'), true, 'resupplied food supports the existing field-camp loop');
  const camped = perform(bought, P('act_camp_quick')).state;
  assert.equal(A(camped).inventory.item_mill_bread, 1);
  assert.deepEqual(validateState(camped), []);
  assert.deepEqual(checkDataCompatibility(camped, worldData), []);
  assert.deepEqual(reload(camped), camped);
  // The route is public infrastructure, not private knowledge. It survives succession.
  const dying = structuredClone(after);
  A(dying).alive = false;
  dying.pending = { kind: 'newCharacter' };
  const heir = perform(dying, { type: 'startCharacter', templateId: 'start_wanderer' }).state;
  A(heir).locationId = 'loc_far_bank';
  assert.equal(has(heir, 'act_buy_waystation_bread'), true);
  assert.equal(has(heir, 'act_accept_waystation_supply'), false);
  assert.equal(A(heir).inventory.item_waystation_supply_crate ?? 0, 0);
  return after;
}
function divert() {
  const carrying = structuredClone(collect());
  A(carrying).locationId = 'loc_crossroads';
  assert.equal(has(carrying, 'act_open_waystation_supply'), true);
  const before = carrying;
  const r = perform(before, P('act_open_waystation_supply'));
  const after = r.state;
  assert.equal(after.flags.waystation_supply_diverted, true);
  assert.equal(after.flags.waystation_supply_delivered, undefined);
  assert.equal(A(after).inventory.item_waystation_supply_crate ?? 0, 0);
  assert.equal(A(after).inventory.item_mill_bread ?? 0, 2);
  assert.equal(after.time.minute - before.time.minute, 15);
  assert.deepEqual(after.rng, before.rng);
  assert.ok(narrations(r).includes('txt_waystation_supply_opened'));
  assert.equal(has(after, 'act_open_waystation_supply'), false);
  const far = structuredClone(after);
  A(far).locationId = 'loc_far_bank';
  assert.equal(has(far, 'act_deliver_waystation_supply'), false);
  assert.equal(has(far, 'act_buy_waystation_bread'), false, 'supply route never established');
  const back = structuredClone(after);
  A(back).locationId = 'loc_mill_hamlet';
  assert.equal(has(back, 'act_accept_waystation_supply'), false, 'no duplicate contract after diversion');
  assert.deepEqual(validateState(after), []);
  assert.deepEqual(checkDataCompatibility(after, worldData), []);
  assert.deepEqual(reload(after), after);
  return after;
}
assert.deepEqual(validateData(worldData), []);
const first = deliver();
const second = deliver();
assert.deepEqual(first, second, 'same seed, ferry, actions produce identical state');
const diverted = divert();
assert.notDeepEqual(first.flags, diverted.flags, 'player decision leaves a different world');
const fresh = seed();
assert.equal(has(fresh, 'act_buy_waystation_bread'), false);
assert.equal(has(fresh, 'act_deliver_waystation_supply'), false);
console.log('Waystation supply: real ferry, route unlock, alternate survival choice, succession, Save, RNG: PASS');
