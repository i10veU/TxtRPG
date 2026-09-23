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
  "web/core/faction-world.js",
  "web/core/economy-world.js",
  "web/core/organization-world.js",
  "web/core/npc-goals.js",
  "web/core/organization-relations.js",
  "web/core/action-resolver.js",
  "web/core/npc-simulation.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureEconomy(state);
RPG.Core.ensureOrganizations(state);
RPG.Core.ensureOrganizationRelations(state);
RPG.Core.ensureNPCGoals(state);

state.world.grainSupply = 90;
state.world.rumorPressure = 80;
state.world.security = 90;
state.world.tension = 80;
state.world.trustInAdministration = 50;
state.world.minutes = 360;

const events = RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
assert(events.length >= 6);
assert.strictEqual(Object.values(state.world.organizations).filter((org) => org.lastDecisionDay === 0).length, 6);

const relationEvents = RPG.Core.simulateOrganizationRelations(state, RPG.Core.getAbsoluteMinute(state));
assert(relationEvents.some((event) => event.includes("충돌")));
assert(Object.keys(state.world.eventSignals).some((key) => key.indexOf("organizationConflict:") === 0));
assert(state.world.rumors.some((rumor) => rumor.id.indexOf("organizationConflict:") === 0));

RPG.Data.ensureCases(state);
const openCase = state.world.cases.find((entry) => entry.id === "faction-conflict");
assert(openCase);
assert.strictEqual(openCase.status, "open");

const summary = RPG.Core.resolveAction(state, "사건목록");
assert(summary.narrative.includes("갈라진 도시의 이해관계"));

state.world.cases[0].status = "resolved";
state.world.flags.factionConflict = false;
const normalized = RPG.Core.normalizeState(state);
RPG.Core.ensureOrganizationRelations(normalized);
assert.strictEqual(Object.keys(normalized.world.organizationRelations).length, 3);
assert(Object.keys(normalized.world.eventSignals).some((key) => key.indexOf("organizationConflict:") === 0));
assert(normalized.world.rumors.some((rumor) => rumor.id.indexOf("organizationConflict:") === 0));

console.log("Phase 266 organization-event bridge: PASS");
console.log("Organization conflict signal and rumor: PASS");
console.log("Organization conflict opens case: PASS");
console.log("Event bridge persistence: PASS");
