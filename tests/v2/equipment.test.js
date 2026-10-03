// V2-Core-58 (Issue #150, #147 Phase B, D-87): equipment is a loadout of inventory references.
//   data:  items[id].slot = "<slot id>" marks an item as equipment (the world names its slots)
//   state: actors[id].loadout = { <slot>: <itemId> } -- one item per slot; absent = empty
//   Effect {op:"equip", item, subject?}: an item the actor holds, with a slot, goes into that slot
//     (replacing what was there, which stays in the inventory); counts never change. Not held or no
//     slot: skip (D-29). Already there: nothing (D-30). Event `item.equipped` {item, slot, replaced?}
//   Effect {op:"unequip", item, subject?}: empties the slot holding it; not equipped: nothing.
//     Event `item.unequipped` {item, slot}
//   item Effect: a count that reaches 0 also unequips the item (the loadout never names an item the
//     actor does not hold) -- `item.changed`, then `item.unequipped`
//   Condition {op:"item", item, equipped: true}: held (count args as before) AND in the loadout
//   check(): a slotted item's modifiers count only while equipped; a slotless item's as before (D-10).
//     Each item counts at most once.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1). Abstract fixtures, not world content.

import assert from "node:assert/strict";
import { applyEffects, check, evaluateCondition, validateData } from "../../web/v2/core/rules.js";

const DATA = {
  world: { growthSystemId: "growth_a" },
  items: {
    item_blade: { slot: "slot_hand", modifiers: [{ tags: ["tag_x"], value: 2 }] },
    item_club: { slot: "slot_hand" },
    item_cloak: { slot: "slot_body" },
    item_charm: { modifiers: [{ tags: ["tag_x"], value: 1 }] }
  }
};
const actor = (id, inventory = {}, loadout) => ({
  id, hp: { current: 5, max: 5 }, money: 0, inventory, growth: {}, ...(loadout ? { loadout } : {})
});
const stateOf = (actors) => ({
  schemaVersion: 1, worldSeed: "equipment", rng: { seed: 3, cursor: 0 }, time: { minute: 9 },
  player: { actorId: "player_1" }, actors: Object.fromEntries(actors.map((a) => [a.id, a]))
});
const ctx = (state) => ({ state, data: DATA, actorId: "player_1", contextKind: "player" });
const apply = (state, ...effects) => applyEffects(effects, ctx(state));
const loadoutOf = (result, who = "player_1") => result.state.actors[who].loadout;

// 1. equip: into the item's slot; counts unchanged; replacing keeps the old item held
function testEquip() {
  const held = stateOf([actor("player_1", { item_blade: 1, item_club: 2 })]);
  const blade = apply(held, { op: "equip", item: "item_blade" });
  assert.deepStrictEqual(loadoutOf(blade), { slot_hand: "item_blade" });
  assert.deepStrictEqual(blade.state.actors.player_1.inventory, { item_blade: 1, item_club: 2 }, "no inventory mutation");
  assert.deepStrictEqual(blade.events, [{ minute: 9, type: "item.equipped", visibility: "player", actorId: "player_1", data: { item: "item_blade", slot: "slot_hand" } }]);
  assert.strictEqual(held.actors.player_1.loadout, undefined, "input untouched");

  const club = apply(blade.state, { op: "equip", item: "item_club" });
  assert.deepStrictEqual(loadoutOf(club), { slot_hand: "item_club" }, "one item per slot");
  assert.deepStrictEqual(club.events[0].data, { item: "item_club", slot: "slot_hand", replaced: "item_blade" });
  assert.deepStrictEqual(club.state.actors.player_1.inventory, { item_blade: 1, item_club: 2 });

  const again = apply(blade.state, { op: "equip", item: "item_blade" });
  assert.deepStrictEqual([again.state, again.events], [blade.state, []], "already equipped: nothing (D-30)");

  // two slots side by side
  const both = apply(stateOf([actor("player_1", { item_blade: 1, item_cloak: 1 })]), { op: "equip", item: "item_blade" }, { op: "equip", item: "item_cloak" });
  assert.deepStrictEqual(loadoutOf(both), { slot_hand: "item_blade", slot_body: "item_cloak" });

  // D-29: not held, no slot, unknown item, no actor -- skip
  for (const effect of [{ item: "item_cloak" }, { item: "item_charm" }, { item: "item_none" }, { item: "item_blade", subject: "npc_nobody" }]) {
    const r = apply(held, { op: "equip", ...effect });
    assert.deepStrictEqual([r.state, r.events], [held, []], JSON.stringify(effect));
  }
  const charm = stateOf([actor("player_1", { item_charm: 1 })]);
  const slotless = apply(charm, { op: "equip", item: "item_charm" });
  assert.deepStrictEqual([slotless.state, slotless.events], [charm, []], "held but without a slot: not equipment");
  // D-28: malformed
  assert.throws(() => apply(held, { op: "equip" }), TypeError);
  assert.throws(() => apply(held, { op: "equip", item: "item_blade", subject: 1 }), TypeError);
  // subject: an NPC's own loadout, internal
  const npc = apply(stateOf([actor("player_1"), actor("npc_1", { item_blade: 1 })]), { op: "equip", item: "item_blade", subject: "npc_1" });
  assert.deepStrictEqual(loadoutOf(npc, "npc_1"), { slot_hand: "item_blade" });
  assert.strictEqual(npc.events[0].visibility, "internal");
}

