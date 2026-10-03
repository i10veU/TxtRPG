// V2-Core-58 (Issue #150, #147 Phase B, D-87): the first equipment in the real pack -- an iron sword.
//   - `item_iron_sword` (slot `hand`), 3 silver at the market: owning it changes nothing yet
//   - "철검을 든다" equips it (any place), "철검을 내려놓는다" unequips it -- ordinary actions with
//     the `equip` / `unequip` Effects; counts never change
//   - while it is equipped the fight offers "철검으로 베어 든다": the strike's check at base 10 (the
//     bare-handed strike's 11), the strike's outcomes; unequipped, the technique is refused again
//   - the sword has no modifier (no double count with anything); the lantern (slotless) keeps its +1
//   - a save without a loadout has nothing equipped; the leader has none; a successor starts with none
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });
const BUY = [MOVE("loc_market"), P("act_buy_iron_sword")];
const EQUIP = P("act_equip_iron_sword");
const UNEQUIP = P("act_unequip_iron_sword");
const CUT = CHOOSE("opt_fight_sword_cut");
const option = (id) => worldData.choices.choice_fight_leader.options.find((o) => o.id === id);

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const start = (templateId, seed = "equipment-1") => createInitialState({ worldSeed: seed, data: worldData, templateId }).state;
const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
const me = (state) => state.actors[state.player.actorId];
const typesOf = (result) => result.events.map((e) => e.type);
// the same character, put in the fight (the leader made hard to fell, so the fight continues)
function inFight(state) {
  const s = structuredClone(state);
  me(s).locationId = "loc_ruins";
  s.actors.npc_bandit_leader.hp = { current: 99, max: 99 };
  me(s).hp = { current: 99, max: 99 };
  s.pending = { kind: "choice", choiceId: "choice_fight_leader", sourceId: "act_fight_leader" };
  return s;
}
const checkOf = (result) => result.events.find((e) => e.type === "check.resolved").data;

// 1. the data
function testData() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.version, "0.3.0", "no version bump");
  assert.deepStrictEqual(worldData.items.item_iron_sword, { name: "철검", slot: "hand" }, "equipment, no modifier");
  assert.strictEqual(worldData.items.item_lantern.slot, undefined, "the lantern stays a held item");
  const cut = option("opt_fight_sword_cut");
  const strike = option("opt_fight_strike");
  assert.strictEqual(cut.name, "철검으로 베어 든다");
  assert.deepStrictEqual(cut.requires, { op: "item", item: "item_iron_sword", equipped: true });
  assert.deepStrictEqual(cut.check, { ...strike.check, difficulty: { base: 10, opposed: { subject: "npc_bandit_leader", stat: "str" } } });
  assert.deepStrictEqual(cut.outcomes, strike.outcomes, "the strike's blow, with a blade");
  assert.strictEqual(cut.minutes, strike.minutes);
  assert.strictEqual(worldData.npcs.npc_bandit_leader.actor.loadout, undefined, "no NPC equipment (Phase D)");
}

// 2. acquire -> equip -> the technique -> use -> unequip -> gone; counts never change
function testFlow() {
  const bought = run(start("start_wanderer"), BUY);
  bought.log.forEach((r) => assert.strictEqual(rejectedCode(r), undefined));
  assert.strictEqual(me(bought.state).money, 5, "8 - 3");
  assert.deepStrictEqual(me(bought.state).inventory, { item_iron_sword: 1 });
  assert.strictEqual(me(bought.state).loadout, undefined, "owning is not wielding");

  // owned, not equipped: the technique is refused, the strike is not
  const unarmed = inFight(bought.state);
  const refused = step(unarmed, CUT, worldData);
  assert.strictEqual(rejectedCode(refused), "requirements_not_met");
  assert.deepStrictEqual(refused.state, unarmed, "the fight still waits, nothing changed");
  assert.strictEqual(rejectedCode(step(unarmed, CHOOSE("opt_fight_strike"), worldData)), undefined);

  // equip: the loadout names it; the inventory is unchanged
  const equipped = step(bought.state, EQUIP, worldData);
  assert.strictEqual(rejectedCode(equipped), undefined);
  assert.deepStrictEqual(typesOf(equipped), ["item.equipped", "narration", "action.resolved"]);
  assert.deepStrictEqual(me(equipped.state).loadout, { hand: "item_iron_sword" });
  assert.deepStrictEqual(me(equipped.state).inventory, { item_iron_sword: 1 });
  assert.strictEqual(rejectedCode(step(equipped.state, EQUIP, worldData)), "requirements_not_met", "already in hand");

  // the technique: offered, base 10 against the strike's 11 on the same roll, no extra modifier
  const armed = inFight(equipped.state);
  const cut = step(armed, CUT, worldData);
  const strike = step(armed, CHOOSE("opt_fight_strike"), worldData);
  assert.strictEqual(rejectedCode(cut), undefined);
  assert.strictEqual(checkOf(cut).difficulty, 10);
  assert.strictEqual(checkOf(strike).difficulty, 11);
  assert.strictEqual(checkOf(cut).total, checkOf(strike).total, "the same roll");
  assert.deepStrictEqual(checkOf(cut).modifiers, checkOf(strike).modifiers, "the sword adds no modifier");
  assert.ok(!checkOf(cut).modifiers.some((m) => m.source.startsWith("item:")));
  assert.strictEqual(me(cut.state).growth.growth_wanderer.proficiency.combat, 5, "an exchange like any other");
  assert.deepStrictEqual(me(cut.state).loadout, { hand: "item_iron_sword" }, "still in hand after use");

  // unequip: the technique is gone again; the sword is still owned
  const lowered = step(equipped.state, UNEQUIP, worldData);
  assert.deepStrictEqual(typesOf(lowered), ["item.unequipped", "narration", "action.resolved"]);
  assert.deepStrictEqual(me(lowered.state).loadout, {});
  assert.deepStrictEqual(me(lowered.state).inventory, { item_iron_sword: 1 });
  assert.strictEqual(rejectedCode(step(inFight(lowered.state), CUT, worldData)), "requirements_not_met");
  assert.strictEqual(rejectedCode(step(lowered.state, UNEQUIP, worldData)), "requirements_not_met", "nothing to lower");
}

