import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { evaluateCondition } from '../../web/v2/core/rules.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const me = s => s.actors[s.player.actorId];
const act = actionId => ({ type: 'perform', actionId });
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const link = (from, to) => worldData.locations[from].links.find(l => l.to === to)?.requires;
const allowed = (s, cond) => evaluateCondition(cond, { state: s, data: worldData, actorId: s.player.actorId, contextKind: 'player' });
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('ruins-lower', s, { savedAt: 1 }))));
function run(s, action) {
  const r = step(s, action, worldData);
  assert.ok(!r.events.some(e => e.type === 'action.rejected'), JSON.stringify(action));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r;
}
function findOutcome(start, actionId, success) {
  for (let seed = 1; seed < 400; seed++) {
    const before = structuredClone(start); before.rng.seed = seed;
    const r = run(before, act(actionId));
    const tier = r.events.find(e => e.type === 'check.resolved')?.data.tier;
    if (success === ['great', 'success'].includes(tier)) return { before, after: r.state, tier, seed };
  }
  assert.fail(`missing outcome ${actionId} ${success}`);
}
const initial = createInitialState({ worldSeed: 'ruins-lower-475', data: worldData }).state;
me(initial).locationId = 'loc_ruins_cellar';
me(initial).money = 15;
me(initial).inventory.item_lantern = 1;
me(initial).inventory.item_iron_sword = 1;
me(initial).growth.growth_wanderer.skills = { investigation: 1, swordsmanship: 1 };
initial.flags = { ruins_cellar_resolved: true };
const start = run(initial, act('act_equip_iron_sword')).state;
assert.equal(can(start, 'act_ruins_lower_scout'), true);
assert.equal(can(start, 'act_ruins_lower_breach'), true);
assert.equal(allowed(start, link('loc_ruins_cellar', 'loc_ruins_lower_vault')), false);
assert.equal(allowed(start, link('loc_village', 'loc_ruins_lower_vault')), false);
const withoutLight = structuredClone(start); me(withoutLight).inventory.item_lantern = 0;
assert.equal(can(withoutLight, 'act_ruins_lower_scout'), false);
const withoutSword = run(start, act('act_unequip_iron_sword')).state;
assert.equal(can(withoutSword, 'act_ruins_lower_breach'), false);

const scout = findOutcome(start, 'act_ruins_lower_scout', true);
const failedScout = findOutcome(start, 'act_ruins_lower_scout', false);
assert.equal(scout.after.flags.ruins_lower_open, true);
assert.equal(scout.after.flags.ruins_lower_noisy, undefined);
assert.equal(allowed(scout.after, link('loc_ruins_cellar', 'loc_ruins_lower_vault')), true);
assert.equal(can(failedScout.after, 'act_ruins_lower_scout'), true);
assert.deepEqual(run(scout.before, act('act_ruins_lower_scout')).state, scout.after);
assert.deepEqual(save(scout.after), scout.after);
const vault = run(scout.after, { type: 'move', to: 'loc_ruins_lower_vault' }).state;
assert.equal(can(vault, 'act_ruins_lower_salvage'), true);
assert.equal(can(vault, 'act_ruins_lower_public_passage'), true);
assert.equal(can(vault, 'act_ruins_lower_repair_breach'), false);
const salvage = run(vault, act('act_ruins_lower_salvage')).state;
assert.equal(me(salvage).inventory.item_iron_sword, me(vault).inventory.item_iron_sword + 1);
assert.equal(me(salvage).inventory.item_herbal_salve, 1);
assert.equal(can(salvage, 'act_ruins_lower_public_passage'), false);
assert.equal(allowed(salvage, link('loc_village', 'loc_ruins_lower_vault')), false);
const publicRoute = run(vault, act('act_ruins_lower_public_passage')).state;
assert.equal(me(publicRoute).money, me(vault).money - 3);
assert.equal(publicRoute.flags.ruins_lower_public, true);
assert.equal(can(publicRoute, 'act_ruins_lower_salvage'), false);
assert.equal(allowed(publicRoute, link('loc_village', 'loc_ruins_lower_vault')), true);
assert.deepEqual(publicRoute.rng, vault.rng);
assert.deepEqual(save(publicRoute), publicRoute);
const heirSeed = structuredClone(publicRoute); me(heirSeed).alive = false; heirSeed.pending = { kind: 'newCharacter' };
const heir = run(heirSeed, { type: 'startCharacter', templateId: 'start_wanderer' }).state;
assert.equal(me(heir).growth.growth_wanderer.unlocks?.unl_ruins_lower_route, undefined);
assert.equal(allowed(heir, link('loc_village', 'loc_ruins_lower_vault')), true);
assert.equal(me(run(heir, { type: 'move', to: 'loc_ruins_lower_vault' }).state).locationId, 'loc_ruins_lower_vault');