// 2. unequip: empties the slot; not equipped -> nothing
function testUnequip() {
  const equipped = stateOf([actor("player_1", { item_blade: 1, item_cloak: 1 }, { slot_hand: "item_blade", slot_body: "item_cloak" })]);
  const off = apply(equipped, { op: "unequip", item: "item_blade" });
  assert.deepStrictEqual(loadoutOf(off), { slot_body: "item_cloak" });
  assert.deepStrictEqual(off.state.actors.player_1.inventory, { item_blade: 1, item_cloak: 1 });
  assert.deepStrictEqual(off.events, [{ minute: 9, type: "item.unequipped", visibility: "player", actorId: "player_1", data: { item: "item_blade", slot: "slot_hand" } }]);
  for (const s of [off.state, stateOf([actor("player_1", { item_blade: 1 })])]) {
    const r = apply(s, { op: "unequip", item: "item_blade" });
    assert.deepStrictEqual([r.state, r.events], [s, []], "not equipped: nothing");
  }
  assert.throws(() => apply(equipped, { op: "unequip" }), TypeError);
}

// 3. losing the item unequips it; losing one of two does not
function testLosingTheItem() {
  const two = stateOf([actor("player_1", { item_club: 2 }, { slot_hand: "item_club" })]);
  const one = apply(two, { op: "item", item: "item_club", add: -1 });
  assert.deepStrictEqual(loadoutOf(one), { slot_hand: "item_club" });
  assert.deepStrictEqual(one.events.map((e) => e.type), ["item.changed"]);
  const none = apply(one.state, { op: "item", item: "item_club", add: -1 });
  assert.deepStrictEqual(none.state.actors.player_1.inventory, {});
  assert.deepStrictEqual(loadoutOf(none), {});
  assert.deepStrictEqual(none.events.map((e) => [e.type, e.data]), [
    ["item.changed", { item: "item_club", delta: -1 }],
    ["item.unequipped", { item: "item_club", slot: "slot_hand" }]
  ]);
  // an actor without a loadout loses items exactly as before
  const plain = apply(stateOf([actor("player_1", { item_charm: 1 })]), { op: "item", item: "item_charm", add: -1 });
  assert.strictEqual(plain.state.actors.player_1.loadout, undefined);
  assert.deepStrictEqual(plain.events.map((e) => e.type), ["item.changed"]);
}

