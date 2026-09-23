self.AnonymousRPG = self.AnonymousRPG || {};
importScripts("../core/game-state.js", "../data/npcs.js", "../data/places.js", "../data/cases.js", "../core/action-resolver.js");

let state = null;

function reply(type, payload) {
  self.postMessage({ type: type, payload: payload || {} });
}

self.onmessage = function (event) {
  const message = event.data || {};

  try {
    if (message.type === "INIT") {
      state = AnonymousRPG.Core.normalizeState(message.state);
      if (!state.npcs || Object.keys(state.npcs).length === 0) {
        state.npcs = AnonymousRPG.Core.clone(AnonymousRPG.Data.npcs);
      }
      AnonymousRPG.Data.ensureCases(state);
      reply("READY", { state: state });
      return;
    }

    if (message.type === "ACTION") {
      if (!state) throw new Error("Worker not initialized");
      const result = AnonymousRPG.Core.resolveAction(state, message.text);
      reply("UPDATE", { state: state, result: result });
      return;
    }

    if (message.type === "SNAPSHOT") {
      reply("SNAPSHOT", { state: state });
      return;
    }

    if (message.type === "RESET") {
      state = AnonymousRPG.Core.createDefaultState(AnonymousRPG.Data.npcs);
      AnonymousRPG.Data.ensureCases(state);
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
