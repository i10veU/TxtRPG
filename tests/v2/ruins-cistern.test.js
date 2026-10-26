import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { evaluateCondition } from '../../web/v2/core/rules.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';
const P = actionId => ({ type: 'perform', actionId });
const hero = s => s.actors[s.player.actorId];
const available = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const route = (s, from, to) => {
  const link = worldData.locations[from].links.find(l => l.to === to);
  return Boolean(link) && (link.requires === undefined || evaluateCondition(link.requires,
    { state: s, data: worldData, actorId: s.player.actorId, contextKind: 'player' }));
};
const saved = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('cistern', s, { savedAt: 1 }))));
function play(s, action) {
  const result = step(s, action, worldData);
  assert.equal(result.events.some(e => e.type === 'action.rejected'), false, JSON.stringify(result.events));
  assert.deepEqual(validateState(result.state), []);
  assert.deepEqual(checkDataCompatibility(result.state, worldData), []);
  return result.state;
}
const initial = createInitialState({ worldSeed: 'cistern-498', data: worldData }).state;
assert.equal(available(initial, 'act_gallery_trace_cistern'), false);
const base = structuredClone(initial);
hero(base).locationId = 'loc_ruins_gallery';
hero(base).inventory.item_lantern = 1;
hero(base).inventory.item_iron_sword = 1;
hero(base).growth.growth_wanderer.skills = { investigation: 2, swordsmanship: 2 };
hero(base).growth.growth_wanderer.resources.stamina = { current: 20, max: 20 };
base.flags = { ...base.flags, ruins_watch_gallery_open: true, ruins_gallery_secured: true,
  ruins_watchpost_open: true, ruins_watchpost_restored: true };
assert.equal(available(base, 'act_gallery_trace_cistern'), true);
assert.equal(route(base, 'loc_ruins_gallery', 'loc_ruins_cistern'), false);
const discovered = play(base, P('act_gallery_trace_cistern'));
assert.equal(discovered.flags.ruins_cistern_entrance_open, true);
assert.equal(route(discovered, 'loc_ruins_gallery', 'loc_ruins_cistern'), true);
const inside = play(discovered, { type: 'move', to: 'loc_ruins_cistern' });
assert.equal(available(inside, 'act_cistern_balance_intake'), false);
assert.equal(route(inside, 'loc_ruins_cistern', 'loc_ruins_watchpost'), false);
const read = play(inside, P('act_cistern_read_marks'));
assert.equal(available(read, 'act_cistern_balance_intake'), true);
const first = play(read, P('act_cistern_balance_intake'));
assert.equal(first.signals.ruins_cistern_balance, 1);
assert.equal(available(first, 'act_cistern_open_sluice'), false);
const second = play(first, P('act_cistern_set_counterweight'));
assert.equal(second.signals.ruins_cistern_balance, 2);
const opened = play(second, P('act_cistern_open_sluice'));
assert.equal(opened.flags.ruins_cistern_sluice_open, true);
assert.equal(route(opened, 'loc_ruins_cistern', 'loc_ruins_watchpost'), true);
assert.equal(route(opened, 'loc_ruins_watchpost', 'loc_ruins_cistern'), true);
assert.equal(available(opened, 'act_cistern_open_sluice'), false);
assert.equal(available(opened, 'act_cistern_force_sluice'), false);
assert.deepEqual(saved(opened), opened);
assert.deepEqual(play(saved(second), P('act_cistern_open_sluice')), opened);
assert.deepEqual(opened.rng, second.rng, 'mechanical valve sequence is deterministic and consumes no RNG');
const shortcut = play(opened, { type: 'move', to: 'loc_ruins_watchpost' });
assert.equal(shortcut.time.minute - opened.time.minute, 12, 'new physical shortcut is faster than gallery road');
// The alternate strength route is real, finite, and cannot claim the investigation reward.
const forcedStart = structuredClone(inside);
hero(forcedStart).loadout = { hand: 'item_iron_sword' };
let forced;
for (let seed = 1; seed < 200; seed++) {
  const candidate = structuredClone(forcedStart);
  candidate.rng.seed = seed;
  const result = play(candidate, P('act_cistern_force_sluice'));
  if (result.flags.ruins_cistern_sluice_open) { forced = { before: candidate, after: result }; break; }
}
assert.ok(forced, 'force-open route must be possible');
assert.equal(route(forced.after, 'loc_ruins_cistern', 'loc_ruins_watchpost'), true);
assert.equal(forced.after.signals.ruins_cistern_balance ?? 0, 0);
assert.deepEqual(play(saved(forced.before), P('act_cistern_force_sluice')), forced.after);
assert.deepEqual(saved(forced.after), forced.after);
const heirStart = structuredClone(opened);
hero(heirStart).alive = false;
heirStart.pending = { kind: 'newCharacter' };
const heir = play(heirStart, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(heir.flags.ruins_cistern_sluice_open, true);
assert.equal(hero(heir).growth.growth_wanderer.unlocks?.unl_cistern_watch_route, undefined);
assert.equal(route(heir, 'loc_ruins_watchpost', 'loc_ruins_cistern'), false);
hero(heir).locationId = 'loc_ruins_cistern';
hero(heir).inventory.item_lantern = 1;
assert.equal(available(heir, 'act_cistern_retrace_passage'), true);
const heirMapped = play(heir, P('act_cistern_retrace_passage'));
assert.equal(route(heirMapped, 'loc_ruins_cistern', 'loc_ruins_watchpost'), true);
assert.equal(JSON.stringify(view(initial, worldData)).includes('ruins_cistern_balance'), false);
console.log('Cistern PASS: new dungeon, two physical mechanisms, shortcut, save/determinism, successor knowledge');
