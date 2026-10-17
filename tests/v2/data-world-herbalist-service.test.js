// The herbalist's shared postending service: ingredients, NPC time, world stock, knowledge, and succession.
import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const W = (minutes) => ({ type: "wait", minutes });
const option = (id) => worldData.choices.choice_herbalist_dialogue.options.find((entry) => entry.id === id);
const sig = (state, key) => state.signals?.[key] ?? 0;
const item = (state, id) => state.actors[state.player.actorId].inventory[id] ?? 0;
const known = (state) => state.knowledge?.[state.player.actorId]?.rum_herbalist_stock;
const offered = (state, id) => evaluateCondition(option(id).requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
const talk = (id) => [P("act_talk_herbalist"), C(id)];
function hearsStatus(state, textId) {
  const atMarket = structuredClone(state);
  atMarket.actors[atMarket.player.actorId].locationId = "loc_market";
  const heard = run(atMarket, talk("opt_herbalist_stock_status"));
  assert.ok(heard.log.some((event) => event.type === "narration" && event.data.textId === textId), textId);
  return heard.state;
}
function run(state, actions, data = worldData) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, data);
    assert.ok(!result.events.some((event) => event.type === "action.rejected"), `rejected ${JSON.stringify(action)}`);
    log.push(...result.events);
    state = result.state;
  }
  return { state, log };
}
const saveLoad = (state) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_herbalist_service", state, { savedAt: 1 }))));

function prepared() {
  const state = createInitialState({ worldSeed: "herbalist-service", data: worldData }).state;
  const actor = state.actors[state.player.actorId];
  actor.locationId = "loc_market";
  actor.growth.growth_wanderer.skills = { herbalism: 2 };
  actor.inventory = { item_flour_sack: 1, item_purifying_herb: 4 };
  state.signals = { ...state.signals, frontier_fate: 2 };
  state.relations = {
    ...state.relations,
    [`npc_herbalist:${state.player.actorId}`]: { score: 10, mode: "neutral", tags: [] }
  };
  assert.deepEqual(validateState(state), []);
  return state;
}

