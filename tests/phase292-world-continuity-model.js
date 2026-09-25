const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const files = ["web/core/game-state.js", "web/core/player-quests.js"];
const context = { console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
files.forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));
const { Core } = context.AnonymousRPG;

const defaults = Core.createDefaultState({});
const defaultContinuity = defaults.world.continuity;
assert.strictEqual(defaults.schemaVersion, 5);
assert.strictEqual(defaultContinuity.identity.worldId, "world:serka:primary");
assert.strictEqual(defaultContinuity.life.status, "active");
assert.strictEqual(defaultContinuity.nextLife.outcome, "undecided");

const malformed = Core.normalizeState({
  world: {
    gameStatus: "lost",
    continuity: {
      identity: { worldId: "", explicitConnection: "bad" },
      life: { status: "x", startedAtAbsoluteMinute: "oops" },
      timeline: { continuityDecision: "reroll", continuitySeed: "" },
      history: { lifeEvents: [null, { type: "life-ended", absoluteMinute: "x", detail: "ok" }] },
      knowledge: { traces: [{ id: "a", type: "invalid", text: "흔적", confidence: 3 }] },
      nextLife: { resolved: true, outcome: "different-world", decisionHash: 77 }
    }
  }
});
assert.strictEqual(malformed.schemaVersion, 5);
assert.strictEqual(malformed.world.continuity.identity.worldId, "world:serka:primary");
assert.strictEqual(malformed.world.continuity.identity.explicitConnection, null);
assert.strictEqual(malformed.world.continuity.life.status, "ended");
assert.strictEqual(malformed.world.continuity.life.endReason, "death");
assert.strictEqual(malformed.world.continuity.knowledge.traces[0].type, "historical");
assert.strictEqual(malformed.world.continuity.nextLife.targetWorldId, "world:77");
assert.strictEqual(malformed.world.continuity.nextLife.outcome, "different-world");

const state = Core.createDefaultState({});
state.player.hp = 0;
state.world.day = 3;
state.world.minutes = 480;
const events = Core.applyCampaignProgress(state, {});
assert.strictEqual(state.world.gameStatus, "lost");
assert.strictEqual(events.length, 1);
assert.strictEqual(state.world.continuity.life.status, "ended");
assert.strictEqual(state.world.continuity.life.endReason, "death");
assert.strictEqual(state.world.continuity.nextLife.resolved, true);
assert(["same-world", "same-world-later", "different-world"].includes(state.world.continuity.nextLife.outcome));

const persistedDecision = JSON.stringify(state.world.continuity.nextLife);
const replay = Core.resolveNextLifeOutcome(state, "different-context");
assert.strictEqual(JSON.stringify(replay), persistedDecision);
assert.strictEqual(JSON.stringify(state.world.continuity.nextLife), persistedDecision);

const roundTrip = Core.normalizeState(JSON.parse(JSON.stringify(state)));
assert.strictEqual(JSON.stringify(roundTrip.world.continuity.nextLife), persistedDecision);
assert.strictEqual(roundTrip.world.continuity.history.lifeEvents.some((entry) => entry.type === "continuity-decided"), true);

console.log("Phase 292 world continuity model: PASS");
console.log("World/life/timeline/history/knowledge continuity model is normalized, life termination is bounded, and continuity outcomes persist without reroll: PASS");
