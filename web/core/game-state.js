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

  const DEFAULT_ECONOMY = {
    prices: { grain: 10 },
    stock: { grain: 24 },
    simulationDay: -1,
    tradeVolume: 0
  };

  const DEFAULT_STATE = {
    schemaVersion: 5,
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
      npcSimulationMinute: 360,
      factionSimulationDay: -1,
      grainSupply: 72,
      tension: 25,
      security: 62,
      trustInAdministration: 68,
      rumorPressure: 0,
      relations: DEFAULT_RELATIONS,
      economy: DEFAULT_ECONOMY,
      flags: {
        marketRumor: false,
        recordInconsistency: false,
        nightCargo: false,
        warehouseSuspicion: false,
        ruralDelegation: false,
        factionConflict: false
      },
      eventSignals: {},
      eventHistory: [],
      rumors: [],
      organizations: {},
      organizationRelations: {},
      organizationRelationDay: -1,
      npcRelations: {},
      npcRelationDay: -1,
      discovered: [],
      cases: []
    },
    npcs: {},
    log: []
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function absoluteMinute(state) { return state.world.day * 1440 + state.world.minutes; }

  function normalizeSignalMap(input) {
    const output = {};
    if (!input || typeof input !== "object") return output;
    Object.keys(input).forEach(function (key) {
      const value = Number(input[key]);
      if (Number.isFinite(value) && value > 0) output[key] = Math.floor(value);
    });
    return output;
  }

  function normalizeEventHistory(input) {
    if (!Array.isArray(input)) return [];
    return input.filter(function (entry) {
      return entry && typeof entry === "object" && typeof entry.signal === "string" && typeof entry.source === "string";
    }).slice(-80);
  }

  function normalizeRumors(input) {
    if (!Array.isArray(input)) return [];
    return input.filter(function (entry) {
      return entry && typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.text === "string" &&
        Array.isArray(entry.sources);
    }).map(function (entry) {
      return {
        id: entry.id,
        text: entry.text,
        sources: entry.sources.slice(0, 8).map(String),
        confidence: clamp(Number(entry.confidence) || 0.4, 0, 1),
        firstSeenDay: Math.max(0, Number(entry.firstSeenDay) || 0),
        lastSeenDay: Math.max(0, Number(entry.lastSeenDay) || 0),
        confirmations: Math.max(1, Number(entry.confirmations) || 1)
      };
    }).slice(-30);
  }

  function normalizeState(input) {
    const state = Object.assign(clone(DEFAULT_STATE), input || {});
    state.player = Object.assign(clone(DEFAULT_STATE.player), input && input.player || {});
    state.player.inventory = Object.assign({}, DEFAULT_STATE.player.inventory, input && input.player && input.player.inventory || {});
    state.world = Object.assign(clone(DEFAULT_STATE.world), input && input.world || {});
    state.world.relations = Object.assign({}, DEFAULT_RELATIONS, input && input.world && input.world.relations || {});
    state.world.economy = Object.assign(clone(DEFAULT_ECONOMY), input && input.world && input.world.economy || {});
    state.world.economy.prices = Object.assign({}, DEFAULT_ECONOMY.prices, input && input.world && input.world.economy && input.world.economy.prices || {});
    state.world.economy.stock = Object.assign({}, DEFAULT_ECONOMY.stock, input && input.world && input.world.economy && input.world.economy.stock || {});
    state.world.flags = Object.assign({}, DEFAULT_STATE.world.flags, input && input.world && input.world.flags || {});
    state.world.eventSignals = normalizeSignalMap(input && input.world && input.world.eventSignals);
    state.world.eventHistory = normalizeEventHistory(input && input.world && input.world.eventHistory);
    state.world.rumors = normalizeRumors(input && input.world && input.world.rumors);
    state.world.organizations = input && input.world && input.world.organizations && typeof input.world.organizations === "object"
      ? input.world.organizations
      : {};
    state.world.organizationRelations = input && input.world && input.world.organizationRelations && typeof input.world.organizationRelations === "object"
      ? input.world.organizationRelations
      : {};
    const relationDay = Number(input && input.world && input.world.organizationRelationDay);
    state.world.organizationRelationDay = Number.isFinite(relationDay) ? relationDay : -1;
    state.world.npcRelations = input && input.world && input.world.npcRelations && typeof input.world.npcRelations === "object"
      ? input.world.npcRelations
      : {};
    const npcRelationDay = Number(input && input.world && input.world.npcRelationDay);
    state.world.npcRelationDay = Number.isFinite(npcRelationDay) ? npcRelationDay : -1;
    state.world.discovered = Array.isArray(state.world.discovered) ? state.world.discovered : [];
    state.world.cases = Array.isArray(state.world.cases) ? state.world.cases : [];
    state.npcs = input && input.npcs && typeof input.npcs === "object" ? input.npcs : {};
    state.log = Array.isArray(state.log) ? state.log : [];
    state.schemaVersion = 5;

    Object.keys(DEFAULT_RELATIONS).forEach(function (faction) {
      state.world.relations[faction] = clamp(Number(state.world.relations[faction]) || 0, -100, 100);
    });
    state.world.economy.prices.grain = clamp(Number(state.world.economy.prices.grain) || 10, 4, 30);
    state.world.economy.stock.grain = clamp(Number(state.world.economy.stock.grain) || 0, 0, 100);
    state.world.economy.simulationDay = Number.isFinite(Number(state.world.economy.simulationDay)) ? Number(state.world.economy.simulationDay) : -1;
    state.world.economy.tradeVolume = Math.max(0, Number(state.world.economy.tradeVolume) || 0);
    state.world.grainSupply = clamp(Number(state.world.grainSupply) || 0, 0, 100);
    state.world.tension = clamp(Number(state.world.tension) || 0, 0, 100);
    state.world.security = clamp(Number(state.world.security) || 0, 0, 100);
    state.world.trustInAdministration = clamp(Number(state.world.trustInAdministration) || 0, 0, 100);

    const currentAbsolute = absoluteMinute(state);
    const savedSimulationMinute = Number(input && input.world && input.world.npcSimulationMinute);
    state.world.npcSimulationMinute = Number.isFinite(savedSimulationMinute) ? Math.min(savedSimulationMinute, currentAbsolute) : currentAbsolute;
    const savedFactionDay = Number(input && input.world && input.world.factionSimulationDay);
    state.world.factionSimulationDay = Number.isFinite(savedFactionDay) ? savedFactionDay : -1;

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
    return { text: String(h).padStart(2, "0") + ":" + String(minute).padStart(2, "0"), part: h < 6 ? "심야" : h < 9 ? "이른 아침" : h < 12 ? "오전" : h < 14 ? "정오" : h < 18 ? "오후" : h < 21 ? "해질녘" : "밤" };
  }

  function appendLog(state, narrative, action, system) {
    state.log.push({ time: (state.world.day + 1) + "일째 · " + getClock(state).text, narrative: narrative, action: action || null, system: Boolean(system) });
    if (state.log.length > 60) state.log.shift();
  }

  function adjustRelation(state, faction, delta) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_RELATIONS, faction)) return 0;
    const current = Number(state.world.relations[faction]) || 0;
    state.world.relations[faction] = clamp(current + delta, -100, 100);
    return state.world.relations[faction];
  }

  function recordEventSignal(state, signal, source, absoluteTime, text) {
    if (!state.world.eventSignals) state.world.eventSignals = {};
    if (!state.world.eventHistory) state.world.eventHistory = [];
    const key = String(signal || "").trim();
    if (!key) return 0;
    const nextCount = (Number(state.world.eventSignals[key]) || 0) + 1;
    state.world.eventSignals[key] = nextCount;
    const sourceName = String(source || "unknown");
    const minute = Number(absoluteTime) || absoluteMinute(state);
    state.world.eventHistory.push({ signal: key, source: sourceName, minute: minute, text: text ? String(text) : null, count: nextCount });
    if (text) recordRumor(state, key, sourceName, minute, text);
    if (state.world.eventHistory.length > 80) state.world.eventHistory.splice(0, state.world.eventHistory.length - 80);
    return nextCount;
  }

  function hasEventSignal(state, signal) { return Boolean(state && state.world && Number(state.world.eventSignals && state.world.eventSignals[signal]) > 0); }

  function recordRumor(state, signal, source, absoluteTime, text) {
    if (!state.world.rumors) state.world.rumors = [];
    const id = String(signal || "").trim();
    const rumorText = String(text || "").trim();
    if (!id || !rumorText) return null;

    const day = Math.floor((Number(absoluteTime) || absoluteMinute(state)) / 1440);
    let rumor = state.world.rumors.find(function (entry) { return entry.id === id; });

    if (!rumor) {
      rumor = {
        id: id,
        text: rumorText,
        sources: [String(source || "unknown")],
        confidence: 0.45,
        firstSeenDay: day,
        lastSeenDay: day,
        confirmations: 1
      };
      state.world.rumors.push(rumor);
    } else {
      const sourceName = String(source || "unknown");
      if (!rumor.sources.includes(sourceName)) {
        rumor.sources.push(sourceName);
        rumor.sources = rumor.sources.slice(-8);
        rumor.confirmations += 1;
        rumor.confidence = clamp(rumor.confidence + 0.15, 0, 0.95);
      } else {
        rumor.confidence = clamp(rumor.confidence + 0.03, 0, 0.9);
      }
      rumor.lastSeenDay = day;
      rumor.text = rumorText;
    }

    if (state.world.rumors.length > 30) state.world.rumors.splice(0, state.world.rumors.length - 30);
    return rumor;
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
  Core.recordEventSignal = recordEventSignal;
  Core.hasEventSignal = hasEventSignal;
  Core.recordRumor = recordRumor;
  Core.getAbsoluteMinute = absoluteMinute;
  Core.DEFAULT_RELATIONS = DEFAULT_RELATIONS;
  Core.DEFAULT_ECONOMY = DEFAULT_ECONOMY;
})(AnonymousRPG.Core);
