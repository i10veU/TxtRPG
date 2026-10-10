// V2-Core-126 (#309, Road News step 1b -- what the guard knows, in words): the pack gives a word to every id the UI can show
// (web/v2/ui/app.js resolves `texts.lbl_*`; no id reaches the screen). Pinned:
//   1. the growth system: every stat, practice, skill, mastery tier, trait, unlock and resource; every gear slot; every
//      background (characterTemplate);
//   2. knowledge: every rumour (its claim as told), and every source a rumour Effect names -- a source's own word, else a
//      person (data.npcs[...].name) or a place seen (`obs_loc_<location>`, data.locations[...].name);
//   3. the labels are words, not ids, and a choice's `relevantFacts` names facts the pack has (UI metadata the engine does not
//      read: the pack still validates).
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { validateData } from "../../web/v2/core/rules.js";
import { worldData } from "../../web/v2/data/world.js";

const texts = worldData.texts;
const growth = worldData.growthSystems[worldData.world.growthSystemId];
const ID = /\b(rum|txt|lbl|npc|obs|src|loc|act|opt|fact|unl|evt|item|start)_[a-z0-9_]+\b/;
const has = (key) => typeof texts[key] === "string" && texts[key].length > 0 && !ID.test(texts[key]) && !/[a-z]{3,}/.test(texts[key]);

// every `source` a rumour Effect names, wherever it sits in the pack
function sources(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => sources(n, out));
  else if (node && typeof node === "object") {
    if (node.op === "rumor" && typeof node.source === "string") out.add(node.source);
    Object.values(node).forEach((n) => sources(n, out));
  }
  return out;
}

function testGrowthAndMenus() {
  assert.deepStrictEqual(validateData(worldData), []);
  const want = [
    ...growth.stats.map((s) => `lbl_stat_${s.id}`),
    ...growth.proficiencies.map((p) => `lbl_prof_${p.id}`),
    ...growth.skills.map((s) => `lbl_skill_${s.id}`),
    ...growth.masteryTiers.map((t) => `lbl_tier_${t.label.toLowerCase()}`),
    ...growth.traits.map((t) => `lbl_trait_${t.id}`),
    ...growth.unlocks.map((u) => `lbl_unlock_${u.id}`),
    ...growth.resources.map((r) => `lbl_res_${r.id}`),
    ...[...new Set(Object.values(worldData.items).map((i) => i.slot).filter(Boolean))].map((slot) => `lbl_slot_${slot}`),
    ...Object.keys(worldData.characterTemplates).map((t) => `lbl_tmpl_${t}`)
  ];
  assert.strictEqual(want.length, 27, "6 stats, 3 practices, 3 skills, 4 tiers, 4 traits, 2 unlocks, a resource, 2 slots, 2 backgrounds");
  for (const key of want) assert.ok(has(key), `${key} has a word`);
}

function testKnowledge() {
  for (const id of Object.keys(worldData.rumors)) assert.ok(has(`lbl_rumor_${id}`), `${id}: its claim, in words`);
  const used = sources(worldData);
  assert.ok(used.size >= 15, `the pack's sources (${used.size})`);
  for (const source of used) {
    const own = has(`lbl_src_${source}`);
    const person = typeof worldData.npcs[source]?.name === "string";
    const place = source.startsWith("obs_loc_") && typeof worldData.locations[source.slice(4)]?.name === "string";
    assert.ok(own || person || place, `${source}: who or where`);
  }
  for (const [id, choice] of Object.entries(worldData.choices)) {
    for (const fact of choice.relevantFacts ?? []) assert.ok(Object.hasOwn(worldData.facts, fact), `${id} bears on ${fact}`);
  }
  assert.deepStrictEqual(worldData.choices.choice_guild_clerk_dialogue.relevantFacts, ["fact_road_north"], "the clerk's choice bears on the road");
}

testGrowthAndMenus();
testKnowledge();
console.log("V2-Core-126 data-world-labels.test.js: all checks passed");
