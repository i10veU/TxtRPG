import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const act = actionId => ({ type: 'perform', actionId });
const me = s => s.actors[s.player.actorId];
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const run = (s, a) => {
  const r = step(s, a, worldData);
  assert.ok(!r.events.some(e => e.type === 'action.rejected'), JSON.stringify(r.events));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
};
const saved = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('raider-adaptation', s, { savedAt: 1 }))));
const initial = createInitialState({ worldSeed: 'ruins-raider-adaptation-481', data: worldData }).state;
initial.flags = { ruins_watchpost_open: true, ruins_watchpost_restored: true, ruins_watchpost_resolved: true };
initial.signals = { ...initial.signals, ruins_raider_stage: 1, ruins_raider_repulsions: 1,
  north_trade_stage: 2, north_trade_stock: 2, road_trouble: 0 };
initial.actors.npc_ruins_raider.locationId = 'loc_ruins_watchpost';
me(initial).locationId = 'loc_mill_hamlet';
me(initial).money = 10;
assert.equal(can(initial, 'act_ruins_raider_ask_miller'), false);
assert.equal(can(initial, 'act_ruins_raider_hire_mill_patrol'), false);

// A second *real* successful defence changes the hostile NPC's next route.
initial.flags.ruins_raider_sentries_ready = true;
const twice = run(initial, { type: 'wait', minutes: 720 });
assert.equal(twice.signals.ruins_raider_repulsions, 2);
assert.equal(twice.actors.npc_ruins_raider.locationId, 'loc_ruins_gallery');
assert.equal(twice.signals.ruins_raider_stage, 0);
const watch = run(twice, { type: 'wait', minutes: 720 });
assert.equal(watch.actors.npc_ruins_raider.locationId, 'loc_ruins_watchpost');
const detour = run(watch, { type: 'wait', minutes: 720 });
assert.equal(detour.actors.npc_ruins_raider.locationId, 'loc_mill_hamlet');
assert.equal(detour.signals.ruins_raider_stage, 3);
assert.equal(detour.signals.north_trade_stock, 1, 'raider steals only existing merchant cargo');
assert.equal(detour.flags.ruins_raider_mill_sighting, true);
assert.equal(detour.knowledge?.[detour.player.actorId]?.rum_raider_mill_sighting, undefined);
assert.equal(can(detour, 'act_ruins_raider_ask_miller'), true);
assert.equal(can(detour, 'act_ruins_raider_hire_mill_patrol'), false);
assert.deepEqual(detour, run(twice, { type: 'wait', minutes: 1440 }), 'catch-up equals split waits');
assert.deepEqual(saved(detour), detour);

const told = run(detour, act('act_ruins_raider_ask_miller'));
assert.deepEqual(told.knowledge[told.player.actorId].rum_raider_mill_sighting.sources, ['npc_miller']);
assert.equal(can(told, 'act_ruins_raider_hire_mill_patrol'), true);
const guarded = run(told, act('act_ruins_raider_hire_mill_patrol'));
assert.equal(me(guarded).money, me(told).money - 2);
assert.equal(guarded.flags.ruins_raider_mill_patrol_ready, true);
assert.deepEqual(saved(guarded), guarded);
const back = run(guarded, { type: 'wait', minutes: 720 });
assert.equal(back.actors.npc_ruins_raider.locationId, 'loc_ruins_gallery');
assert.equal(back.flags.ruins_raider_mill_recent, false);
const watchAgain = run(back, { type: 'wait', minutes: 720 });
const stockBefore = watchAgain.signals.north_trade_stock;
const defended = run(watchAgain, { type: 'wait', minutes: 720 });
assert.equal(defended.actors.npc_ruins_raider.locationId, 'loc_ruins_gallery');
assert.equal(defended.signals.north_trade_stock, stockBefore);
assert.equal(defended.flags.ruins_raider_mill_patrol_ready, false);
assert.equal(defended.signals.ruins_raider_stage, 0);
assert.equal(defended.flags.ruins_raider_cleared, undefined);
assert.deepEqual(saved(defended), defended);
const heir = run({ ...structuredClone(defended), pending: { kind: 'newCharacter' } }, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(heir.knowledge[heir.player.actorId]?.rum_raider_mill_sighting, undefined);
assert.equal(heir.signals.ruins_raider_repulsions, 2);

// A detour without a caravan at the mill cannot create negative cargo.
const empty = structuredClone(watch);
empty.signals.north_trade_stock = 0;
const emptyDetour = run(empty, { type: 'wait', minutes: 720 });
assert.equal(emptyDetour.signals.north_trade_stock, 0);
assert.equal(emptyDetour.actors.npc_ruins_raider.locationId, 'loc_mill_hamlet');
assert.equal(can(createInitialState({ worldSeed: 'hidden', data: worldData }).state, 'act_ruins_raider_ask_miller'), false);
console.log('Ruins raider: two repulsions, adaptive mill detour, finite cargo, sourced witness, patrol, replay, Save, heir PASS');
