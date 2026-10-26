import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const act = actionId => ({ type: 'perform', actionId });
const me = s => s.actors[s.player.actorId];
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const run = (s, action) => {
  const r = step(s, action, worldData);
  assert.ok(!r.events.some(e => e.type === 'action.rejected'), JSON.stringify(r.events));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
};
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('raider-peace-482', s, { savedAt: 1 }))));
const start = createInitialState({ worldSeed: 'raider-peace-guide-482', data: worldData }).state;
start.flags = { ruins_watchpost_open: true, ruins_watchpost_restored: true, ruins_watchpost_resolved: true };
start.signals = { ...start.signals, ruins_raider_repulsions: 2, ruins_raider_stage: 1,
  north_trade_stage: 2, north_trade_stock: 2, road_trouble: 2 };
start.actors.npc_ruins_raider.locationId = 'loc_ruins_watchpost';
me(start).locationId = 'loc_mill_hamlet';
me(start).money = 20;
me(start).inventory.item_mill_bread = 4;
assert.equal(can(start, 'act_ruins_raider_make_peace'), false);
assert.equal(can(start, 'act_ruins_raider_recruit_guide'), false);
assert.equal(can(start, 'act_ruins_raider_guide_escort'), false);
const attacked = run(start, { type: 'wait', minutes: 720 });
assert.equal(attacked.actors.npc_ruins_raider.locationId, 'loc_mill_hamlet');
assert.equal(can(attacked, 'act_ruins_raider_make_peace'), false, 'witness must be heard first');
const informed = run(attacked, act('act_ruins_raider_ask_miller'));
assert.equal(can(informed, 'act_ruins_raider_make_peace'), true);
assert.equal(can(informed, 'act_ruins_raider_recruit_guide'), false, 'guide requires investigation training');
assert.equal(JSON.stringify(view(informed, worldData)).includes('npc_ruins_raider'), false, 'view cannot leak hostile actor ID');

// Economic noncombat resolution: finite supply cost and permanent truce.
const peace = run(informed, act('act_ruins_raider_make_peace'));
assert.equal(me(peace).money, me(informed).money - 3);
assert.equal(me(peace).inventory.item_mill_bread, me(informed).inventory.item_mill_bread - 2);
assert.equal(peace.flags.ruins_raider_cleared, true);
assert.equal(peace.flags.ruins_raider_reconciled, true);
assert.equal(peace.flags.ruins_raider_guide_recruited, undefined);
assert.equal(peace.actors.npc_ruins_raider.hp.current > 0, true);
assert.equal(peace.actors.npc_ruins_raider.locationId, 'loc_mill_hamlet');
assert.equal(peace.signals.road_trouble, 1);
assert.equal(can(peace, 'act_ruins_raider_make_peace'), false);
assert.equal(can(peace, 'act_ruins_raider_recruit_guide'), false);
assert.deepEqual(save(peace), peace);
assert.deepEqual(peace, run(informed, act('act_ruins_raider_make_peace')));
const peaceLater = run(run(peace, { type: 'wait', minutes: 1440 }), { type: 'wait', minutes: 720 });
assert.equal(peaceLater.actors.npc_ruins_raider.locationId, 'loc_mill_hamlet');
assert.equal(peaceLater.flags.ruins_raider_cleared, true);

// Investigation specialization converts the enemy into a persistent caravan guide.
const trained = structuredClone(informed);
me(trained).growth.growth_wanderer.skills = { investigation: 1 };
assert.equal(can(trained, 'act_ruins_raider_recruit_guide'), true);
const guide = run(trained, act('act_ruins_raider_recruit_guide'));
assert.equal(me(guide).money, me(trained).money - 6);
assert.equal(guide.flags.ruins_raider_cleared, true);
assert.equal(guide.flags.ruins_raider_guide_recruited, true);
assert.equal(guide.flags.ruins_raider_reconciled, undefined);
assert.equal(guide.actors.npc_ruins_raider.locationId, 'loc_river_ford');
assert.equal(can(guide, 'act_ruins_raider_recruit_guide'), false);
assert.equal(can(guide, 'act_ruins_raider_make_peace'), false);
assert.deepEqual(save(guide), guide);
const atFord = structuredClone(guide);
me(atFord).locationId = 'loc_river_ford';
assert.equal(can(atFord, 'act_ruins_raider_guide_escort'), true);
const escorted = run(atFord, act('act_ruins_raider_guide_escort'));
assert.equal(escorted.signals.road_trouble, 1);
assert.equal(me(escorted).inventory.item_mill_bread, me(atFord).inventory.item_mill_bread - 1);
assert.equal(escorted.actors.npc_ruins_raider.locationId, 'loc_river_ford');
assert.deepEqual(escorted, run(atFord, act('act_ruins_raider_guide_escort')));
assert.deepEqual(save(escorted), escorted);
const escortedAgain = run(escorted, act('act_ruins_raider_guide_escort'));
assert.equal(escortedAgain.signals.road_trouble, 0);
assert.equal(can(escortedAgain, 'act_ruins_raider_guide_escort'), false, 'no benefit if road is safe');
const heir = run({ ...structuredClone(escortedAgain), pending: { kind: 'newCharacter' } },
  { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(heir.flags.ruins_raider_guide_recruited, true);
assert.equal(heir.actors.npc_ruins_raider.locationId, 'loc_river_ford');
assert.equal(heir.knowledge[heir.player.actorId]?.rum_raider_mill_sighting, undefined);
console.log('Ruins raider peace and guide: witnessed truce, trained recruitment, paid road escort, Save, heir, determinism PASS');
