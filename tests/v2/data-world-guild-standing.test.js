// V2-Core-92 (#226, RPG Depth 1, step 1 -- the guild remembers its guards): through the ordinary step() API and the
// real pack. No engine change; additive content only (D-92/D-99):
//   a good escort (great or success) builds the character's standing with the merchants' guild clerk -- a relation
//   edge clerk -> self, +5 each (a failure adds nothing). A guard the guild knows (standing 10: two good escorts) is
//   paid one silver more, and the clerk says so. The standing is the character's own (D-71): a successor starts
//   unknown. The world allows three escorts (one guard per caravan, three caravans), so a career reaches the bonus
//   on the third. Standing, threshold and pay are gameplay values; the clerk's words are Provisional.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const CLERK = (optionId) => [P("act_talk_guild_clerk"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
// history-41: the dispersal, the crossing, the road north -- data-world-caravan-guard
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
// the escort, then back to the town and three days for the next caravan (stamina restored by the time)
const ESCORT = [...CLERK("opt_guild_clerk_escort"), M("loc_castle_town")];
const NEXT_CARAVAN = [DAY, DAY, DAY];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const me = (s) => s.actors[s.player.actorId];
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const tier = (result) => result.events.find((e) => e.type === "check.resolved")?.data.tier;
const withStr = (s, str) => { const c = structuredClone(s); me(c).growth.growth_wanderer.stats.str = str; return c; };
const rested = (s) => { const c = structuredClone(s); const st = me(c).growth.growth_wanderer.resources.stamina; st.current = st.max ?? 6; return c; };
const escort = (s) => { const r = run(rested(s), ESCORT); return { state: r.state, result: r.log[1] }; };

const town = withStr(run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state, 30);

// 1. a career of good escorts: unknown, known after two, the bonus on the third
function testCareer() {
  assert.strictEqual(standing(town), undefined, "unknown to the guild");
  const first = escort(town);
  assert.strictEqual(tier(first.result), "great");
  assert.strictEqual(me(first.state).money - me(town).money, 6, "the plain pay");
  assert.strictEqual(standing(first.state), 5);
  assert.ok(!texts(first.result).includes("txt_escort_known_bonus"));
  assert.ok(!texts(run(first.state, CLERK("opt_guild_clerk_ask")).log[1]).includes("txt_guild_clerk_knows_you"), "one escort: not yet known");
  const second = escort(run(first.state, NEXT_CARAVAN).state);
  assert.strictEqual(standing(second.state), 10);
  assert.ok(!texts(second.result).includes("txt_escort_known_bonus"), "the bonus is for one already known");
  const asked = run(second.state, CLERK("opt_guild_clerk_ask"));
  assert.ok(texts(asked.log[1]).includes("txt_guild_clerk_knows_you"), "known now");
  const before = run(second.state, NEXT_CARAVAN).state;
  const third = escort(before);
  assert.ok(texts(third.result).includes("txt_escort_known_bonus"));
  assert.strictEqual(me(third.state).money - me(before).money, 7, "one silver more");
  assert.strictEqual(standing(third.state), 15);
  return third.state;
}

// 2. only a good escort counts: a success counts as a great one does; a failure earns pay and wounds, no standing
function testFailureCounts() {
  const ok = escort(withStr(town, 14));
  assert.strictEqual(tier(ok.result), "success");
  assert.strictEqual(standing(ok.state), 5, "a success counts");
  const weak = withStr(town, 1);
  const failed = escort(weak);
  assert.notStrictEqual(tier(failed.result), "great");
  assert.ok(["fail", "partial"].includes(tier(failed.result)));
  assert.strictEqual(standing(failed.state), undefined, "no standing from a failed escort");
  // a known guard who fails is still paid the failure's pay, with no bonus
  const known = structuredClone(weak);
  known.relations[`npc_guild_clerk:${known.player.actorId}`] = { score: 10 };
  const k = escort(known);
  assert.ok(!texts(k.result).includes("txt_escort_known_bonus"), "the bonus is for good work");
  assert.strictEqual(standing(k.state), 10);
}

// 3. the standing is the character's: a successor starts unknown
function testSuccessor(career) {
  let s = career;
  for (const to of ["loc_far_bank", "loc_river_ford", "loc_crossroads", "loc_village", "loc_ruins"]) s = run(s, [M(to)]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(standing(next), undefined, "a new character is unknown to the guild");
  assert.strictEqual(next.relations[`npc_guild_clerk:player_1`].score, 15, "the predecessor's standing stays theirs");
  // in the town, the clerk does not know this one
  const inTown = structuredClone(next);
  me(inTown).locationId = "loc_castle_town";
  assert.ok(!texts(run(inTown, CLERK("opt_guild_clerk_ask")).log[1]).includes("txt_guild_clerk_knows_you"));
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  const first = escort(town).state;
  const rest = (s) => run(rested(run(s, NEXT_CARAVAN).state), [...ESCORT, ...CLERK("opt_guild_clerk_ask")]).state;
  const end = rest(first);
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_guild", first, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, first);
  assert.deepStrictEqual(rest(loaded), end, "loaded, the same end");
  const again = withStr(run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state, 30);
  assert.deepStrictEqual(rest(escort(again).state), end, "the same input, the same world");
}

const career = testCareer();
testFailureCounts();
testSuccessor(career);
testSaveAndDeterminism();
console.log("V2-Core-92 data-world-guild-standing.test.js: all checks passed");
