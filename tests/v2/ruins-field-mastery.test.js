import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const P = actionId => ({ type: 'perform', actionId });
const me = s => s.actors[s.player.actorId];
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const act = (s, a) => {
  const r = step(s, a, worldData);
  assert.ok(!r.events.some(e => e.type === 'action.rejected'), JSON.stringify(r.events));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
};
const saved = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('field-mastery-503', s, { savedAt: 1 }))));
const base = createInitialState({ worldSeed: 'field-mastery-503', data: worldData }).state;
me(base).locationId = 'loc_mill_hamlet';
me(base).money = 30;
me(base).inventory.item_iron_sword = 1;
me(base).loadout = { hand: 'item_iron_sword' };
me(base).growth.growth_wanderer.resources.stamina = { current: 20, max: 20 };
me(base).growth.growth_wanderer.skills = { investigation: 2, swordsmanship: 2 };
me(base).growth.growth_wanderer.unlocks = {
  unl_ford_surveyor: true, unl_cistern_flood_chart: true,
  unl_watchpost_pursuit: true
};
base.flags = { ...(base.flags ?? {}), ford_flood_delivered: true };
base.flags.ford_flood_beacons = true;

// Mastery is earned from a finished physical delivery, not mere career selection.
const noDelivery = structuredClone(base);
delete noDelivery.flags.ford_flood_delivered;
assert.ok(!can(noDelivery, 'act_mill_surveyor_master_route'));
assert.ok(can(base, 'act_mill_surveyor_master_route'));
const surveyor = act(base, P('act_mill_surveyor_master_route'));
assert.ok(me(surveyor).growth.growth_wanderer.unlocks.unl_ford_master_surveyor);
assert.ok(!can(surveyor, 'act_mill_surveyor_master_route'));
assert.deepEqual(act(saved(base), P('act_mill_surveyor_master_route')), surveyor);

// The master surveyor spends real resources to leave a durable public crossing.
const ford = structuredClone(surveyor);
me(ford).locationId = 'loc_river_ford';
assert.ok(can(ford, 'act_ford_build_public_causeway'));
const built = act(ford, P('act_ford_build_public_causeway'));
assert.equal(built.flags.ford_public_causeway, true);
assert.equal(me(built).money, me(ford).money - 4);
assert.ok(!can(built, 'act_ford_build_public_causeway'));
assert.ok(can(built, 'act_ford_public_causeway_to_mill'));
const crossed = act(built, P('act_ford_public_causeway_to_mill'));
assert.equal(me(crossed).locationId, 'loc_mill_hamlet');
assert.equal(crossed.time.minute, built.time.minute + 30);
assert.ok(can(crossed, 'act_mill_public_causeway_to_ford'));
assert.deepEqual(act(saved(built), P('act_ford_public_causeway_to_mill')), crossed);
assert.deepEqual(crossed.rng, built.rng);

// A successor inherits the physical causeway but NOT private route knowledge.
const dying = structuredClone(built);
me(dying).alive = false;
dying.pending = { kind: 'newCharacter' };
const heir = act(dying, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(heir.flags.ford_public_causeway, true);
assert.equal(me(heir).growth.growth_wanderer.unlocks?.unl_ford_master_surveyor, undefined);
assert.equal(me(heir).growth.growth_wanderer.unlocks?.unl_ford_public_causeway_read, undefined);
me(heir).locationId = 'loc_river_ford';
assert.ok(!can(heir, 'act_ford_public_causeway_to_mill'));
assert.ok(can(heir, 'act_ford_inspect_public_causeway'));
const learned = act(heir, P('act_ford_inspect_public_causeway'));
assert.ok(can(learned, 'act_ford_public_causeway_to_mill'));
assert.ok(!JSON.stringify(view(base, worldData)).includes('ford_public_causeway'));

// Vanguard mastery requires a personally learned sword technique and an actual
// guarded courier outcome; the new final-battle option is not granted to novices.
const guard = structuredClone(base);
me(guard).growth.growth_wanderer.unlocks = { unl_ford_vanguard: true, unl_watchpost_pursuit: true };
guard.flags.ford_flood_guarded = true;
assert.ok(can(guard, 'act_mill_vanguard_master_guard'));
const masterGuard = act(guard, P('act_mill_vanguard_master_guard'));
assert.ok(me(masterGuard).growth.growth_wanderer.unlocks.unl_ford_master_vanguard);
assert.ok(!can(masterGuard, 'act_mill_vanguard_master_guard'));
assert.deepEqual(act(saved(guard), P('act_mill_vanguard_master_guard')), masterGuard);
const option = worldData.choices.choice_final_battle.options.find(o => o.id === 'opt_final_chief_vanguard_hold');
assert.ok(option, 'master vanguard gains a distinct final battle tactic');
const duel = structuredClone(masterGuard);
me(duel).locationId = 'loc_crossroads';
me(duel).inventory.item_iron_sword = 1;
me(duel).loadout = { hand: 'item_iron_sword' };
duel.pending = { kind: 'choice', choiceId: 'choice_final_battle', sourceId: 'act_face_band' };
const novice = structuredClone(duel);
delete me(novice).growth.growth_wanderer.unlocks.unl_ford_master_vanguard;
const failed = step(novice, { type: 'choose', optionId: option.id }, worldData);
assert.ok(failed.events.some(e => e.type === 'action.rejected'));
const hit = act(duel, { type: 'choose', optionId: option.id });
assert.ok(hit.actors.npc_bandit_leader.hp.current < duel.actors.npc_bandit_leader.hp.current ||
  me(hit).hp.current < me(duel).hp.current, 'new combat option resolves a real exchange');
assert.deepEqual(act(saved(duel), { type: 'choose', optionId: option.id }), hit);
assert.ok(hit.rng.cursor > duel.rng.cursor);
console.log('Field mastery PASS: career milestones, public crossing, successor discovery, master combat, Save/RNG');
