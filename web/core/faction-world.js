window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core) {
  const FACTIONS = ["merchants", "guard", "archive", "rural", "innkeepers", "workers"];

  function drift(state, faction, delta) {
    if (!state.world.relations || !Object.prototype.hasOwnProperty.call(state.world.relations, faction)) return;
    Core.adjustRelation(state, faction, delta);
  }

  function evaluate(state) {
    const w = state.world;
    const r = w.relations;
    if (w.grainSupply < 45) drift(state, "merchants", -2);
    else if (w.grainSupply > 75) drift(state, "merchants", 1);

    if (w.security < 45 || w.tension > 70) drift(state, "guard", -2);
    else if (w.security > 75 && w.tension < 45) drift(state, "guard", 1);

    if (w.trustInAdministration < 45) drift(state, "archive", -2);
    else if (w.trustInAdministration > 75) drift(state, "archive", 1);

    if (w.grainSupply < 50) drift(state, "rural", -1);
    else if (w.grainSupply > 70) drift(state, "rural", 1);

    if (w.rumorPressure > 10 || w.tension > 70) drift(state, "innkeepers", -1);
    else if (w.rumorPressure < 4 && w.tension < 45) drift(state, "innkeepers", 1);

    if (w.security < 40 || w.tension > 75) drift(state, "workers", -1);
    else if (w.security > 70 && w.tension < 50) drift(state, "workers", 1);

    const hostile = FACTIONS.filter(function (faction) {
      return Number(r[faction]) <= -40;
    });
    w.flags.factionConflict = hostile.length >= 2 && w.tension >= 55;
    return hostile;
  }

  Core.simulateFactionWorld = function (state, absoluteMinute) {
    if (!state || !state.world) return [];
    const day = Math.floor(absoluteMinute / 1440);
    if (state.world.factionSimulationDay === day) return [];
    state.world.factionSimulationDay = day;
    const hostile = evaluate(state);
    if (!hostile.length) return [];
    if (state.world.flags.factionConflict) {
      return ["세력 간 긴장이 높아졌다. " + hostile.length + "개 집단이 서로를 경계하고 있다."];
    }
    return [];
  };
})(AnonymousRPG.Core);
