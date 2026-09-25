const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js",
  "web/data/places.js",
  "web/data/npcs.js",
  "web/data/cases.js",
  "web/core/economy-world.js",
  "web/core/regional-economy.js",
  "web/core/faction-world.js",
  "web/core/organization-world.js",
  "web/core/npc-goals.js",
  "web/core/organization-relations.js",
  "web/core/npc-relations.js",
  "web/core/player-quests.js",
  "web/core/action-resolver.js",
  "web/core/npc-simulation.js",
  "web/core/case-causality.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

function findResolvableChoice(caseId, choices, day) {
  return choices.findIndex((choice) => {
    const roll = RPG.Data.deterministicRoll(caseId, choice.id, day);
    return roll >= 3 + choice.risk;
  });
}

assert(RPG.Data.places.foundry);
assert(RPG.Data.places.clinic);
assert(RPG.Data.places.watchtower);
assert(Object.keys(RPG.Data.npcs).length >= 9);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureEconomy(state);
RPG.Core.ensureRegionalEconomy(state);
RPG.Core.ensureOrganizations(state);
RPG.Core.ensureOrganizationRelations(state);
RPG.Core.ensureNPCRelations(state);
RPG.Core.ensureNPCGoals(state);
RPG.Core.ensureCaseCausality(state);

state.world.eventSignals.waterLedgerGap = 1;
RPG.Data.ensureCases(state);
assert(state.world.cases.some((entry) => entry.id === "water-ledger" && entry.status === "open"));

const firstOpen = state.world.cases.find((entry) => entry.id === "water-ledger");
const firstDef = RPG.Data.caseDefinitions[firstOpen.id];
let firstChoiceIndex = findResolvableChoice(firstOpen.id, firstDef.choices, state.world.day);
while (firstChoiceIndex < 0 && state.world.day < 10) {
  state.world.day += 1;
  firstChoiceIndex = findResolvableChoice(firstOpen.id, firstDef.choices, state.world.day);
}
assert(firstChoiceIndex >= 0);
const firstResult = RPG.Core.resolveAction(state, "사건분기 water-ledger " + (firstChoiceIndex + 1));
assert(firstResult.narrative.includes("판정"));
assert(state.world.cases.some((entry) => entry.id === "water-ledger" && entry.status === "resolved"));

state.world.day += 1;
state.world.minutes = 360;
RPG.Data.ensureCases(state);
assert(state.world.cases.some((entry) => entry.id === "water-ledger-aftershock" && entry.status === "open"));

const followupOpen = state.world.cases.find((entry) => entry.id === "water-ledger-aftershock" && entry.status === "open");
const followupDef = RPG.Data.caseDefinitions[followupOpen.id];
let followupChoiceIndex = findResolvableChoice(followupOpen.id, followupDef.choices, state.world.day);
while (followupChoiceIndex < 0 && state.world.day < 20) {
  state.world.day += 1;
  followupChoiceIndex = findResolvableChoice(followupOpen.id, followupDef.choices, state.world.day);
}
assert(followupChoiceIndex >= 0);
const followupResult = RPG.Core.resolveAction(state, "사건분기 water-ledger-aftershock " + (followupChoiceIndex + 1));
assert(followupResult.narrative.includes("판정"));
assert(state.world.cases.some((entry) => entry.id === "water-ledger-aftershock" && entry.status === "resolved"));

const historyIds = state.world.caseHistory.map((entry) => entry.caseId);
assert(historyIds.includes("water-ledger"));
assert(historyIds.includes("water-ledger-aftershock"));
assert(state.world.trustInAdministration !== 68 || state.world.security !== 62 || state.world.rumorPressure !== 0);

console.log("Phase 272 world depth vertical slice regression: PASS");
