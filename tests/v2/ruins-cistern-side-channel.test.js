import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { evaluateCondition } from '../../web/v2/core/rules.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';
const P = actionId => ({ type: 'perform', actionId });
const hero = s => s.actors[s.player.actorId];
const available = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const route = (s, from, to) => (worldData.locations[from].links || []).some(link => link.to === to &&
  (!link.requires || evaluateCondition(link.requires, { state: s, data: worldData,
    actorId: s.player.actorId, contextKind: 'player' })));
const saved = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('cistern-side', s, { savedAt: 1 }))));
function play(s, action) {
  const result = step(s, action, worldData);
  assert.equal(result.events.some(e => e.type === 'action.rejected'), false, JSON.stringify(result.events));
  assert.deepEqual(validateState(result.state), []);
  assert.deepEqual(checkDataCompatibility(result.state, worldData), []);
  return result.state;
}
const base = createInitialState({ worldSeed: 'cistern-side-499', data: worldData }).state;
hero(base).locationId = 'loc_ruins_cistern';
hero(base).inventory.item_lantern = 1;
hero(base).growth.growth_wanderer.skills = { investigation: 2, swordsmanship: 2 };
hero(base).growth.growth_wanderer.resources.stamina = { current: 20, max: 20 };
hero(base).money = 12;
base.flags = { ...base.flags, ruins_cistern_sluice_open: true };
assert.equal(available(base, 'act_cistern_read_side_current'), true, 'new surveying action exists');
assert.equal(route(base, 'loc_ruins_cistern', 'loc_ruins_lower_vault'), false);
const studied = play(base, P('act_cistern_read_side_current'));
assert.equal(available(studied, 'act_cistern_trace_side_safe'), true);
const safe = play(studied, P('act_cistern_trace_side_safe'));
assert.equal(available(safe, 'act_cistern_build_side_ladder'), true);
assert.equal(available(safe, 'act_cistern_take_side_cache'), true);
const built = play(safe, P('act_cistern_build_side_ladder'));
assert.equal(built.flags.ruins_cistern_side_resolved, true);
assert.equal(built.flags.ruins_cistern_side_ladder, true);
assert.equal(route(built, 'loc_ruins_cistern', 'loc_ruins_lower_vault'), true);
assert.equal(route(built, 'loc_ruins_lower_vault', 'loc_ruins_cistern'), true);
assert.equal(available(built, 'act_cistern_take_side_cache'), false);
assert.deepEqual(saved(built), built);
assert.deepEqual(play(saved(safe), P('act_cistern_build_side_ladder')), built);
assert.deepEqual(built.rng, base.rng, 'survey and public ladder must not consume RNG');
const walked = play(built, { type: 'move', to: 'loc_ruins_lower_vault' });
assert.equal(walked.time.minute - built.time.minute, 10);
// A successor inherits the physical ladder, but never the founder's private route.
const dead = structuredClone(built);
hero(dead).alive = false;
dead.pending = { kind: 'newCharacter' };
const heir = play(dead, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(heir.flags.ruins_cistern_side_ladder, true);
assert.equal(route(heir, 'loc_ruins_cistern', 'loc_ruins_lower_vault'), false);
hero(heir).locationId = 'loc_ruins_lower_vault';
hero(heir).inventory.item_lantern = 1;
assert.equal(available(heir, 'act_lower_vault_retrace_cistern_ladder'), true);
const remapped = play(heir, P('act_lower_vault_retrace_cistern_ladder'));
assert.equal(route(remapped, 'loc_ruins_lower_vault', 'loc_ruins_cistern'), true);
// The private cache is mutually exclusive with the public ladder and finite.
const looted = play(safe, P('act_cistern_take_side_cache'));
assert.equal(looted.flags.ruins_cistern_side_resolved, true);
assert.equal(looted.flags.ruins_cistern_side_ladder, undefined);
assert.equal(route(looted, 'loc_ruins_cistern', 'loc_ruins_lower_vault'), false);
assert.equal(available(looted, 'act_cistern_build_side_ladder'), false);
assert.equal(available(looted, 'act_cistern_take_side_cache'), false);
assert.equal(hero(looted).money, hero(safe).money + 6);
assert.deepEqual(saved(looted), looted);
// The dangerous shortcut uses existing RNG, but a failure cannot mint loot or a ladder.
assert.equal(available(base, 'act_cistern_trace_side_risky'), true);
let failed = false, succeeded = false;
for (let seed = 1; seed <= 120 && (!failed || !succeeded); seed++) {
  const attempt = structuredClone(base);
  attempt.rng.seed = seed;
  const after = play(attempt, P('act_cistern_trace_side_risky'));
  assert.deepEqual(play(saved(attempt), P('act_cistern_trace_side_risky')), after);
  if (available(after, 'act_cistern_build_side_ladder')) succeeded = true;
  else {
    failed = true;
    assert.equal(after.flags.ruins_cistern_side_resolved, undefined);
    assert.equal(hero(after).money, hero(attempt).money);
  }
}
assert.ok(failed && succeeded, 'risky exploration must have meaningful success and failure');
assert.equal(JSON.stringify(view(base, worldData)).includes('ruins_cistern_side_ladder'), false,
  'unrevealed world flags must not leak into the player projection');
console.log('Cistern side channel PASS: knowledge-safe route, risky RNG, public shortcut/private loot, heir discovery, Save');