function testSetupAndFirstBatch() {
  assert.deepEqual(validateData(worldData), []);
  const start = prepared();
  const oldSave = saveLoad(createInitialState({ worldSeed: "old-service-save", data: worldData }).state);
  assert.equal(oldSave.flags?.herbalist_stock_established, undefined);
  assert.equal(sig(oldSave, "herbalist_salve_stock"), 0);
  assert.equal(offered(start, "opt_herbalist_establish_stock"), true);
  for (const patch of [
    (s) => { s.signals.frontier_fate = 0; },
    (s) => { s.actors[s.player.actorId].growth.growth_wanderer.skills.herbalism = 1; },
    (s) => { s.relations[`npc_herbalist:${s.player.actorId}`].score = 9; },
    (s) => { s.actors[s.player.actorId].inventory.item_flour_sack = 0; }
  ]) {
    const changed = structuredClone(start);
    patch(changed);
    assert.equal(offered(changed, "opt_herbalist_establish_stock"), false, "all four setup gates matter");
  }
  const guidance = run(start, talk("opt_herbalist_stock_status"));
  assert.ok(guidance.log.some((event) => event.type === "narration" && event.data.textId === "txt_herbalist_stock_guidance"));
  assert.equal(known(guidance.state), undefined, "guidance is not knowledge of a service that does not exist");

  const setup = run(guidance.state, talk("opt_herbalist_establish_stock"));
  assert.equal(setup.state.time.minute, guidance.state.time.minute + 120);
  assert.equal(item(setup.state, "item_flour_sack"), 0);
  assert.equal(sig(setup.state, "herbalist_salve_stock"), 0);
  assert.equal(setup.state.flags.herbalist_stock_established, true);
  assert.equal(setup.state.facts.fact_herbalist_stock.value, "established");
  assert.equal(known(setup.state).claim, "established");
  assert.equal(known(setup.state).sources[0], "npc_herbalist");
  assert.equal(offered(setup.state, "opt_herbalist_establish_stock"), false);
  assert.equal(offered(setup.state, "opt_herbalist_supply_batch"), true);
  hearsStatus(setup.state, "txt_herbalist_stock_empty");

  const submitted = run(setup.state, talk("opt_herbalist_supply_batch"));
  assert.equal(submitted.state.time.minute, setup.state.time.minute + 30);
  assert.equal(item(submitted.state, "item_purifying_herb"), 2);
  assert.equal(sig(submitted.state, "herbalist_brew_due"), 2, "submission starts her clock, with no immediate salve");
  assert.equal(sig(submitted.state, "herbalist_salve_stock"), 0);
  assert.deepEqual(submitted.state.fired.evt_herbalist_brews, { count: 1, lastMinute: submitted.state.time.minute });
  assert.equal(offered(submitted.state, "opt_herbalist_supply_batch"), false);
  assert.equal(offered(submitted.state, "opt_herbalist_collect_salve"), false);
  hearsStatus(submitted.state, "txt_herbalist_stock_working");

  // She works while the player is away. The service rumor describes availability, not current stock.
  const away = structuredClone(submitted.state);
  away.actors[away.player.actorId].locationId = "loc_village";
  const almost = run(away, [W(1439)]).state;
  assert.equal(sig(almost, "herbalist_salve_stock"), 0);
  const first = run(almost, [W(1)]).state;
  assert.equal(sig(first, "herbalist_brew_due"), 1);
  assert.equal(sig(first, "herbalist_salve_stock"), 1);
  hearsStatus(first, "txt_herbalist_stock_ready_working");
  const almostSecond = run(first, [W(1439)]).state;
  assert.equal(sig(almostSecond, "herbalist_salve_stock"), 1, "2879 minutes: only the first salve");
  const second = run(almostSecond, [W(1)]).state;
  assert.equal(sig(second, "herbalist_brew_due"), 0);
  assert.equal(sig(second, "herbalist_salve_stock"), 2);
  assert.equal(second.fired.evt_herbalist_brews.count, 3);
  assert.equal(known(second).claim, "established");
  hearsStatus(second, "txt_herbalist_stock_ready");
  assert.equal(run(second, [W(1440)]).state.signals.herbalist_salve_stock, 2, "stock never grows past two");
  assert.equal(offered(second, "opt_herbalist_supply_batch"), false, "uncollected stock blocks another batch");

  const back = structuredClone(second);
  back.actors[back.player.actorId].locationId = "loc_market";
  const one = run(back, talk("opt_herbalist_collect_salve")).state;
  assert.equal(sig(one, "herbalist_salve_stock"), 1);
  assert.equal(item(one, "item_herbal_salve"), 1);
  assert.equal(offered(one, "opt_herbalist_supply_batch"), false);
  const two = run(one, talk("opt_herbalist_collect_salve")).state;
  assert.equal(sig(two, "herbalist_salve_stock"), 0);
  assert.equal(item(two, "item_herbal_salve"), 2);
  hearsStatus(two, "txt_herbalist_stock_empty");
  assert.equal(offered(two, "opt_herbalist_collect_salve"), false, "each salve can be collected once");
  const askingAgain = run(two, [P("act_talk_herbalist")]).state;
  const rejected = step(askingAgain, C("opt_herbalist_collect_salve"), worldData);
  assert.ok(rejected.events.some((event) => event.type === "action.rejected" && event.data.code === "requirements_not_met"));
  assert.deepEqual(rejected.state, askingAgain, "a rejected extra collection changes nothing");
  const injured = structuredClone(two);
  injured.actors[injured.player.actorId].hp.current = 3;
  const treated = run(injured, [P("act_apply_salve")]).state;
  assert.equal(treated.actors[treated.player.actorId].hp.current, 8, "collected stock is the existing healing salve");
  assert.equal(item(treated, "item_herbal_salve"), 1);
  assert.equal(sig(treated, "herbalist_salve_stock"), 0);
  assert.equal(offered(two, "opt_herbalist_supply_batch"), true);
  assert.deepEqual(validateState(two), []);
  return { first, submitted, two };
}

