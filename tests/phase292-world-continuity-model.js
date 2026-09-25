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
assert.strictEqual(malformed.world.continuity.life.endReason, "lost");
assert.strictEqual(malformed.world.continuity.knowledge.traces[0].type, "historical");
assert.strictEqual(malformed.world.continuity.nextLife.targetWorldId, "world:25");
assert.strictEqual(malformed.world.continuity.nextLife.outcome, "different-world");

const legacyLost = Core.normalizeState({
  world: {
    gameStatus: "lost",
    continuity: {
      life: { lifeId: "life:legacy", status: "ended", endedAtAbsoluteMinute: 1440 },
      nextLife: { resolved: false, outcome: "undecided" }
    }
  }
});
assert.strictEqual(legacyLost.world.continuity.nextLife.resolved, true);
assert(["same-world", "same-world-later", "different-world"].includes(legacyLost.world.continuity.nextLife.outcome));

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
assert.strictEqual(roundTrip.world.continuity.history.lifeEvents.some((entry) => entry.type === "life-ended"), true);

const endedRecordKeepsLifeClosed = Core.normalizeState({
  world: {
    gameStatus: "active",
    continuity: {
      life: { lifeId: "life:9", ordinal: 9, status: "active" },
      history: {
        lifeEvents: [{ type: "life-ended", lifeId: "life:9", absoluteMinute: 2010, detail: "death" }]
      }
    }
  }
});
assert.strictEqual(endedRecordKeepsLifeClosed.world.continuity.life.status, "ended");
assert.strictEqual(endedRecordKeepsLifeClosed.world.continuity.life.endReason, "recorded-ended");

const sameWorldState = Core.createDefaultState({});
sameWorldState.player.hp = 0;
sameWorldState.world.day = 5;
sameWorldState.world.minutes = 600;
Core.applyCampaignProgress(sameWorldState, {});
sameWorldState.world.continuity.history.persistentConsequences.push({
  id: "cons:warehouse-scar",
  text: "창고 봉인 흔적이 남아 있다.",
  sourceWorldId: sameWorldState.world.continuity.identity.worldId,
  discovered: false
});
sameWorldState.world.continuity.knowledge.traces.push({
  id: "trace:legacy-note",
  type: "direct",
  text: "이전 생의 단서",
  worldId: sameWorldState.world.continuity.identity.worldId,
  day: sameWorldState.world.day,
  confidence: 0.9
});
sameWorldState.world.continuity.nextLife = {
  resolved: true,
  outcome: "same-world",
  decidedAtAbsoluteMinute: Core.getAbsoluteMinute(sameWorldState),
  decisionHash: 71,
  targetWorldId: sameWorldState.world.continuity.identity.worldId,
  targetAbsoluteMinute: Core.getAbsoluteMinute(sameWorldState),
  explicitConnection: null
};
const firstLifeId = sameWorldState.world.continuity.life.lifeId;
const nextLife = Core.beginNextLife(sameWorldState, {});
assert(nextLife);
assert.strictEqual(nextLife.status, "active");
assert.strictEqual(nextLife.lifeId === firstLifeId, false);
assert.strictEqual(sameWorldState.world.gameStatus, "active");
assert.strictEqual(sameWorldState.world.continuity.identity.worldId, "world:serka:primary");
assert.strictEqual(sameWorldState.world.continuity.history.persistentConsequences.length, 1);
assert.strictEqual(sameWorldState.world.continuity.knowledge.traces.length, 0);
assert.strictEqual(sameWorldState.world.continuity.nextLife.resolved, false);
assert.strictEqual(
  sameWorldState.world.continuity.history.lifeEvents.some((entry) => entry.type === "life-started" && entry.lifeId === nextLife.lifeId),
  true
);

