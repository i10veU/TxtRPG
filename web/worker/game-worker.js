self.AnonymousRPG = self.AnonymousRPG || {};
const window = self;
importScripts("../core/game-state.js", "../data/npcs.js", "../data/places.js", "../data/cases.js", "../core/economy-world.js", "../core/faction-world.js", "../core/organization-world.js", "../core/npc-goals.js", "../core/npc-relations.js", "../core/action-resolver.js", "../core/npc-simulation.js");

let state = null;

function reply(type, payload) {
  self.postMessage({ type: type, payload: payload || {} });
}

function runAction(text) {
  const before = AnonymousRPG.Core.getAbsoluteMinute(state);
  const result = AnonymousRPG.Core.resolveAction(state, text);
  const after = AnonymousRPG.Core.getAbsoluteMinute(state);
  const elapsed = Math.max(0, after - before);
  const npcEvents = AnonymousRPG.Core.simulateNPCs(state, elapsed);
  const organizationEvents = AnonymousRPG.Core.simulateOrganizations(state, after);
  const relationshipEvents = AnonymousRPG.Core.simulateOrganizationRelations ? AnonymousRPG.Core.simulateOrganizationRelations(state, after) : [];
  const economyEvent = AnonymousRPG.Core.simulateEconomy(state, after);

  if (result.narrative) AnonymousRPG.Core.appendLog(state, result.narrative, result.action);
  npcEvents.forEach(function (event) {
    AnonymousRPG.Core.appendLog(state, event, null, true);
  });
  organizationEvents.forEach(function (event) {
    AnonymousRPG.Core.appendLog(state, event, null, true);
  });
  relationshipEvents.forEach(function (event) {
    AnonymousRPG.Core.appendLog(state, event, null, true);
  });
  if (economyEvent) AnonymousRPG.Core.appendLog(state, economyEvent, null, true);
  return { result: result, npcEvents: npcEvents, economyEvent: economyEvent };
}

self.onmessage = function (event) {
  const message = event.data || {};

  try {
    if (message.type === "INIT") {
      state = AnonymousRPG.Core.normalizeState(message.state);
      if (!state.npcs || Object.keys(state.npcs).length === 0) {
        state.npcs = AnonymousRPG.Core.clone(AnonymousRPG.Data.npcs);
      }
      AnonymousRPG.Core.ensureEconomy(state);
      AnonymousRPG.Core.ensureOrganizations(state);
      if (AnonymousRPG.Core.ensureOrganizationRelations) AnonymousRPG.Core.ensureOrganizationRelations(state);
      if (AnonymousRPG.Core.ensureNPCGoals) AnonymousRPG.Core.ensureNPCGoals(state);
      AnonymousRPG.Data.ensureCases(state);
      reply("READY", { state: state });
      return;
    }

    if (message.type === "ACTION") {
      if (!state) throw new Error("Worker not initialized");
      const outcome = runAction(message.text);
      reply("UPDATE", { state: state, result: outcome.result, npcEvents: outcome.npcEvents, economyEvent: outcome.economyEvent });
      return;
    }

    if (message.type === "SNAPSHOT") {
      reply("SNAPSHOT", { state: state });
      return;
    }

    if (message.type === "RESET") {
      state = AnonymousRPG.Core.createDefaultState(AnonymousRPG.Data.npcs);
      AnonymousRPG.Core.ensureEconomy(state);
      AnonymousRPG.Core.ensureOrganizations(state);
      if (AnonymousRPG.Core.ensureOrganizationRelations) AnonymousRPG.Core.ensureOrganizationRelations(state);
      if (AnonymousRPG.Core.ensureNPCGoals) AnonymousRPG.Core.ensureNPCGoals(state);
      AnonymousRPG.Data.ensureCases(state);
      AnonymousRPG.Core.appendLog(state, "비가 그친 새벽이다. 젖은 돌바닥 위로 사람들이 하루를 시작했다. 누구도 당신을 기다리지 않는다.");
      AnonymousRPG.Core.appendLog(state, "북문 시장에서는 가게마다 곡물 가격이 조금씩 다르다. 광장 건너편에서는 경비대원이 상인의 저울을 확인하고 있다.");
      reply("READY", { state: state });
      return;
    }

    throw new Error("Unknown worker message: " + String(message.type));
  } catch (error) {
    reply("ERROR", {
      message: error && error.message ? error.message : String(error)
    });
  }
};