// 3. who can: without the sword nothing to equip; the scout (3 silver) can buy it too
function testWhoCan() {
  assert.strictEqual(rejectedCode(step(start("start_wanderer"), EQUIP, worldData)), "requirements_not_met");
  const scout = run(start("start_scout"), [...BUY, EQUIP]);
  scout.log.forEach((r) => assert.strictEqual(rejectedCode(r), undefined));
  assert.strictEqual(me(scout.state).money, 0);
  assert.deepStrictEqual(me(scout.state).loadout, { hand: "item_iron_sword" });
  assert.strictEqual(rejectedCode(step(scout.state, P("act_buy_iron_sword"), worldData)), "requirements_not_met", "no money left");
  // the market's other purchase is unchanged: the lantern still costs 5 and still helps the search
  const lit = run(start("start_wanderer"), [MOVE("loc_market"), P("act_buy_lantern"), P("act_buy_iron_sword"), EQUIP]);
  lit.log.forEach((r) => assert.strictEqual(rejectedCode(r), undefined));
  assert.strictEqual(me(lit.state).money, 0);
  assert.deepStrictEqual(me(lit.state).inventory, { item_lantern: 1, item_iron_sword: 1 });
}

// 4. the lantern (slotless) still helps as held; the sword, equipped or not, adds no search modifier
function testItemSemanticsUnchanged() {
  const searchModifiers = (state) => {
    const s = structuredClone(state);
    me(s).locationId = "loc_ruins";
    s.knowledge = { [s.player.actorId]: { rum_ruins_secret: { factId: "fact_ruins_secret", claim: "bandit_hideout", confidence: 60, sources: ["npc_elder"], confirmations: 1 } } };
    const r = step(s, P("act_investigate_ruins"), worldData);
    assert.strictEqual(rejectedCode(r), undefined);
    return checkOf(r).modifiers.filter((m) => m.source.startsWith("item:"));
  };
  const both = run(start("start_wanderer"), [MOVE("loc_market"), P("act_buy_lantern"), P("act_buy_iron_sword")]).state;
  assert.deepStrictEqual(searchModifiers(both), [{ source: "item:item_lantern", value: 1 }]);
  assert.deepStrictEqual(searchModifiers(run(both, [EQUIP]).state), [{ source: "item:item_lantern", value: 1 }]);
}

// 5. save/load keeps the loadout; a save without one has nothing equipped; succession starts empty
function testSaveAndSuccession() {
  const equipped = run(start("start_wanderer"), [...BUY, EQUIP]).state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_sword", equipped, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, equipped);
  assert.deepStrictEqual(validateState(loaded), []);
  assert.strictEqual(rejectedCode(step(inFight(loaded), CUT, worldData)), undefined);

  const old = run(start("start_wanderer"), BUY).state; // no loadout key at all, like any save before V2-Core-58
  assert.strictEqual("loadout" in me(old), false);
  const oldLoaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_old", old, { savedAt: 1 }))));
  assert.deepStrictEqual(checkDataCompatibility(oldLoaded, worldData), []);
  assert.strictEqual(rejectedCode(step(inFight(oldLoaded), CUT, worldData)), "requirements_not_met", "nothing equipped");
  assert.deepStrictEqual(me(run(oldLoaded, [EQUIP]).state).loadout, { hand: "item_iron_sword" }, "and can equip as usual");

  // the character falls with the sword in hand; the successor holds and wields nothing of it
  let dead = structuredClone(equipped);
  me(dead).locationId = "loc_ruins"; // the ruins' hazard, on a character with 1 HP
  me(dead).hp.current = 1;
  for (let i = 0; i < 12 && dead.pending?.kind !== "newCharacter"; i += 1) dead = step(dead, { type: "wait", minutes: 30 }, worldData).state;
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  const heir = step(dead, { type: "startCharacter", templateId: "start_wanderer" }, worldData).state;
  assert.strictEqual("loadout" in me(heir), false);
  assert.deepStrictEqual(me(heir).inventory, {});
  assert.deepStrictEqual(heir.actors.player_1.loadout, { hand: "item_iron_sword" }, "the fallen keeps theirs");
}

// 6. determinism: the same input, the same result
function testDeterminism() {
  const actions = [...BUY, EQUIP, UNEQUIP, EQUIP];
  assert.deepStrictEqual(run(start("start_wanderer"), actions), run(start("start_wanderer"), actions));
  const armed = inFight(run(start("start_wanderer"), [...BUY, EQUIP]).state);
  assert.deepStrictEqual(step(armed, CUT, worldData), step(armed, CUT, worldData));
}

testData();
testFlow();
testWhoCan();
testItemSemanticsUnchanged();
testSaveAndSuccession();
testDeterminism();

console.log("V2-Core-58 data-world-equipment.test.js: all checks passed");
