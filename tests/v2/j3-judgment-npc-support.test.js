// J3: the village response changes what NPCs actually give the player.
// All outcomes use existing dialogue/Effect/Item/Relation and stay independent of UI guesses.
import assert from "node:assert/strict";
import { createInitialState, step, validateState, checkDataCompatibility } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const INTRO = [...E("opt_ask_ruins"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), M("loc_village")];
const WATCH = "opt_elder_spring_watch_lantern";
const INQUIRY = "opt_herbalist_spring_inquiry_herb";
const start = () => createInitialState({ worldSeed: "j3-npc-support", data: worldData }).state;
const me = (s) => s.actors[s.player.actorId];
const item = (s, id) => me(s).inventory[id] ?? 0;
const edge = (s, npc) => s.relations[npc + ":" + s.player.actorId];
const option = (id) => {
  const list = id === WATCH ? worldData.choices.choice_elder_dialogue.options : worldData.choices.choice_herbalist_dialogue.options;
  return list.find((entry) => entry.id === id);
};
const offered = (s, id) => evaluateCondition(option(id).requires, {
  state: s, data: worldData, actorId: s.player.actorId, contextKind: "player"
});
const saveLoad = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-npc-support", s, { savedAt: 1 }))));
function run(state, actions) {
  const logs = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((event) => event.type === "action.rejected"),
      "unexpected reject: " + JSON.stringify(action));
    logs.push(result);
    state = result.state;
  }
  return { state, logs };
}
const narration = (result) => result.events.filter((event) => event.type === "narration").map((event) => event.data.textId);
const base = run(start(), INTRO).state;

assert.deepEqual(validateData(worldData), []);
assert.deepEqual(checkDataCompatibility(base, worldData), []);
assert.equal(offered(base, WATCH), false, "no help before a real village decision");
assert.equal(offered(base, INQUIRY), false, "no help before a real village decision");
assert.equal(start().flags?.spring_watch_requested, undefined, "new game must not seed the decision");
assert.equal(start().flags?.spring_inquiry_requested, undefined);

for (const [action, id, npc, grant, tag, text] of [
  ["act_request_spring_watch", WATCH, "npc_elder", "item_lantern", "spring_watch_lantern_loaned", "txt_spring_watch_lantern"],
  ["act_request_spring_inquiry", INQUIRY, "npc_herbalist", "item_purifying_herb", "spring_inquiry_herb_given", "txt_spring_inquiry_herb"]
]) {
  const decided = run(base, [P(action)]).state;
  assert.equal(offered(decided, id), true, "the chosen village response opens NPC support");
  assert.equal(offered(decided, id === WATCH ? INQUIRY : WATCH), false, "opposite branch stays closed");
  const atNpc = id === INQUIRY ? run(decided, [M("loc_market")]).state : decided;
  const talkAction = id === WATCH ? "act_talk_elder" : "act_talk_herbalist";
  const talking = run(atNpc, [P(talkAction)]).state;
  const beforeRng = structuredClone(talking.rng);
  const beforeItem = item(talking, grant);
  const granted = step(talking, C(id), worldData);
  assert.ok(!granted.events.some((event) => event.type === "action.rejected"));
  const received = granted.state;
  assert.equal(item(received, grant), beforeItem + 1, "real inventory changes");
  assert.ok(edge(received, npc).tags.includes(tag), "personal relation records the grant");
  assert.ok(narration(granted).includes(text), "NPC visibly explains the grant");
  assert.equal(received.time.minute, talking.time.minute + 10);
  assert.deepEqual(received.rng, beforeRng, "dialogue grants consume no RNG");
  assert.equal(offered(received, id), false, "one grant per character");
  const repeatedTalk = run(received, [P(talkAction)]).state;
  const repeat = step(repeatedTalk, C(id), worldData);
  assert.ok(repeat.events.some((event) => event.type === "action.rejected"),
    "repeating the dialogue must not duplicate the item");
  assert.deepEqual(repeat.state, repeatedTalk);
  assert.deepEqual(validateState(received), []);
  assert.deepEqual(saveLoad(received), received, "existing Save roundtrip preserves the grant");
  assert.deepEqual(run(start(), [...INTRO, P(action), ...(id === INQUIRY ? [M("loc_market")] : []),
    P(talkAction), C(id)]).state, received, "same seed and actions are deterministic");
  const resolved = structuredClone(received);
  resolved.cases.case_fouled_well = { stage: "resolved", since: resolved.time.minute };
  assert.equal(offered(resolved, id), false, "a resolved spring does not hand out old preparation");

  // World decisions outlive the teller, but neither the rumor nor their grant is inherited.
  const dying = structuredClone(received);
  dying.actors[dying.player.actorId].alive = false;
  dying.pending = { kind: "newCharacter" };
  const heir = run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.equal(heir.flags[id === WATCH ? "spring_watch_requested" : "spring_inquiry_requested"], true);
  assert.equal(heir.knowledge?.[heir.player.actorId]?.rum_well_source, undefined);
  assert.equal(edge(heir, npc)?.tags?.includes(tag) ?? false, false);
  assert.equal(offered(heir, id), false, "successor cannot claim a private rumor or grant");
}

// Buying a lantern first prevents duplicate watch supplies; inquiry still offers a herb.
const watch = run(base, [P("act_request_spring_watch")]).state;
const equipped = structuredClone(watch);
me(equipped).inventory.item_lantern = 1;
assert.equal(offered(equipped, WATCH), false, "the elder does not give redundant lanterns");
assert.deepEqual(saveLoad(start()), start(), "older-style state remains loadable");
console.log("J3 judgment -> NPC supply consequences: PASS");
