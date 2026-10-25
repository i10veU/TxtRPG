// Post-J3 character growth: safe drills versus risky certification, and a learned defensive exchange.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';
const P = (id) => ({ type: 'perform', actionId: id });
const C = (id) => ({ type: 'choose', optionId: id });
const actor = (s) => s.actors[s.player.actorId];
const grow = (s) => actor(s).growth.growth_wanderer;
const offered = (s, id) => view(s, worldData).actions.some((a) => a.actionId === id && a.available);
const reject = (r) => r.events.find((e) => e.type === 'action.rejected');
const roundtrip = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('academy', s, { savedAt: 1 }))));
function seed() {
  const s = createInitialState({ worldSeed: 'castle-academy-463', data: worldData }).state;
  actor(s).locationId = 'loc_castle_town';
  actor(s).money = 30;
  actor(s).hp.current = 10;
  return s;
}
function apply(s, action) {
  const r = step(s, action, worldData);
  assert.equal(reject(r), undefined, JSON.stringify(action));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  assert.deepEqual(roundtrip(r.state), r.state);
  return r;
}
const fresh = seed();
assert.equal(offered(fresh, 'act_castle_guard_drill'), true, 'safe practice at castle town');
assert.equal(offered(fresh, 'act_castle_spar_trial'), false, 'sparring requires basic skill');
const first = apply(fresh, P('act_castle_guard_drill'));
assert.equal(actor(first.state).money, 28);
assert.equal(grow(first.state).resources.stamina.current, 4);
assert.equal(grow(first.state).proficiency.combat, 10);
assert.equal(first.state.time.minute - fresh.time.minute, 120);
assert.deepEqual(first.state.rng, fresh.rng, 'practice is deterministic');
const second = apply(first.state, P('act_castle_guard_drill'));
assert.equal(grow(second.state).skills.swordsmanship, 1);
assert.equal(offered(second.state, 'act_castle_spar_trial'), true);
const noMoney = structuredClone(second.state); actor(noMoney).money = 0;
assert.equal(offered(noMoney, 'act_castle_spar_trial'), false);
const noStamina = structuredClone(second.state); grow(noStamina).resources.stamina.current = 0;
assert.equal(offered(noStamina, 'act_castle_spar_trial'), false);
// The sparring challenge has four real check tiers; all pay their entry cost.
const trial = worldData.actions.act_castle_spar_trial;
for (const tier of ['great','success','partial','fail']) {
  assert.equal(trial.outcomes[tier][0].op, 'money');
  assert.equal(trial.outcomes[tier][1].op, 'resource');
}
let qualified;
for (let n = 0; n < 250 && !qualified; n++) {
  const s = structuredClone(second.state);
  s.rng.seed = n + 1;
  const r = apply(s, P('act_castle_spar_trial'));
  const tier = r.events.find((e) => e.type === 'check.resolved')?.data.tier;
  assert.equal(actor(r.state).money, actor(s).money - 3);
  assert.equal(grow(r.state).resources.stamina.current, grow(s).resources.stamina.current - 2);
  assert.equal(r.state.time.minute - s.time.minute, 90);
  if (tier === 'great' || tier === 'success') qualified = r.state;
  else assert.notEqual(grow(r.state).unlocks?.unl_guarded_stance, true);
}
assert.ok(qualified, 'at least one seed qualifies');
assert.equal(grow(qualified).unlocks.unl_guarded_stance, true);
assert.equal(offered(qualified, 'act_castle_spar_trial'), false, 'one-time qualification');
assert.deepEqual(roundtrip(qualified), qualified);
// A personal technique does not become a world flag or transfer to a successor.
assert.equal(qualified.flags?.unl_guarded_stance, undefined);
const duel = structuredClone(qualified);
actor(duel).locationId = 'loc_ruins';
actor(duel).inventory.item_relic = 1;
actor(duel).hp.current = 10;
grow(duel).resources.stamina.current = 6;
const started = apply(duel, P('act_fight_leader')).state;
assert.equal(started.pending?.choiceId, 'choice_fight_leader');
const guarded = apply(started, C('opt_fight_guarded_stance'));
assert.equal(grow(guarded.state).resources.stamina.current, 4);
assert.equal(guarded.state.time.minute - started.time.minute, 5);
assert.deepEqual(apply(started, C('opt_fight_guarded_stance')).state, guarded.state, 'same seed + same choice');
const novice = structuredClone(started); delete grow(novice).unlocks.unl_guarded_stance;
assert.ok(reject(step(novice, C('opt_fight_guarded_stance'), worldData)), 'untrained fighter cannot use the stance');
const exhausted = structuredClone(started); grow(exhausted).resources.stamina.current = 1;
assert.ok(reject(step(exhausted, C('opt_fight_guarded_stance'), worldData)), 'stamina cost is enforced');
for (const id of ['opt_final_chief_guarded_stance','opt_final_right_hand_guarded_stance']) {
  assert.ok(worldData.choices.choice_final_battle.options.some((o) => o.id === id), id);
}
console.log('Castle combat academy: safe drills, sparring certification, guarded exchange, Save, RNG: PASS');