// 4. the Condition: `equipped: true` asks for the loadout; without it, possession as before
function testCondition() {
  const s = stateOf([actor("player_1", { item_blade: 1, item_club: 1 }, { slot_hand: "item_blade" }), actor("npc_1", { item_club: 1 })]);
  const c = (condition) => evaluateCondition({ op: "item", ...condition }, ctx(s));
  assert.strictEqual(c({ item: "item_blade", equipped: true }), true);
  assert.strictEqual(c({ item: "item_club", equipped: true }), false, "held, not equipped");
  assert.strictEqual(c({ item: "item_club" }), true, "possession as before");
  assert.strictEqual(c({ item: "item_cloak", equipped: true }), false, "neither");
  assert.strictEqual(c({ item: "item_blade", equipped: true, min: 2 }), false, "count args still apply");
  assert.strictEqual(c({ item: "item_club", equipped: true, subject: "npc_1" }), false, "the subject's own loadout (none)");
  const npcArmed = stateOf([actor("player_1", { item_club: 1 }), actor("npc_1", { item_club: 1 }, { slot_hand: "item_club" })]);
  assert.strictEqual(evaluateCondition({ op: "item", item: "item_club", equipped: true, subject: "npc_1" }, ctx(npcArmed)), true, "the NPC's loadout");
  assert.strictEqual(evaluateCondition({ op: "item", item: "item_club", equipped: true }, ctx(npcArmed)), false, "not the player's");
  assert.strictEqual(c({ item: "item_blade", equipped: false }), true, "equipped:false is no constraint");
  // a broken save naming an item not held: not equipped
  const broken = stateOf([actor("player_1", {}, { slot_hand: "item_blade" })]);
  assert.strictEqual(evaluateCondition({ op: "item", item: "item_blade", equipped: true }, ctx(broken)), false);
}

// 5. check(): slotted modifiers only while equipped, slotless always, never twice
function testModifiers() {
  const modsOf = (state) => check({ tags: ["tag_x"], difficulty: 10 }, ctx(state)).result.modifiers;
  assert.deepStrictEqual(modsOf(stateOf([actor("player_1", { item_blade: 1, item_charm: 1 })])), [{ source: "item:item_charm", value: 1 }], "the blade in the pack: nothing");
  assert.deepStrictEqual(modsOf(stateOf([actor("player_1", { item_blade: 1, item_charm: 1 }, { slot_hand: "item_blade" })])), [
    { source: "item:item_blade", value: 2 },
    { source: "item:item_charm", value: 1 }
  ], "equipped: once");
  assert.deepStrictEqual(modsOf(stateOf([actor("player_1", { item_blade: 3 }, { slot_hand: "item_blade" })])), [{ source: "item:item_blade", value: 2 }], "a count of 3 is still one blade's bonus");
}

// 6. the validator
function testValidator() {
  const pack = (extra) => ({
    formatVersion: 1, id: "pack_a", version: "1.0.0",
    world: { id: "world_a", growthSystemId: "growth_a", startTemplateId: "tmpl_a" },
    growthSystems: { growth_a: { id: "growth_a" } },
    characterTemplates: { tmpl_a: { kind: "player", locationId: "loc_a", hp: { max: 5 }, growth: {} } },
    locations: { loc_a: { links: [] } },
    items: { item_blade: { slot: "slot_hand" } },
    ...extra
  });
  const withAction = (requires, effects) => pack({ actions: { act_a: { requires, effects } } });
  assert.deepStrictEqual(validateData(pack()), []);
  assert.deepStrictEqual(validateData(withAction({ op: "item", item: "item_blade", equipped: true }, [{ op: "equip", item: "item_blade" }, { op: "unequip", item: "item_blade" }])), []);
  assert.ok(validateData(pack({ items: { item_blade: { slot: "Hand" } } })).some((e) => /invalid id format at items\.item_blade\.slot/.test(e)));
  assert.ok(validateData(pack({ items: { item_blade: { slot: 3 } } })).some((e) => /items\.item_blade\.slot/.test(e)));
  assert.ok(validateData(withAction(undefined, [{ op: "equip" }])).some((e) => /equip Effect .* requires a string `item`/.test(e)));
  assert.ok(validateData(withAction(undefined, [{ op: "unequip" }])).some((e) => /unequip Effect .* requires a string `item`/.test(e)));
  assert.ok(validateData(withAction(undefined, [{ op: "equip", item: "item_blade", subject: 1 }])).some((e) => /`subject`/.test(e)));
  assert.ok(validateData(withAction({ op: "item", item: "item_blade", equipped: "yes" }, [])).some((e) => /item Condition .*`equipped`/.test(e)));
}

testEquip();
testUnequip();
testLosingTheItem();
testCondition();
testModifiers();
testValidator();

console.log("V2-Core-58 equipment.test.js: all checks passed");
