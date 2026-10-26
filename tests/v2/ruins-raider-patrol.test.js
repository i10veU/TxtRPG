import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility, adoptNewActors } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const act = actionId => ({ type: 'perform', actionId });
const player = s => s.actors[s.player.actorId];
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const run = (s, a) => {
  const r = step(s, a, worldData);
  assert.ok(!r.events.some(e => e.type === 'action.rejected'), JSON.stringify({ a, events: r.events }));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
};
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('raider-patrol', s, { savedAt: 1 }))));
const initial = createInitialState({ worldSeed: 'ruins-raider-478', data: worldData }).state;
assert.ok(initial.actors.npc_ruins_raider, 'physical raider actor must exist');
assert.equal(can(initial, 'act_ruins_raider_intercept'), false, 'no secret action before exploration');
const base = structuredClone(initial);
player(base).locationId = 'loc_ruins_watchpost';
player(base).inventory.item_iron_sword = 1;
player(base).inventory.item_lantern = 1;
player(base).inventory.item_mill_bread = 3;
player(base).growth.growth_wanderer.skills = { investigation: 1, swordsmanship: 1 };
base.flags = { ruins_watchpost_open: true, ruins_watchpost_restored: true, ruins_watchpost_resolved: true };
base.signals = { ...(base.signals ?? {}), road_trouble: 1, north_mill_relief_stock: 2 };
let started = run(base, act('act_equip_iron_sword'));
assert.equal(started.actors.npc_ruins_raider.locationId, 'loc_ruins_watchpost');
assert.equal(started.signals.ruins_raider_stage, 1);
assert.equal(can(started, 'act_ruins_raider_intercept'), true);
assert.equal(can(started, 'act_ruins_raider_track'), true);
assert.deepEqual(save(started), started);
const beforeTick = structuredClone(started);
const afterTick = run(beforeTick, { type: 'wait', minutes: 720 });
assert.equal(afterTick.actors.npc_ruins_raider.locationId, 'loc_village');
assert.equal(afterTick.signals.ruins_raider_stage, 2);
assert.equal(afterTick.signals.north_mill_relief_stock, 1);
assert.equal(afterTick.signals.road_trouble, 2);
assert.equal(can(afterTick, 'act_ruins_raider_intercept'), false, 'cannot strike an absent NPC');
assert.deepEqual(run(beforeTick, { type: 'wait', minutes: 720 }), afterTick);
assert.deepEqual(save(afterTick), afterTick);
const third = run(afterTick, { type: 'wait', minutes: 720 });
assert.equal(third.actors.npc_ruins_raider.locationId, 'loc_ruins_gallery');
assert.equal(third.signals.ruins_raider_stage, 0);
// No public passage: the patrol cannot enter the village, and the world's
// stored rations cannot be stolen through an unopened route.
const sealed = structuredClone(started);
delete sealed.flags.ruins_watchpost_restored;
const sealedTick = run(sealed, { type: 'wait', minutes: 720 });
assert.equal(sealedTick.actors.npc_ruins_raider.locationId, 'loc_ruins_gallery');
assert.equal(sealedTick.signals.north_mill_relief_stock, 2);
assert.equal(sealedTick.signals.road_trouble, 1);
// A full day away advances two patrol legs without teleporting to the final
// leg prematurely. A long wait must agree with two shorter waits.
const long = run(started, { type: 'wait', minutes: 1440 });
assert.deepEqual(long, run(run(started, { type: 'wait', minutes: 720 }), { type: 'wait', minutes: 720 }));
assert.equal(long.signals.north_mill_relief_stock, 1);

function find(s, actionId, success) {
  for (let seed = 1; seed < 1000; seed++) {
    const before = structuredClone(s);
    before.rng.seed = seed;
    const raw = step(before, act(actionId), worldData);
    const got = ['great', 'success'].includes(raw.events.find(e => e.type === 'check.resolved')?.data.tier);
    if (got === success) return { before, after: run(before, act(actionId)), seed };
  }
  assert.fail('no check tier for ' + actionId);
}
const combatFail = find(started, 'act_ruins_raider_intercept', false);
assert.equal(combatFail.after.flags.ruins_raider_cleared, undefined);
assert.equal(combatFail.after.actors.npc_ruins_raider.alive, true);
assert.ok(player(combatFail.after).hp.current < player(combatFail.before).hp.current);
const combat = find(started, 'act_ruins_raider_intercept', true);
assert.equal(combat.after.flags.ruins_raider_cleared, true);
assert.equal(combat.after.actors.npc_ruins_raider.alive, false);
assert.equal(combat.after.signals.road_trouble, 0);
assert.equal(combat.after.rng.cursor, combat.before.rng.cursor + 2);
assert.equal(can(combat.after, 'act_ruins_raider_intercept'), false);
assert.deepEqual(run(combat.before, act('act_ruins_raider_intercept')), combat.after);
const combatWait = run(run(combat.after, { type: 'wait', minutes: 1440 }), { type: 'wait', minutes: 720 });
assert.equal(combatWait.actors.npc_ruins_raider.alive, false);
assert.deepEqual(save(combatWait), combatWait);

const tracked = find(started, 'act_ruins_raider_track', true);
assert.equal(tracked.after.flags.ruins_raider_cleared, undefined);
assert.equal(can(tracked.after, 'act_ruins_raider_divert'), true);
const diverted = find(tracked.after, 'act_ruins_raider_divert', true);
assert.equal(diverted.after.flags.ruins_raider_cleared, true);
assert.equal(diverted.after.flags.ruins_raider_diverted, true);
assert.equal(diverted.after.actors.npc_ruins_raider.locationId, 'loc_ruins');
assert.equal(diverted.after.actors.npc_ruins_raider.alive, true);
assert.equal(diverted.after.signals.road_trouble, 0);
assert.equal(player(diverted.after).inventory.item_mill_bread, player(diverted.before).inventory.item_mill_bread - 1);
assert.deepEqual(save(diverted.after), diverted.after);
const divertWait = run(diverted.after, { type: 'wait', minutes: 1440 });
assert.equal(divertWait.actors.npc_ruins_raider.locationId, 'loc_ruins');
assert.equal(divertWait.flags.ruins_raider_diverted, true);
const divertHeirState = structuredClone(diverted.after);
player(divertHeirState).alive = false;
divertHeirState.pending = { kind: 'newCharacter' };
const divertHeir = run(divertHeirState, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(divertHeir.flags.ruins_raider_diverted, true);
assert.equal(divertHeir.actors[divertHeir.player.actorId].growth.growth_wanderer.unlocks?.unl_ruins_raider_tracked, undefined);
assert.deepEqual(run(diverted.before, act('act_ruins_raider_divert')), diverted.after);

const legacy = structuredClone(initial);
delete legacy.actors.npc_ruins_raider;
const migrated = adoptNewActors(legacy, worldData);
assert.deepEqual(migrated.added, ['npc_ruins_raider']);
assert.equal(migrated.state.actors.npc_ruins_raider.locationId, 'loc_ruins_gallery');
assert.deepEqual(legacy.actors.npc_ruins_raider, undefined);
const dead = structuredClone(combat.after);
player(dead).alive = false;
dead.pending = { kind: 'newCharacter' };
const heir = run(dead, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(heir.flags.ruins_raider_cleared, true);
assert.equal(heir.actors.npc_ruins_raider.alive, false);
assert.equal(can(heir, 'act_ruins_raider_track'), false);
console.log(`Ruins raider: timed actor route, finite village loss, combat=${combat.seed}, diversion=${diverted.seed}, Save, legacy actor migration, heir, knowledge projection PASS`);
