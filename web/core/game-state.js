window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core) {
  const DEFAULT_RELATIONS = {
    merchants: 0,
    guard: 0,
    archive: 0,
    rural: 0,
    innkeepers: 0,
    workers: 0
  };

  const DEFAULT_STATE = {
    schemaVersion: 2,
    player: {
      name: "에바 로셀",
      hp: 10,
      maxHp: 10,
      fatigue: 2,
      maxFatigue: 10,
      money: 18,
      place: "market",
      inventory: { note: 1, knife: 1 }
    },
    world: {
      day: 0,
      minutes: 360,
      grainSupply: 72,
      tension: 25,
      security: 62,
      trustInAdministration: 68,
      rumorPressure: 0,
      relations: DEFAULT_RELATIONS,
      flags: {
        marketRumor: false,
        recordInconsistency: false,
        nightCargo: false,
        warehouseSuspicion: false,
        ruralDelegation: false
      },
      discovered: [],
      cases: []
    },
    npcs: {},
    log: []
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeState(input) {
    const state = Object.assign(clone(DEFAULT_STATE), input || {});
    state.player = Object.assign(clone(DEFAULT_STATE.player), input && input.player || {});
    state.player.inventory = Object.assign({}, DEFAULT_STATE.player.inventory, input && input.player && input.player.inventory || {});
    state.world = Object.assign(clone(DEFAULT_STATE.world), input && input.world || {});
    state.world.relations = Object.assign({}, DEFAULT_RELATIONS, input && input.world && input.world.relations || {});
    state.world.flags = Object.assign({}, DEFAULT_STATE.world.flags, input && input.world && input.world.flags || {});
    state.world.discovered = Array.isArray(state.world.discovered) ? state.world.discovered : [];
    state.world.cases = Array.isArray(state.world.cases) ? state.world.cases : [];
    state.npcs = input && input.npcs && typeof input.npcs === "object" ? input.npcs : {};
    state.log = Array.isArray(state.log) ? state.log : [];
    state.schemaVersion = 2;
    Object.keys(DEFAULT_RELATIONS).forEach(function (faction) {
      state.world.relations[faction] = clamp(Number(state.world.relations[faction]) || 0, -100, 100);
    });
    state.world.grainSupply = clamp(Number(state.world.grainSupply) || 0, 0, 100);
    state.world.tension = clamp(Number(state.world.tension) || 0, 0, 100);
    state.world.security = clamp(Number(state.world.security) || 0, 0, 100);
    state.world.trustInAdministration = clamp(Number(state.world.trustInAdministration) || 0, 0, 100);
    state.player.hp = clamp(Number(state.player.hp) || 0, 0, state.player.maxHp);
    state.player.fatigue = clamp(Number(state.player.fatigue) || 0, 0, state.player.maxFatigue);
    return state;
  }

  function createDefaultState(npcData) {
    const state = clone(DEFAULT_STATE);
    state.npcs = clone(npcData || {});
    return state;
  }

  function getClock(state) {
    const h = Math.floor(state.world.minutes / 60);
    const minute = state.world.minutes % 60;
    return {
      text: String(h).padStart(2, "0") + ":" + String(minute).padStart(2, "0"),
      part: h < 6 ? "심야" : h < 9 ? "이른 아침" : h < 12 ? "오전" :
        h < 14 ? "정오" : h < 18 ? "오후" : h < 21 ? "해질녘" : "밤"
    };
  }

  function appendLog(state, narrative, action, system) {
    state.log.push({
      time: (state.world.day + 1) + "일째 · " + getClock(state).text,
      narrative: narrative,
      action: action || null,
      system: Boolean(system)
    });
    if (state.log.length > 60) state.log.shift();
  }

  function adjustRelation(state, faction, delta) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_RELATIONS, faction)) return 0;
    const current = Number(state.world.relations[faction]) || 0;
    state.world.relations[faction] = clamp(current + delta, -100, 100);
    return state.world.relations[faction];
  }

  function advanceTime(state, minutes, rng) {
    state.world.minutes += Math.max(0, minutes);
    while (state.world.minutes >= 1440) {
      state.world.minutes -= 1440;
      state.world.day += 1;
      const random = rng || Math.random;
      if (random() < 0.45) state.world.grainSupply -= 1;
      if (random() < 0.20) state.world.tension += 1;
    }
    state.world.grainSupply = clamp(state.world.grainSupply, 0, 100);
    state.world.tension = clamp(state.world.tension, 0, 100);
  }

  Core.clone = clone;
  Core.clamp = clamp;
  Core.normalizeState = normalizeState;
  Core.createDefaultState = createDefaultState;
  Core.getClock = getClock;
  Core.advanceTime = advanceTime;
  Core.appendLog = appendLog;
  Core.adjustRelation = adjustRelation;
  Core.DEFAULT_RELATIONS = DEFAULT_RELATIONS;
})(AnonymousRPG.Core);