const sameWorldLater = Core.createDefaultState({});
sameWorldLater.player.hp = 0;
sameWorldLater.world.day = 2;
sameWorldLater.world.minutes = 120;
Core.applyCampaignProgress(sameWorldLater, {});
const baseMinute = Core.getAbsoluteMinute(sameWorldLater);
sameWorldLater.world.continuity.nextLife = {
  resolved: true,
  outcome: "same-world-later",
  decidedAtAbsoluteMinute: baseMinute,
  decisionHash: 19,
  targetWorldId: sameWorldLater.world.continuity.identity.worldId,
  targetAbsoluteMinute: baseMinute + 720,
  explicitConnection: null
};
Core.beginNextLife(sameWorldLater, {});
assert.strictEqual(Core.getAbsoluteMinute(sameWorldLater), baseMinute + 720);
assert.strictEqual(sameWorldLater.world.continuity.life.startedAtAbsoluteMinute, baseMinute + 720);

const sameWorldLaterPastTarget = Core.createDefaultState({});
sameWorldLaterPastTarget.player.hp = 0;
sameWorldLaterPastTarget.world.day = 4;
sameWorldLaterPastTarget.world.minutes = 360;
Core.applyCampaignProgress(sameWorldLaterPastTarget, {});
const pastTargetCurrentMinute = Core.getAbsoluteMinute(sameWorldLaterPastTarget);
sameWorldLaterPastTarget.world.continuity.nextLife = {
  resolved: true,
  outcome: "same-world-later",
  decidedAtAbsoluteMinute: pastTargetCurrentMinute,
  decisionHash: 29,
  targetWorldId: sameWorldLaterPastTarget.world.continuity.identity.worldId,
  targetAbsoluteMinute: pastTargetCurrentMinute - 120,
  explicitConnection: null
};
Core.beginNextLife(sameWorldLaterPastTarget, {});
assert.strictEqual(Core.getAbsoluteMinute(sameWorldLaterPastTarget), pastTargetCurrentMinute);
assert.strictEqual(sameWorldLaterPastTarget.world.continuity.life.startedAtAbsoluteMinute, pastTargetCurrentMinute);

const differentWorld = Core.createDefaultState({});
differentWorld.player.hp = 0;
Core.applyCampaignProgress(differentWorld, {});
const invalidDifferentWorld = JSON.parse(JSON.stringify(differentWorld));
invalidDifferentWorld.world.continuity.nextLife = {
  resolved: true,
  outcome: "different-world",
  decidedAtAbsoluteMinute: Core.getAbsoluteMinute(invalidDifferentWorld),
  decisionHash: 777,
  targetWorldId: invalidDifferentWorld.world.continuity.identity.worldId,
  targetAbsoluteMinute: Core.getAbsoluteMinute(invalidDifferentWorld),
  explicitConnection: null
};
assert.strictEqual(Core.beginNextLife(invalidDifferentWorld, {}), null);
assert.strictEqual(invalidDifferentWorld.world.continuity.life.status, "ended");
differentWorld.world.continuity.history.persistentConsequences.push({
  id: "cons:legacy",
  text: "이전 세계의 흔적",
  sourceWorldId: differentWorld.world.continuity.identity.worldId,
  discovered: true
});
differentWorld.world.continuity.nextLife = {
  resolved: true,
  outcome: "different-world",
  decidedAtAbsoluteMinute: Core.getAbsoluteMinute(differentWorld),
  decisionHash: 12345,
  targetWorldId: "world:new-frontier",
  targetAbsoluteMinute: Core.getAbsoluteMinute(differentWorld),
  explicitConnection: null
};
Core.beginNextLife(differentWorld, {});
assert.strictEqual(differentWorld.world.continuity.identity.worldId, "world:new-frontier");
assert.strictEqual(differentWorld.world.continuity.identity.parentWorldId, null);
assert.strictEqual(differentWorld.world.continuity.identity.explicitConnection, null);
assert.strictEqual(differentWorld.world.continuity.history.persistentConsequences.length, 0);
assert.strictEqual(
  differentWorld.world.continuity.history.lifeEvents.filter((entry) => entry.type === "life-ended").length,
  0
);
assert.strictEqual(
  differentWorld.world.continuity.history.lifeEvents.filter((entry) => entry.type === "life-started").length,
  1
);

console.log("Phase 292 world continuity model: PASS");
console.log("World/life/timeline/history/knowledge continuity model is normalized, life termination is bounded, and continuity outcomes persist without reroll: PASS");
