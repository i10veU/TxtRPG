// J3: a public, verified spring-trap decision reaches a second NPC and
// becomes an actual, costed follow-up with persistent world consequences.
import assert from "node:assert/strict";
import { createInitialState, step, view, validateState, checkDataCompatibility } from "../../web/v2/core/engine.js";
import { validateData, actorResource } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const E = (id) => [P("act_talk_elder"), C(id)];
const H = (id) => [P("act_talk_herbalist"), C(id)];
const seed = () => createInitialState({ worldSeed: "herb-30", data: worldData }).state;
const me = (s) => s.actors[s.player.actorId];
const stamina = (s) => actorResource(me(s), worldData, "stamina").current;
const texts = (r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const saveLoad = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-market-aftercare", s, { savedAt: 1 }))));
function run(s, actions) {
  let last;
  for (const action of actions) {
    last = step(s, action, worldData);
    assert.ok(!last.events.some((e) => e.type === "action.rejected"), "rejected: " + JSON.stringify(action));
    s = last.state;
  }
  return { state: s, last };
}
const PATH = [
  ...E("opt_ask_ruins"), P("act_inspect_well"), M("loc_market"),
  ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"),
  M("loc_village"), P("act_request_spring_watch"),
  M("loc_forest_spring"), P("act_search_spring"), M("loc_village"),
  ...E("opt_tell_spring_arrows"), P("act_help_mark_spring_route"),
  ...E("opt_ask_ruins"), M("loc_forest_spring"), P("act_enc_spring_trap_mark"),
  M("loc_village")
];
const OPTIONS = [
  { elder: "opt_elder_trap_reinforce_route", herb: "opt_herbalist_trap_safe_harvest",
    flag: "spring_trap_herbalist_route_supplied", text: "txt_herbalist_trap_safe_harvest", cost: 90,
    staminaCost: 2, item: "item_purifying_herb", amount: 2 },
  { elder: "opt_elder_trap_publish_warning", herb: "opt_herbalist_trap_share_notice",
    flag: "spring_trap_herbalist_notice_shared", text: "txt_herbalist_trap_share_notice", cost: 30,
    staminaCost: 0, item: "item_herbal_salve", amount: 1 }
];

assert.deepEqual(validateData(worldData), []);
for (const cfg of OPTIONS) {
  const committed = run(seed(), [...PATH, ...E(cfg.elder)]).state;
  assert.ok(view(committed, worldData).knowledge?.rum_spring_trap_mark, "personal proof earned");
  const market = run(committed, [M("loc_market")]).state;
  const pending = run(market, [P("act_talk_herbalist")]).state;
  const other = OPTIONS.find((o) => o !== cfg);
  const wrong = step(pending, C(other.herb), worldData);
  assert.ok(wrong.events.some((e) => e.type === "action.rejected"), "wrong world decision cannot be used");
  assert.deepEqual(wrong.state, pending);

  const before = market;
  const done = run(market, H(cfg.herb));
  const after = done.state;
  assert.equal(after.flags[cfg.flag], true, "second NPC makes a durable public contribution");
  assert.equal(after.flags[other.flag], undefined);
  assert.equal(after.time.minute - before.time.minute, cfg.cost);
  assert.equal(stamina(after), stamina(before) - cfg.staminaCost);
  assert.equal((me(after).inventory[cfg.item] ?? 0) - (me(before).inventory[cfg.item] ?? 0), cfg.amount);
  assert.ok(texts(done.last).includes(cfg.text));
  assert.equal(after.relations["npc_herbalist:" + after.player.actorId].tags.includes(cfg.flag), true,
    "herbalist remembers this person's help");
  assert.deepEqual(after.rng, before.rng, "no extra random draws");
  assert.deepEqual(validateState(after), []);
  assert.deepEqual(checkDataCompatibility(after, worldData), []);
  assert.deepEqual(saveLoad(after), after);
  assert.deepEqual(run(seed(), [...PATH, ...E(cfg.elder), M("loc_market"), ...H(cfg.herb)]).state, after,
    "same seed + actions replay identically");
  const again = run(after, [P("act_talk_herbalist")]).state;
  assert.ok(step(again, C(cfg.herb), worldData).events.some((e) => e.type === "action.rejected"),
    "the reward cannot be farmed");
  const publicNews = run(after, H("opt_herbalist_ask_sickness"));
  assert.ok(texts(publicNews.last).includes(cfg.text + "_followup"), "herbalist describes changed world");

  const dying = structuredClone(after);
  dying.actors[dying.player.actorId].alive = false;
  dying.pending = { kind: "newCharacter" };
  const heir = run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.equal(heir.flags[cfg.flag], true, "public outcome persists across lives");
  assert.equal(view(heir, worldData).knowledge?.rum_spring_trap_mark, undefined,
    "a successor never inherits private field knowledge");
  const heirTalk = run(heir, [M("loc_market"), ...H("opt_herbalist_ask_sickness")]);
  assert.ok(texts(heirTalk.last).includes(cfg.text + "_followup"));
  const heirPending = run(heirTalk.state, [P("act_talk_herbalist")]).state;
  assert.ok(step(heirPending, C(cfg.herb), worldData).events.some((e) => e.type === "action.rejected"),
    "successor cannot repeat a world-level one-time benefit");
}
console.log("J3 trap decision -> herbalist aftercare -> persistent economy and NPC response: PASS");
