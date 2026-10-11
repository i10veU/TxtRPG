// V2-Core-131 (D-112, MG-045/046): knowledge keeps the day of the event it is about (`aboutDay`) apart from the days it
// was heard (firstSeenDay / lastSeenDay). Opt-in on the rumor Effect (`about: "now"`); the copy form carries it on; an
// unknown day is never invented. node:assert/strict only (§13.1).
import assert from "node:assert/strict";
import { applyEffects } from "../../web/v2/core/rules.js";
import { validateState } from "../../web/v2/core/engine.js";

const data = {
  rumors: { rum_w: { factId: "fact_w", claim: "wanted" }, rum_e: { factId: "fact_w", claim: "enough" } },
  rules: {}
};
const at = (day, knowledge = {}) => ({
  schemaVersion: 1,
  worldSeed: "about-day",
  rng: { seed: 1, cursor: 0 },
  time: { minute: day * 1440 + 60 },
  player: { actorId: "player_1" },
  actors: { player_1: { id: "player_1", hp: { current: 10, max: 10 }, money: 0, inventory: {}, growth: {} } },
  knowledge
});
const run = (state, effects) => applyEffects(effects, { state, data, actorId: "player_1" }).state;

// 1. learned "about now": the event's day is today, beside the days heard
{
  const s = run(at(4), [{ op: "rumor", rumor: "rum_w", source: "npc_m", confidence: 80, about: "now" }]);
  const k = s.knowledge.player_1.rum_w;
  assert.equal(k.aboutDay, 4);
  assert.equal(k.firstSeenDay, 4);
  assert.equal(k.lastSeenDay, 4);
}

// 2. no `about`: no aboutDay key at all (unknown is not filled in) -- the entry is exactly what it was before D-112
{
  const s = run(at(4), [{ op: "rumor", rumor: "rum_w", source: "npc_m", confidence: 80 }]);
  assert.equal(Object.hasOwn(s.knowledge.player_1.rum_w, "aboutDay"), false);
  assert.deepEqual(validateState(s), []);
}

// 3. an NPC's own knowledge (a subject that is not the player), passed on later: the copy keeps the day it is about and
//    takes today as the day heard; the source is the one who told it
{
  let s = run(at(2), [{ op: "rumor", rumor: "rum_w", subject: "npc_f", source: "npc_m", confidence: 70, about: "now" }]);
  assert.equal(s.knowledge.npc_f.rum_w.aboutDay, 2);
  assert.equal(s.knowledge.player_1, undefined, "the NPC's knowledge is not the player's");
  s = run({ ...s, time: { minute: 5 * 1440 } }, [{ op: "rumor", rumor: "rum_w", from: "npc_f" }]);
  const k = s.knowledge.player_1.rum_w;
  assert.equal(k.aboutDay, 2, "three days old when heard");
  assert.equal(k.lastSeenDay, 5);
  assert.deepEqual(k.sources, ["npc_f"]);
  assert.deepEqual(validateState(s), []);
}

// 4. a copy of a word whose day is unknown stays unknown
{
  let s = run(at(1), [{ op: "rumor", rumor: "rum_w", subject: "npc_f", source: "npc_m", confidence: 70 }]);
  s = run({ ...s, time: { minute: 3 * 1440 } }, [{ op: "rumor", rumor: "rum_w", from: "npc_f" }]);
  assert.equal(Object.hasOwn(s.knowledge.player_1.rum_w, "aboutDay"), false);
}

// 5. the same word about a later day moves aboutDay on; an older relay never moves it back (but still counts as heard)
{
  let s = run(at(6), [{ op: "rumor", rumor: "rum_w", source: "npc_m", confidence: 80, about: "now" }]);
  s = run({ ...s, knowledge: { ...s.knowledge, npc_f: { rum_w: { ...s.knowledge.player_1.rum_w, aboutDay: 3, sources: ["npc_m"] } } }, time: { minute: 8 * 1440 } }, [{ op: "rumor", rumor: "rum_w", from: "npc_f" }]);
  assert.equal(s.knowledge.player_1.rum_w.aboutDay, 6, "older news does not make the belief older");
  assert.equal(s.knowledge.player_1.rum_w.lastSeenDay, 8);
  s = run({ ...s, time: { minute: 9 * 1440 } }, [{ op: "rumor", rumor: "rum_w", source: "npc_m", confidence: 80, about: "now" }]);
  assert.equal(s.knowledge.player_1.rum_w.aboutDay, 9);
}

// 6. two claims about one fact live side by side (one rumour per claim, as the road news does); which is newer is the
//    event's day, not the day heard -- the UI and policies read aboutDay ?? lastSeenDay
{
  let s = run(at(2), [{ op: "rumor", rumor: "rum_e", subject: "npc_f", source: "npc_m", confidence: 70, about: "now" }]);
  s = run({ ...s, time: { minute: 4 * 1440 } }, [{ op: "rumor", rumor: "rum_w", source: "npc_m", confidence: 80, about: "now" }]);
  s = run({ ...s, time: { minute: 5 * 1440 } }, [{ op: "rumor", rumor: "rum_e", from: "npc_f" }]);
  const { rum_w: w, rum_e: e } = s.knowledge.player_1;
  assert.ok(e.lastSeenDay > w.lastSeenDay, "the relayed word was heard later");
  assert.ok(w.aboutDay > e.aboutDay, "but the merchant's own word is about a later day");
}

// 7. malformed: about must be "now", and the copy form takes no about
assert.throws(() => run(at(0), [{ op: "rumor", rumor: "rum_w", source: "npc_m", confidence: 80, about: 3 }]), TypeError);
assert.throws(() => run(at(0), [{ op: "rumor", rumor: "rum_w", from: "npc_f", about: "now" }]), TypeError);

console.log("knowledge-about-day: ok");
