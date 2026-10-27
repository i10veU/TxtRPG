// Public school -> personal field learning -> real courier rescue. Graduates
// need not inherit the previous generation's private cistern chart.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const perform = actionId => ({ type: 'perform', actionId });
const actor = state => state.actors[state.player.actorId];
const available = (state, id) => view(state, worldData).actions.some(a => a.actionId === id && a.available);
const advance = (state, action) => {
  const result = step(state, action, worldData);
  assert.ok(!result.events.some(e => e.type === 'action.rejected'), JSON.stringify(result.events));
  assert.deepEqual(validateState(result.state), []);
  assert.deepEqual(checkDataCompatibility(result.state, worldData), []);
  return result.state;
};
const saved = state => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('field-practicum-506', state, { savedAt: 1 }))));
const base = createInitialState({ worldSeed: 'field-practicum-506', data: worldData }).state;
actor(base).locationId = 'loc_mill_hamlet';
actor(base).money = 12;
actor(base).inventory = { item_iron_sword: 1 };
actor(base).loadout = { hand: 'item_iron_sword' };
actor(base).growth.growth_wanderer.resources.stamina = { current: 20, max: 20 };

const survey = structuredClone(base);
survey.flags = { ...(survey.flags ?? {}), ford_survey_school: true };
let s = advance(survey, perform('act_mill_study_survey_school'));
s = advance(s, perform('act_mill_join_ford_surveyors'));
actor(s).locationId = 'loc_river_ford';
assert.ok(!actor(s).growth.growth_wanderer.unlocks?.unl_cistern_flood_chart);
assert.ok(!available(s, 'act_ford_surveyor_mark_safe_current'));
assert.ok(available(s, 'act_ford_school_survey_practicum'), 'school-trained surveyor can learn the real ford without the chart');
const surveyed = advance(s, perform('act_ford_school_survey_practicum'));
assert.ok(actor(surveyed).growth.growth_wanderer.unlocks.unl_ford_flood_route);
assert.ok(!actor(surveyed).growth.growth_wanderer.unlocks.unl_cistern_flood_chart);
assert.ok(!available(surveyed, 'act_ford_school_survey_practicum'));
assert.ok(available(surveyed, 'act_ford_surveyor_mark_safe_current'));
assert.deepEqual(advance(saved(s), perform('act_ford_school_survey_practicum')), surveyed);
assert.deepEqual(surveyed.rng, s.rng);
const beacon = advance(surveyed, perform('act_ford_surveyor_mark_safe_current'));
assert.equal(beacon.flags.ford_flood_beacons, true);
const arrived = advance(beacon, { type: 'wait', minutes: 720 });
assert.equal(arrived.actors.npc_ford_grain_runner.locationId, 'loc_mill_hamlet');
assert.equal(arrived.actors.npc_ford_grain_runner.inventory.item_waystation_supply_crate, 1);
actor(arrived).locationId = 'loc_mill_hamlet';
const delivered = advance(arrived, perform('act_mill_unload_ford_courier'));
assert.equal(delivered.signals.north_mill_relief_stock, 1);
assert.equal(delivered.actors.npc_ford_grain_runner.inventory.item_waystation_supply_crate ?? 0, 0);
assert.deepEqual(advance(saved(arrived), perform('act_mill_unload_ford_courier')), delivered);

const guard = structuredClone(base);
guard.flags = { ...(guard.flags ?? {}), ford_guard_school: true };
let g = advance(guard, perform('act_mill_study_guard_school'));
g = advance(g, perform('act_mill_join_ford_vanguard'));
actor(g).locationId = 'loc_river_ford';
actor(g).growth.growth_wanderer.stats.dex = 20;
assert.ok(available(g, 'act_ford_school_guard_practicum'));
const guarded = advance(g, perform('act_ford_school_guard_practicum'));
assert.ok(actor(guarded).growth.growth_wanderer.unlocks.unl_ford_flood_route);
assert.ok(!actor(guarded).growth.growth_wanderer.unlocks.unl_cistern_flood_chart);
assert.ok(available(guarded, 'act_ford_vanguard_escort_runner'));
assert.deepEqual(advance(saved(g), perform('act_ford_school_guard_practicum')), guarded);
assert.equal(guarded.rng.cursor, g.rng.cursor + 2);
const escorted = advance(guarded, perform('act_ford_vanguard_escort_runner'));
const safe = advance(escorted, { type: 'wait', minutes: 720 });
assert.equal(safe.actors.npc_ford_grain_runner.locationId, 'loc_mill_hamlet');
assert.equal(safe.actors.npc_ford_grain_runner.inventory.item_waystation_supply_crate, 1);

const weak = structuredClone(g);
actor(weak).growth.growth_wanderer.stats.dex = 0;
weak.rng = { seed: 7, cursor: 0 }; // 2d10 = 1+2, a deterministic failed drill
const failed = advance(weak, perform('act_ford_school_guard_practicum'));
assert.ok(!actor(failed).growth.growth_wanderer.unlocks?.unl_ford_flood_route, 'failed field drill must not reveal the route');
assert.ok(actor(failed).hp.current < actor(weak).hp.current, 'unsafe drill must carry injury risk');
assert.deepEqual(advance(saved(weak), perform('act_ford_school_guard_practicum')), failed);
assert.ok(available(failed, 'act_ford_school_guard_practicum'), 'failure should permit retry if resources remain');
assert.ok(!JSON.stringify(view(survey, worldData)).includes('unl_cistern_flood_chart'));
console.log('Field practicum PASS: chart-free school graduates reach real courier, guarded risk, Save/RNG/knowledge');
