// The story-career measurement must use the pack's real ferry choices and elder trust gate.
import assert from "node:assert/strict";
import { createInitialState } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { worldData as d } from "../../web/v2/data/world.js";
import { run, TO_TOWN, toTown } from "./measure/story-careers.mjs";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const actor = (s) => s.actors[s.player.actorId];
const letterCount = (s) => actor(s).inventory?.item_passage_letter ?? 0;
const withMoney = (state, money) => {
  const s = structuredClone(state);
  s.actors[s.player.actorId].money = money;
  return s;
};

const town = run(createInitialState({ worldSeed: "inj-9", data: d }).state, TO_TOWN);
assert.equal(actor(town).locationId, "loc_castle_town", "the measured opening reaches town");
const south = run(town, [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village")]);
assert.equal(actor(south).locationId, "loc_village");
assert.equal(letterCount(south), 0);
const letterOption = d.choices.choice_elder_dialogue.options.find((o) => o.id === "opt_elder_letter");
const canAsk = (s) => evaluateCondition(letterOption.requires, { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
assert.equal(canAsk(south), true, "the opening earns the elder's trust and knows the ford");

const paid = toTown(withMoney(south, 3));
assert.equal(actor(paid).locationId, "loc_castle_town", "an affordable fare uses the paid crossing");
assert.equal(actor(paid).money, 0);
assert.equal(letterCount(paid), 0);

const poor = toTown(withMoney(south, 0));
assert.equal(actor(poor).locationId, "loc_castle_town", "a trusted poor character can ask for a letter");
assert.equal(actor(poor).money, 0, "the letter crossing charges no invented fare");
assert.equal(letterCount(poor), 1, "the elder's real choice issues the letter");

const issued = run(south, [P("act_talk_elder"), C("opt_elder_letter")]);
assert.equal(letterCount(issued), 1);
const held = toTown(withMoney(issued, 0));
assert.equal(actor(held).locationId, "loc_castle_town", "a held letter works even with no silver");
assert.equal(actor(held).money, 0);
assert.equal(letterCount(held), 1, "the passage letter is permanent");

const untrusted = withMoney(south, 0);
const elderEdge = `npc_elder:${untrusted.player.actorId}`;
assert.ok((untrusted.relations?.[elderEdge]?.score ?? 0) >= 15);
delete untrusted.relations[elderEdge];
assert.equal(canAsk(untrusted), false, "a successor without trust cannot ask for a letter");
const blocked = toTown(untrusted);
assert.equal(actor(blocked).locationId, "loc_river_ford", "without money or elder trust, this policy remains south");
assert.equal(actor(blocked).money, 0);
assert.equal(letterCount(blocked), 0);
assert.equal(blocked.relations?.[elderEdge], undefined, "travel does not invent elder trust");

console.log("story-career passage routes pass");
