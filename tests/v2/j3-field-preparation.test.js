// J3: personal NPC preparation must change field risk, not merely dialogue or inventory.
import assert from "node:assert/strict";
import { createInitialState, step, validateState, checkDataCompatibility } from "../../web/v2/core/engine.js";
import { applyEffectList, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const start = () => createInitialState({ worldSeed: "j3-field-preparation", data: worldData }).state;
const me = (s) => s.actors[s.player.actorId];
const INTRO = [
  P("act_talk_elder"), C("opt_ask_ruins"),
  M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_ask_sickness"),
  M("loc_village")
];
function run(state, actions) {
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.equal(result.events.some((event) => event.type === "action.rejected"), false,
      "unexpected rejection: " + JSON.stringify(action));
    state = result.state;
  }
  return state;
}
const saveLoad = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-field", s, { savedAt: 1 }))));
function effect(effects, state) {
  const copy = structuredClone(state);
  const events = [];
  applyEffectList(effects, copy, events, { state: copy, data: worldData, actorId: copy.player.actorId });
  return { state: copy, events };
}
const textIds = (events) => events.filter((event) => event.type === "narration").map((event) => event.data.textId);
function damage(effects, state) {
  const result = effect(effects, state);
  return { loss: me(state).hp.current - me(result.state).hp.current, ...result };
}
function withoutTag(state, npc, tag) {
  const copy = structuredClone(state);
  const key = npc + ":" + copy.player.actorId;
  copy.relations[key].tags = copy.relations[key].tags.filter((value) => value !== tag);
  return copy;
}
const base = run(start(), INTRO);
const watchBeforeGrant = run(base, [P("act_request_spring_watch")]);
const watch = run(watchBeforeGrant, [
  P("act_talk_elder"), C("opt_elder_spring_watch_lantern")
]);
const inquiryBeforeGrant = run(base, [P("act_request_spring_inquiry"), M("loc_market")]);
const inquiry = run(inquiryBeforeGrant, [
  P("act_talk_herbalist"), C("opt_herbalist_spring_inquiry_herb")
]);
const ruins = worldData.events.evt_ruins_hazard;
const miasma = worldData.events.evt_spring_miasma;
assert.deepEqual(validateData(worldData), []);
assert.deepEqual(checkDataCompatibility(base, worldData), []);
assert.equal(ruins.cooldown, 30);
assert.equal(miasma.cooldown, 30);
assert.deepEqual(validateState(watch), []);
assert.deepEqual(validateState(inquiry), []);
assert.equal(me(watch).inventory.item_lantern, 1);
assert.equal(me(inquiry).inventory.item_purifying_herb, 1);

// A personal grant AND the still-carried item are both required. The world flag
// alone, a purchased lantern, or a previous character's grant must not suffice.
const watchSafe = damage(ruins.effects, watch);
assert.equal(watchSafe.loss, 2);
assert.ok(textIds(watchSafe.events).includes("txt_ruins_watch_safe_path"));
const watchNoTag = withoutTag(watch, "npc_elder", "spring_watch_lantern_loaned");
assert.equal(damage(ruins.effects, watchNoTag).loss, 4);
const watchNoItem = structuredClone(watch);
delete me(watchNoItem).inventory.item_lantern;
assert.equal(damage(ruins.effects, watchNoItem).loss, 4);
const worldFlagOnly = structuredClone(watchBeforeGrant);
me(worldFlagOnly).inventory.item_lantern = 1;
assert.equal(damage(ruins.effects, worldFlagOnly).loss, 4);
assert.ok(textIds(damage(ruins.effects, worldFlagOnly).events).includes("txt_ruins_hazard"));

// A failed CON check is still a failure, but the herbalist's preparation
// mitigates its HP cost. A successful check and its narration remain unchanged.
const inquirySafe = damage(miasma.outcomes.fail, inquiry);
assert.equal(inquirySafe.loss, 1);
assert.ok(textIds(inquirySafe.events).includes("txt_spring_miasma_prepared"));
const inquiryNoTag = withoutTag(inquiry, "npc_herbalist", "spring_inquiry_herb_given");
assert.equal(damage(miasma.outcomes.fail, inquiryNoTag).loss, 2);
const inquiryNoItem = structuredClone(inquiry);
delete me(inquiryNoItem).inventory.item_purifying_herb;
assert.equal(damage(miasma.outcomes.fail, inquiryNoItem).loss, 2);
const springSuccess = damage(miasma.outcomes.success, inquiry);
assert.equal(springSuccess.loss, 0);
assert.deepEqual(textIds(springSuccess.events), ["txt_spring_miasma_resisted"]);
assert.deepEqual(watchSafe.state.rng, watch.rng, "mitigation adds no RNG draws");
assert.deepEqual(inquirySafe.state.rng, inquiry.rng);

// Real engine movement runs the same trigger and exposes the mitigation.
const moveRuins = step(watch, M("loc_ruins"), worldData);
assert.equal(moveRuins.events.some((e) => e.type === "action.rejected"), false);
assert.ok(moveRuins.events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_ruins_hazard"));
assert.equal(me(watch).hp.current - me(moveRuins.state).hp.current, 2);
assert.ok(textIds(moveRuins.events).includes("txt_ruins_watch_safe_path"));
const replayRuins = step(saveLoad(watch), M("loc_ruins"), worldData);
assert.deepEqual(replayRuins, moveRuins, "save/load and same action must replay exactly");

// A real spring trigger makes the same CON roll whether the herb grant tag is
// present or not. Its damage diverges only if that identical check fails.
const atVillage = run(inquiry, [M("loc_village")]);
const atVillageNoTag = withoutTag(atVillage, "npc_herbalist", "spring_inquiry_herb_given");
const preparedSpring = step(atVillage, M("loc_forest_spring"), worldData);
const bareSpring = step(atVillageNoTag, M("loc_forest_spring"), worldData);
assert.ok(preparedSpring.events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_spring_miasma"));
assert.deepEqual(preparedSpring.state.rng, bareSpring.state.rng, "mitigation must not change check RNG");
const preparedLoss = me(atVillage).hp.current - me(preparedSpring.state).hp.current;
const bareLoss = me(atVillageNoTag).hp.current - me(bareSpring.state).hp.current;
assert.ok((preparedLoss === 1 && bareLoss === 2) || (preparedLoss === 0 && bareLoss === 0),
  "identical CON result must yield 1/2 HP on failure or 0/0 on success");
assert.deepEqual(saveLoad(preparedSpring.state), preparedSpring.state);

// A successor can know the world's response without inheriting a dead
// character's private field preparation, even if they carry similar items.
for (const [granted, npc, tag] of [
  [watch, "npc_elder", "spring_watch_lantern_loaned"],
  [inquiry, "npc_herbalist", "spring_inquiry_herb_given"]
]) {
  const dying = structuredClone(granted);
  me(dying).alive = false;
  dying.pending = { kind: "newCharacter" };
  const heir = run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]);
  assert.equal(heir.relations[npc + ":" + heir.player.actorId]?.tags?.includes(tag) ?? false, false);
  me(heir).inventory.item_lantern = 1;
  me(heir).inventory.item_purifying_herb = 1;
  assert.equal(damage(ruins.effects, heir).loss, 4);
  assert.equal(damage(miasma.outcomes.fail, heir).loss, 2);
}
console.log("J3 NPC preparation -> field hazard consequences: PASS");