function testOldClockAndLongStep(two) {
  let idle = two;
  for (let i = 0; i < 30; i += 1) idle = run(idle, [W(1440)]).state;
  assert.equal(sig(idle, "herbalist_salve_stock"), 0);
  const batch = run(idle, talk("opt_herbalist_supply_batch")).state;
  assert.equal(sig(batch, "herbalist_brew_due"), 2);
  assert.equal(sig(batch, "herbalist_salve_stock"), 0);
  assert.deepEqual(batch.fired.evt_herbalist_brews, { count: 4, lastMinute: batch.time.minute }, "new batch discards the dormant cadence");
  const short = run(batch, [W(1440), W(1440)]).state;
  const longData = structuredClone(worldData);
  longData.actions.act_test_two_days = { minutes: 2880, effects: [] };
  const long = run(batch, [P("act_test_two_days")], longData).state;
  for (const value of [short, long]) {
    assert.equal(sig(value, "herbalist_brew_due"), 0);
    assert.equal(sig(value, "herbalist_salve_stock"), 2);
    assert.deepEqual(value.fired.evt_herbalist_brews, { count: 6, lastMinute: batch.time.minute + 2880 });
  }
  assert.deepEqual(saveLoad(batch), batch);
  assert.deepEqual(run(saveLoad(batch), [W(1440), W(1440)]).state, short, "save/load keeps the new clock");
}

function testSuccession(first) {
  const dying = structuredClone(first);
  dying.actors[dying.player.actorId].alive = false;
  dying.pending = { kind: "newCharacter" };
  const heir = run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.equal(heir.flags.herbalist_stock_established, true);
  assert.equal(sig(heir, "herbalist_salve_stock"), 1);
  assert.equal(known(heir), undefined, "the new person has not heard of the service");
  assert.equal(heir.actors[heir.player.actorId].growth.growth_wanderer.skills?.herbalism, undefined);
  assert.equal(item(heir, "item_purifying_herb"), 0);
  assert.equal(heir.relations?.[`npc_herbalist:${heir.player.actorId}`]?.score ?? 0, 0);
  const atMarket = structuredClone(heir);
  atMarket.actors[atMarket.player.actorId].locationId = "loc_market";
  assert.equal(offered(atMarket, "opt_herbalist_collect_salve"), false);
  const told = run(atMarket, talk("opt_herbalist_stock_status")).state;
  assert.equal(known(told).claim, "established");
  assert.equal(offered(told, "opt_herbalist_collect_salve"), true);
  const collected = run(told, talk("opt_herbalist_collect_salve")).state;
  assert.equal(item(collected, "item_herbal_salve"), 1);
  assert.equal(sig(collected, "herbalist_salve_stock"), 0);
  const nextDay = run(collected, [W(1430)]).state;
  assert.equal(sig(nextDay, "herbalist_brew_due"), 0, "the pending second salve finishes after succession");
  assert.equal(sig(nextDay, "herbalist_salve_stock"), 1);
  const secondSalve = run(nextDay, talk("opt_herbalist_collect_salve")).state;
  assert.equal(item(secondSalve, "item_herbal_salve"), 2);
  assert.equal(sig(secondSalve, "herbalist_salve_stock"), 0);
  assert.deepEqual(validateState(secondSalve), []);
}

function testEarnedInputs() {
  const state = createInitialState({ worldSeed: "service-earned", data: worldData }).state;
  const actor = state.actors[state.player.actorId];
  actor.locationId = "loc_market";
  actor.growth.growth_wanderer.skills = { herbalism: 2 };
  actor.inventory.item_purifying_herb = 6; // from earlier spring gathering
  state.signals = { ...state.signals, frontier_fate: 2 };
  const trusted = run(state, [
    ...talk("opt_herbalist_ask_sickness"),
    ...talk("opt_herbalist_give_herbs")
  ]).state;
  assert.equal(trusted.relations[`npc_herbalist:${trusted.player.actorId}`].score, 15, "conversation and herbs earn her trust");
  const atMill = structuredClone(trusted);
  atMill.actors[atMill.player.actorId].locationId = "loc_mill_hamlet";
  atMill.relations["org_mill_hamlet:org_village"] = { score: 0, mode: "neutral", tags: ["trading"] };
  atMill.signals.mill_flour_stock = 1;
  const bought = run(atMill, [P("act_talk_miller"), C("opt_miller_buy_flour")]).state;
  assert.equal(item(bought, "item_flour_sack"), 1, "the mill's existing sale supplies the service");
  assert.equal(bought.actors[bought.player.actorId].money, 6, "flour cost two silver");
  bought.actors[bought.player.actorId].locationId = "loc_market";
  assert.equal(offered(bought, "opt_herbalist_establish_stock"), true);
  assert.equal(run(bought, talk("opt_herbalist_establish_stock")).state.flags.herbalist_stock_established, true);
}

testEarnedInputs();
const { first, two } = testSetupAndFirstBatch();
testOldClockAndLongStep(two);
testSuccession(first);
console.log("data-world-herbalist-service.test.js: all checks passed");
