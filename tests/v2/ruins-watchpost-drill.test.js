import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';
const act = id => ({ type: 'perform', actionId: id });
const choose = optionId => ({ type: 'choose', optionId });
const me = s => s.actors[s.player.actorId];
const grow = s => me(s).growth.growth_wanderer;
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const rejected = r => r.events.some(e => e.type === 'action.rejected');
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('watchpost-drill', s, { savedAt: 1 }))));
function play(s, action) {
  const r = step(s, action, worldData);
  assert.equal(rejected(r), false, JSON.stringify(r.events));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r;
}
const base = createInitialState({ worldSeed: 'watchpost-drill-494', data: worldData }).state;
me(base).locationId = 'loc_ruins_watchpost';
me(base).inventory.item_iron_sword = 1;
me(base).loadout = { hand: 'item_iron_sword' };
me(base).hp = { current: 50, max: 50 };
me(base).growth.growth_wanderer.skills = { swordsmanship: 5 };
me(base).growth.growth_wanderer.stats.str = 20;
me(base).growth.growth_wanderer.stats.dex = 20;
base.flags = { ...base.flags, ruins_watchpost_restored: true };
assert.equal(can(base, 'act_watch_drill_begin'), true);
for (const change of [
  s => { s.flags.ruins_watchpost_restored = false; },
  s => { delete me(s).loadout; },
  s => { grow(s).resources.stamina.current = 1; }
]) {
  const s = structuredClone(base); change(s);
  assert.equal(can(s, 'act_watch_drill_begin'), false);
  assert.ok(rejected(step(s, act('act_watch_drill_begin'), worldData)));
}
const first = play(base, act('act_watch_drill_begin')).state;
assert.equal(first.signals.watch_drill_guard, 3);
assert.equal(first.signals.watch_drill_active, 1);
assert.equal(can(first, 'act_watch_drill_finish'), false);
assert.equal(can(first, 'act_watch_drill_tempo'), false);
const premature = play(first, act('act_watch_drill_yield')).state;
assert.equal(premature.signals.watch_drill_active, 0);
assert.equal(premature.signals.watch_drill_guard, 0);
assert.equal(premature.signals.watch_drill_wins ?? 0, 0);

// Search for a real deterministic two-bout path. No state is edited between
// rounds, and each round consumes actual stamina, time and RNG.
let completed;
for (let seed = 1; seed <= 300 && !completed; seed++) {
  let s = structuredClone(base); s.rng.seed = seed;
  let valid = true;
  for (let round = 0; round < 2; round++) {
    s = play(s, act('act_watch_drill_begin')).state;
    for (let exchange = 0; exchange < 3 && (s.signals.watch_drill_guard ?? 0) > 0; exchange++) {
      if (!can(s, 'act_watch_drill_press')) { valid = false; break; }
      s = play(s, act('act_watch_drill_press')).state;
    }
    if (!valid || !can(s, 'act_watch_drill_finish')) { valid = false; break; }
    s = play(s, act('act_watch_drill_finish')).state;
  }
  if (valid) completed = { seed, state: s };
}
assert.ok(completed, 'two real victories with one stamina pool should be possible');
const won = completed.state;
assert.equal(won.signals.watch_drill_wins, 2);
assert.equal(grow(won).unlocks.unl_watchpost_first_bout, true);
assert.equal(won.signals.watch_drill_active, 0);
assert.equal(won.signals.watch_drill_guard, 0);
assert.equal(won.signals.watch_drill_resting, 1);
assert.equal(grow(won).unlocks.unl_watchpost_second_wind, true);
assert.equal(can(won, 'act_watch_drill_begin'), false);
assert.deepEqual(save(won), won);
const soon = play(won, { type: 'wait', minutes: 1439 }).state;
assert.equal(soon.signals.watch_drill_wins, 2);
const next = play(soon, { type: 'wait', minutes: 1 }).state;
assert.equal(next.signals.watch_drill_wins, 0);
assert.equal(next.signals.watch_drill_resting, 0);
assert.equal(can(next, 'act_watch_drill_begin'), false, 'stamina must still be restored by actual rest');
assert.deepEqual(save(next), next);

// Tempo break provides an alternative to two pressure strikes; a successful
// break makes the finisher available without inventing any opponent loot.
const tempo = structuredClone(base);
grow(tempo).unlocks = { ...grow(tempo).unlocks, unl_tempo_break: true };
let tempoWin;
for (let seed = 1; seed <= 300; seed++) {
  const s = structuredClone(tempo); s.rng.seed = seed;
  const started = play(s, act('act_watch_drill_begin')).state;
  const r = play(started, act('act_watch_drill_tempo'));
  if (r.state.signals.watch_drill_guard === 0) { tempoWin = { seed, before: started, after: r.state }; break; }
}
assert.ok(tempoWin);
assert.deepEqual(play(tempoWin.before, act('act_watch_drill_tempo')).state, tempoWin.after);
assert.equal(tempoWin.after.rng.cursor, tempoWin.before.rng.cursor + 2);
assert.equal(can(tempoWin.after, 'act_watch_drill_finish'), true);

// The learned second wind is personal and offers a real follow-up in both
// battles. An exhausted foe cannot perform the heavy retaliation.
const fight = structuredClone(won);
me(fight).locationId = 'loc_ruins';
grow(fight).resources.stamina.current = 1;
me(fight).hp = { current: 40, max: 50 };
fight.pending = { kind: 'choice', choiceId: 'choice_fight_leader', sourceId: 'act_fight_leader' };
assert.ok(worldData.choices.choice_fight_leader.options.some(o => o.id === 'opt_fight_second_wind'));
let secondWind;
for (let seed = 1; seed <= 300; seed++) {
  const s = structuredClone(fight); s.rng.seed = seed;
  const r = play(s, choose('opt_fight_second_wind'));
  if (r.state.actors[s.player.actorId].growth.growth_wanderer.resources.stamina.current >= 4) {
    secondWind = { before: s, after: r.state }; break;
  }
}
assert.ok(secondWind, 'combat stamina recovery can succeed');
assert.ok(grow(secondWind.after).resources.stamina.current >= 4);
assert.deepEqual(play(secondWind.before, choose('opt_fight_second_wind')).state, secondWind.after);
const notMastered = structuredClone(fight);
delete grow(notMastered).unlocks.unl_watchpost_second_wind;
assert.ok(rejected(step(notMastered, choose('opt_fight_second_wind'), worldData)));
for (const key of ['chief', 'right_hand']) {
  assert.ok(worldData.choices.choice_final_battle.options.some(o => o.id === `opt_final_${key}_second_wind`));
}
const heirStart = structuredClone(won);
me(heirStart).alive = false;
heirStart.pending = { kind: 'newCharacter' };
const heir = play(heirStart, { type: 'startCharacter', templateId: 'start_wanderer' }).state;
assert.equal(grow(heir).unlocks?.unl_watchpost_second_wind, undefined);
assert.equal(grow(heir).unlocks?.unl_watchpost_first_bout, undefined);
assert.equal(JSON.stringify(view(won, worldData)).includes('watch_drill_guard'), false);
console.log(`Watchpost drill: two victories, timed rota, tempo alternative, second wind, heir, Save, RNG PASS (seed ${completed.seed})`);