const breach = findOutcome(start, 'act_ruins_lower_breach', true);
const failedBreach = findOutcome(start, 'act_ruins_lower_breach', false);
assert.equal(breach.after.flags.ruins_lower_noisy, true);
assert.equal(breach.after.flags.ruins_lower_open, true);
assert.equal(can(failedBreach.after, 'act_ruins_lower_breach'), true);
// A trained defensive stance mitigates the same failed breach without changing
// the check or RNG cursor; this is a real tactical growth benefit.
const guardedBefore = structuredClone(failedBreach.before);
me(guardedBefore).growth.growth_wanderer.unlocks = { unl_guarded_stance: true };
const guardedResult = run(guardedBefore, act('act_ruins_lower_breach'));
assert.equal(guardedResult.events.find(e => e.type === 'check.resolved')?.data.tier, failedBreach.tier);
assert.deepEqual(guardedResult.state.rng, failedBreach.after.rng);
assert.ok(me(guardedResult.state).hp.current > me(failedBreach.after).hp.current);

const noisyVault = run(breach.after, { type: 'move', to: 'loc_ruins_lower_vault' }).state;
assert.equal(can(noisyVault, 'act_ruins_lower_public_passage'), false);
assert.equal(can(noisyVault, 'act_ruins_lower_repair_breach'), true);
const repaired = run(noisyVault, act('act_ruins_lower_repair_breach')).state;
assert.equal(me(repaired).money, me(noisyVault).money - 6);
assert.equal(repaired.flags.ruins_lower_public, true);
assert.equal(allowed(repaired, link('loc_village', 'loc_ruins_lower_vault')), true);
assert.deepEqual(repaired.rng, noisyVault.rng);
assert.deepEqual(save(repaired), repaired);

const successorSeed = structuredClone(scout.after); me(successorSeed).alive = false; successorSeed.pending = { kind: 'newCharacter' };
const successor = run(successorSeed, { type: 'startCharacter', templateId: 'start_wanderer' }).state;
assert.equal(allowed(successor, link('loc_ruins_cellar', 'loc_ruins_lower_vault')), false);
me(successor).locationId = 'loc_ruins_cellar'; me(successor).inventory.item_lantern = 1;
assert.equal(can(successor, 'act_ruins_lower_follow_tracks'), true);
const followed = run(successor, act('act_ruins_lower_follow_tracks')).state;
assert.equal(allowed(followed, link('loc_ruins_cellar', 'loc_ruins_lower_vault')), true);
assert.deepEqual(followed.rng, successor.rng);
// The new vault must not be projected as a visible destination to a fresh player.
const fresh = createInitialState({ worldSeed: 'ruins-lower-hidden', data: worldData }).state;
assert.equal(view(fresh, worldData).actions.some(a => /ruins_lower/.test(a.actionId) && a.available), false);
assert.equal(allowed(fresh, link('loc_village', 'loc_ruins_lower_vault')), false);
console.log(`Ruins lower passage: scout ${scout.seed}, breach ${breach.seed}, exclusive reward, public path, successor, RNG, Save PASS`);
