import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const act = actionId => ({ type: 'perform', actionId });
const actor = state => state.actors[state.player.actorId];
const can = (state, id) => view(state, worldData).actions.some(a => a.actionId === id && a.available);
const roundTrip = state => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('ruins-patrol', state, { savedAt: 1 }))));
const run = (state, action) => {
  const result = step(state, action, worldData);
  assert.ok(!result.events.some(e => e.type === 'action.rejected'), JSON.stringify(action));
  assert.deepEqual(validateState(result.state), []);
  assert.deepEqual(checkDataCompatibility(result.state, worldData), []);
  return result;
};
const fixture = createInitialState({ worldSeed: 'ruins-patrol-476', data: worldData }).state;
actor(fixture).locationId = 'loc_ruins_lower_vault';
actor(fixture).inventory.item_lantern = 1;
actor(fixture).inventory.item_iron_sword = 1;
actor(fixture).growth.growth_wanderer.skills = { investigation: 1, swordsmanship: 1 };
actor(fixture).growth.growth_wanderer.unlocks = { unl_ruins_lower_route: true };
fixture.flags = { ruins_cellar_resolved: true, ruins_lower_open: true, ruins_lower_resolved: true, ruins_cellar_refuge: true };
const start = run(fixture, act('act_equip_iron_sword')).state;
assert.equal(can(start, 'act_ruins_lower_silent_patrol'), true);
assert.equal(can(start, 'act_ruins_lower_armed_patrol'), true);
assert.equal(can(start, 'act_ruins_lower_calm_alarm'), false);
assert.equal(can(start, 'act_ruins_lower_rest_safe'), false);

function find(startState, actionId, success) {
  for (let seed = 1; seed < 1000; seed++) {
    const before = structuredClone(startState);
    before.rng.seed = seed;
    const result = run(before, act(actionId));
    const tier = result.events.find(e => e.type === 'check.resolved')?.data.tier;
    if (['great', 'success'].includes(tier) === success) return { before, result, seed, tier };
  }
  assert.fail(`No ${success ? 'success' : 'failure'} for ${actionId}`);
}
const quiet = find(start, 'act_ruins_lower_silent_patrol', true);
const armed = find(start, 'act_ruins_lower_armed_patrol', true);
const quietFail = find(start, 'act_ruins_lower_silent_patrol', false);
const armedFail = find(start, 'act_ruins_lower_armed_patrol', false);
assert.equal(quiet.result.state.signals.ruins_lower_patrol_progress, 1);
assert.equal(armed.result.state.signals.ruins_lower_patrol_progress, 1);
assert.equal(quiet.result.state.flags.ruins_lower_patrol_safe, undefined);
assert.equal(armed.result.state.flags.ruins_lower_patrol_safe, undefined);
assert.ok(actor(quiet.result.state).money <= actor(armed.result.state).money);
assert.deepEqual(run(quiet.before, act('act_ruins_lower_silent_patrol')).state, quiet.result.state);
assert.deepEqual(roundTrip(quiet.result.state), quiet.result.state);
assert.equal(quiet.result.state.rng.cursor, quiet.before.rng.cursor + 2);
assert.equal(quietFail.result.state.signals.ruins_lower_patrol_progress ?? 0, 0);
assert.equal(armedFail.result.state.signals.ruins_lower_patrol_progress ?? 0, 0);
assert.equal(quietFail.result.state.signals.ruins_lower_alarm, 1);
assert.equal(armedFail.result.state.signals.ruins_lower_alarm, 1);

// Repeated failed attempts raise alarm only to its cap, and calming it is
// a real cost in time/stamina, not a free reward/reset.
const alarm = structuredClone(start);
alarm.signals = { ...(alarm.signals ?? {}), ruins_lower_alarm: 2 };
assert.equal(can(alarm, 'act_ruins_lower_silent_patrol'), false);
assert.equal(can(alarm, 'act_ruins_lower_calm_alarm'), true);
const calm = run(alarm, act('act_ruins_lower_calm_alarm')).state;
assert.equal(calm.signals.ruins_lower_alarm, 1);
assert.deepEqual(calm.rng, alarm.rng);
assert.equal(can(calm, 'act_ruins_lower_silent_patrol'), true);

// A guarded stance must mitigate armed-patrol failure without altering RNG.
const guarded = structuredClone(armedFail.before);
actor(guarded).growth.growth_wanderer.unlocks = { unl_guarded_stance: true };
const guardedFail = run(guarded, act('act_ruins_lower_armed_patrol')).state;
assert.ok(actor(guardedFail).hp.current > actor(armedFail.result.state).hp.current);
assert.deepEqual(guardedFail.rng, armedFail.result.state.rng);

// Three successful patrols (with actual refuge rest between sorties) complete
// a persistent world safety milestone; all loot is capped by the three runs.
let progress = structuredClone(start);
for (let i = 1; i <= 3; i++) {
  if (i > 1) {
    progress = run(progress, { type: 'move', to: 'loc_ruins_cellar' }).state;
    progress = run(progress, act('act_rest_ruins_cellar_refuge')).state;
    progress = run(progress, { type: 'move', to: 'loc_ruins_lower_vault' }).state;
  }
  progress = find(progress, i === 2 ? 'act_ruins_lower_armed_patrol' : 'act_ruins_lower_silent_patrol', true).result.state;
  assert.equal(progress.signals.ruins_lower_patrol_progress, i);
}
assert.equal(progress.flags.ruins_lower_patrol_safe, true);
assert.equal(can(progress, 'act_ruins_lower_silent_patrol'), false);
assert.equal(can(progress, 'act_ruins_lower_armed_patrol'), false);
assert.equal(can(progress, 'act_ruins_lower_rest_safe'), true);
assert.deepEqual(roundTrip(progress), progress);
const healed = run(progress, act('act_ruins_lower_rest_safe')).state;
assert.ok(actor(healed).growth.growth_wanderer.resources.stamina.current >= actor(progress).growth.growth_wanderer.resources.stamina.current);
assert.deepEqual(healed.rng, progress.rng);

// A successor inherits a safer world, not their predecessor's skills, map or
// unreported reward. Reporting is a one-time village event with real effect.
const dead = structuredClone(progress);
actor(dead).alive = false;
dead.pending = { kind: 'newCharacter' };
const successor = run(dead, { type: 'startCharacter', templateId: 'start_wanderer' }).state;
assert.equal(successor.flags.ruins_lower_patrol_safe, true);
assert.equal(actor(successor).growth.growth_wanderer.skills?.investigation, undefined);
assert.equal(can(successor, 'act_ruins_lower_rest_safe'), false); // not in vault
assert.equal(can(successor, 'act_ruins_lower_report_watch'), true); // village
const reported = run(successor, act('act_ruins_lower_report_watch')).state;
assert.equal(reported.flags.ruins_lower_patrol_reported, true);
assert.equal(can(reported, 'act_ruins_lower_report_watch'), false);
assert.deepEqual(roundTrip(reported), reported);

// Unknown ruins information is not projected into a new player's action view.
const fresh = createInitialState({ worldSeed: 'ruins-patrol-secret', data: worldData }).state;
assert.equal(view(fresh, worldData).actions.some(a => /ruins_lower_(silent_patrol|armed_patrol|calm_alarm|rest_safe)/.test(a.actionId)), false);
console.log(`Ruins patrol: quiet seed=${quiet.seed}, armed seed=${armed.seed}, fail=${quietFail.seed}, bounded 3 sorties, world safety, report, Save, RNG, successor PASS`);
