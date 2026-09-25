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

  const CONTINUITY_OUTCOMES = ["same-world", "same-world-later", "different-world"];
  const CONTINUITY_DECISIONS = ["undecided"].concat(CONTINUITY_OUTCOMES);
  const TRACE_TYPES = ["direct", "historical", "social", "indirect", "forgotten"];

  const DEFAULT_CONTINUITY = {
    identity: {
      worldId: "world:serka:primary",
      universeId: "universe:serka",
      lineageRootId: "world:serka:primary",
      parentWorldId: null,
      explicitConnection: null
    },
    life: {
      lifeId: "life:1",
      ordinal: 1,
      status: "active",
      startedAtAbsoluteMinute: 360,
      endedAtAbsoluteMinute: null,
      endReason: null
    },
    timeline: {
      worldStartAbsoluteMinute: 0,
      continuitySeed: "serka-seed-0",
      continuityDecision: null
    },
    history: {
      lifeEvents: [],
      persistentConsequences: []
    },
    knowledge: {
      traces: []
    },
    nextLife: {
      resolved: false,
      outcome: "undecided",
      decidedAtAbsoluteMinute: null,
      decisionHash: null,
      targetWorldId: null,
      targetAbsoluteMinute: null,
      explicitConnection: null
    }
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
        waterLedgerGap: false,
        foundryWaterStress: false,
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
      waterAftermath: {
        active: false,
        policy: null,
        stage: 0,
        startedDay: -1,
        lastAdvanceDay: -1,
        lastNarratedDay: -1
      },
      discovered: [],
      cases: [],
      playerQuests: { chains: {} },
      tutorial: { step: 0, completed: false },
      campaignPhase: "tutorial",
      finaleReady: false,
      ending: null,
      gameStatus: "active",
      continuity: DEFAULT_CONTINUITY
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

  function normalizeCaseHistory(input) {
    if (!Array.isArray(input)) return [];
    return input.filter(function (entry) {
      return entry && typeof entry === "object" && typeof entry.caseId === "string";
    }).map(function (entry) {
      const day = Number(entry.resolutionDay);
      const minute = Number(entry.resolutionMinute);
      const status = typeof entry.status === "string" ? entry.status : "resolved";
      return {
        caseId: entry.caseId,
        choiceId: typeof entry.choiceId === "string" ? entry.choiceId : null,
        status: ["resolved", "failed"].includes(status) ? status : "resolved",
        resolutionDay: Number.isFinite(day) ? Math.max(0, Math.floor(day)) : 0,
        resolutionMinute: Number.isFinite(minute) ? Math.max(0, Math.floor(minute)) : 0,
        outcome: typeof entry.outcome === "string" ? entry.outcome.slice(0, 180) : null
      };
    }).slice(-40);
  }

  function normalizeWaterAftermath(input) {
    const value = input && typeof input === "object" ? input : {};
    const policy = ["council", "enforce", "decentralize"].includes(value.policy) ? value.policy : null;
    const stage = Core.clamp(Math.floor(Number(value.stage) || 0), 0, 3);
    const startedDay = Number(value.startedDay);
    const lastAdvanceDay = Number(value.lastAdvanceDay);
    const lastNarratedDay = Number(value.lastNarratedDay);
    return {
      active: Boolean(value.active) && policy !== null && stage < 3,
      policy: policy,
      stage: stage,
      startedDay: Number.isFinite(startedDay) ? Math.floor(startedDay) : -1,
      lastAdvanceDay: Number.isFinite(lastAdvanceDay) ? Math.floor(lastAdvanceDay) : -1,
      lastNarratedDay: Number.isFinite(lastNarratedDay) ? Math.floor(lastNarratedDay) : -1
    };
  }

  function normalizeTrace(input) {
    const trace = input && typeof input === "object" ? input : {};
    const traceType = TRACE_TYPES.includes(trace.type) ? trace.type : "historical";
    const confidence = clamp(Number(trace.confidence) || 0.3, 0, 1);
    const day = Number(trace.day);
    const worldId = typeof trace.worldId === "string" && trace.worldId.trim() ? trace.worldId.trim() : null;
    const text = typeof trace.text === "string" ? trace.text.slice(0, 180) : "";
    if (!text) return null;
    return {
      id: typeof trace.id === "string" && trace.id.trim() ? trace.id.trim() : ("trace:" + String(text).slice(0, 24)),
      type: traceType,
      text: text,
      worldId: worldId,
      day: Number.isFinite(day) ? Math.max(0, Math.floor(day)) : 0,
      confidence: confidence
    };
  }

  function normalizeContinuityHistory(input) {
    const history = input && typeof input === "object" ? input : {};
    const lifeEvents = Array.isArray(history.lifeEvents) ? history.lifeEvents.filter(function (entry) {
      return entry && typeof entry === "object" && typeof entry.type === "string";
    }).map(function (entry) {
      return {
        type: entry.type,
        absoluteMinute: Number.isFinite(Number(entry.absoluteMinute)) ? Math.max(0, Math.floor(Number(entry.absoluteMinute))) : 0,
        lifeId: typeof entry.lifeId === "string" ? entry.lifeId : null,
        detail: typeof entry.detail === "string" ? entry.detail.slice(0, 180) : null
      };
    }).slice(-40) : [];
    const persistentConsequences = Array.isArray(history.persistentConsequences) ? history.persistentConsequences.filter(function (entry) {
      return entry && typeof entry === "object" && typeof entry.id === "string";
    }).map(function (entry) {
      return {
        id: entry.id,
        text: typeof entry.text === "string" ? entry.text.slice(0, 180) : "",
        sourceWorldId: typeof entry.sourceWorldId === "string" ? entry.sourceWorldId : null,
        discovered: Boolean(entry.discovered)
      };
    }).slice(-60) : [];
    return { lifeEvents: lifeEvents, persistentConsequences: persistentConsequences };
  }

  function hashSeededText(seed, context) {
    const raw = String(seed || "") + ":" + String(context || "");
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function normalizeExplicitConnection(input) {
    if (!input || typeof input !== "object") return null;
    const raw = input;
    const type = typeof raw.type === "string" ? raw.type.slice(0, 40) : "";
    const sourceWorldId = typeof raw.sourceWorldId === "string" ? raw.sourceWorldId.slice(0, 80) : "";
    const targetWorldId = typeof raw.targetWorldId === "string" ? raw.targetWorldId.slice(0, 80) : "";
    const reason = typeof raw.reason === "string" ? raw.reason.slice(0, 180) : "";
    if (!type) return null;
    return {
      type: type,
      sourceWorldId: sourceWorldId || null,
      targetWorldId: targetWorldId || null,
      reason: reason || null
    };
  }

  function normalizeWorldContinuity(input, state) {
    const value = input && typeof input === "object" ? input : {};
    const identityInput = value.identity && typeof value.identity === "object" ? value.identity : {};
    const lifeInput = value.life && typeof value.life === "object" ? value.life : {};
    const timelineInput = value.timeline && typeof value.timeline === "object" ? value.timeline : {};
    const nextLifeInput = value.nextLife && typeof value.nextLife === "object" ? value.nextLife : {};
    const history = normalizeContinuityHistory(value.history);
    const traces = Array.isArray(value.knowledge && value.knowledge.traces)
      ? value.knowledge.traces.map(normalizeTrace).filter(Boolean).slice(-80)
      : [];
    const currentAbsoluteMinute = absoluteMinute(state);
    const worldId = typeof identityInput.worldId === "string" && identityInput.worldId.trim()
      ? identityInput.worldId.trim()
      : DEFAULT_CONTINUITY.identity.worldId;
    const lifeStatus = ["active", "ended"].includes(lifeInput.status) ? lifeInput.status : "active";
    const outcome = CONTINUITY_DECISIONS.includes(nextLifeInput.outcome) ? nextLifeInput.outcome : "undecided";
    const resolved = Boolean(nextLifeInput.resolved) && outcome !== "undecided";
    const continuity = clone(DEFAULT_CONTINUITY);
    continuity.identity.worldId = worldId;
    continuity.identity.universeId = typeof identityInput.universeId === "string" && identityInput.universeId.trim()
      ? identityInput.universeId.trim()
      : DEFAULT_CONTINUITY.identity.universeId;
    continuity.identity.lineageRootId = typeof identityInput.lineageRootId === "string" && identityInput.lineageRootId.trim()
      ? identityInput.lineageRootId.trim()
      : worldId;
    continuity.identity.parentWorldId = typeof identityInput.parentWorldId === "string" && identityInput.parentWorldId.trim()
      ? identityInput.parentWorldId.trim()
      : null;
    continuity.identity.explicitConnection = normalizeExplicitConnection(identityInput.explicitConnection);
    continuity.life.lifeId = typeof lifeInput.lifeId === "string" && lifeInput.lifeId.trim() ? lifeInput.lifeId.trim() : "life:1";
    continuity.life.ordinal = Math.max(1, Math.floor(Number(lifeInput.ordinal) || 1));
    continuity.life.status = lifeStatus;
    continuity.life.startedAtAbsoluteMinute = Number.isFinite(Number(lifeInput.startedAtAbsoluteMinute))
      ? Math.max(0, Math.floor(Number(lifeInput.startedAtAbsoluteMinute)))
      : currentAbsoluteMinute;
    continuity.life.endedAtAbsoluteMinute = Number.isFinite(Number(lifeInput.endedAtAbsoluteMinute))
      ? Math.max(0, Math.floor(Number(lifeInput.endedAtAbsoluteMinute)))
      : null;
    continuity.life.endReason = typeof lifeInput.endReason === "string" ? lifeInput.endReason : null;
    continuity.timeline.worldStartAbsoluteMinute = Number.isFinite(Number(timelineInput.worldStartAbsoluteMinute))
      ? Math.max(0, Math.floor(Number(timelineInput.worldStartAbsoluteMinute)))
      : 0;
    continuity.timeline.continuitySeed = typeof timelineInput.continuitySeed === "string" && timelineInput.continuitySeed.trim()
      ? timelineInput.continuitySeed.trim()
      : ("seed:" + worldId);
    continuity.timeline.continuityDecision = CONTINUITY_DECISIONS.includes(timelineInput.continuityDecision)
      ? timelineInput.continuityDecision
      : null;
    continuity.history = history;
    continuity.knowledge.traces = traces;
    continuity.nextLife.resolved = resolved;
    continuity.nextLife.outcome = outcome;
    continuity.nextLife.decidedAtAbsoluteMinute = Number.isFinite(Number(nextLifeInput.decidedAtAbsoluteMinute))
      ? Math.max(0, Math.floor(Number(nextLifeInput.decidedAtAbsoluteMinute)))
      : null;
    continuity.nextLife.decisionHash = Number.isFinite(Number(nextLifeInput.decisionHash))
      ? Math.floor(Number(nextLifeInput.decisionHash))
      : null;
    continuity.nextLife.targetWorldId = typeof nextLifeInput.targetWorldId === "string" && nextLifeInput.targetWorldId.trim()
      ? nextLifeInput.targetWorldId.trim()
      : null;
    continuity.nextLife.targetAbsoluteMinute = Number.isFinite(Number(nextLifeInput.targetAbsoluteMinute))
      ? Math.max(0, Math.floor(Number(nextLifeInput.targetAbsoluteMinute)))
      : null;
    continuity.nextLife.explicitConnection = normalizeExplicitConnection(nextLifeInput.explicitConnection);
    if (hasLifeEndedRecord(history, continuity.life.lifeId)) {
      continuity.life.status = "ended";
      if (continuity.life.endReason === null) continuity.life.endReason = "recorded-ended";
    }
    if (state.world.gameStatus === "lost" && continuity.life.status !== "ended") {
      continuity.life.status = "ended";
      continuity.life.endedAtAbsoluteMinute = continuity.life.endedAtAbsoluteMinute === null ? currentAbsoluteMinute : continuity.life.endedAtAbsoluteMinute;
      continuity.life.endReason = continuity.life.endReason || "lost";
    }
    if (continuity.nextLife.resolved && continuity.nextLife.outcome !== "undecided" && !continuity.nextLife.targetWorldId) {
      continuity.nextLife.targetWorldId = continuity.nextLife.outcome === "different-world"
        ? ("world:" + Number(continuity.nextLife.decisionHash || 0).toString(36))
        : worldId;
    }
    if (continuity.nextLife.resolved && continuity.nextLife.outcome !== "undecided" && continuity.nextLife.targetAbsoluteMinute === null) {
      continuity.nextLife.targetAbsoluteMinute = continuity.nextLife.decidedAtAbsoluteMinute;
    }
    if (state.world.gameStatus === "lost" && continuity.life.status === "ended" && !continuity.nextLife.resolved) {
      const seed = continuity.timeline.continuitySeed || ("seed:" + worldId);
      const basisMinute = continuity.life.endedAtAbsoluteMinute === null ? currentAbsoluteMinute : continuity.life.endedAtAbsoluteMinute;
      const hash = hashSeededText(seed, "normalize:" + continuity.life.lifeId + ":" + basisMinute);
      const normalizedOutcome = CONTINUITY_OUTCOMES[hash % CONTINUITY_OUTCOMES.length];
      continuity.nextLife.resolved = true;
      continuity.nextLife.outcome = normalizedOutcome;
      continuity.nextLife.decisionHash = hash;
      continuity.nextLife.decidedAtAbsoluteMinute = basisMinute;
      continuity.nextLife.targetWorldId = normalizedOutcome === "different-world"
        ? ("world:" + hash.toString(36))
        : worldId;
      continuity.nextLife.targetAbsoluteMinute = normalizedOutcome === "same-world-later"
        ? basisMinute + ((hash % 5) + 1) * 720
        : basisMinute;
      continuity.nextLife.explicitConnection = null;
      continuity.timeline.continuityDecision = normalizedOutcome;
    }
    return continuity;
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
    state.world.caseHistory = normalizeCaseHistory(input && input.world && input.world.caseHistory);
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
    state.world.waterAftermath = normalizeWaterAftermath(input && input.world && input.world.waterAftermath);
    state.world.discovered = Array.isArray(state.world.discovered) ? state.world.discovered : [];
    state.world.cases = Array.isArray(state.world.cases) ? state.world.cases : [];
    state.world.playerQuests = input && input.world && input.world.playerQuests && typeof input.world.playerQuests === "object"
      ? input.world.playerQuests
      : { chains: {} };
    state.world.playerQuests.chains = state.world.playerQuests.chains && typeof state.world.playerQuests.chains === "object"
      ? state.world.playerQuests.chains
      : {};
    const tutorial = input && input.world && input.world.tutorial;
    state.world.tutorial = {
      step: Math.max(0, Math.min(4, Number(tutorial && tutorial.step) || 0)),
      completed: Boolean(tutorial && tutorial.completed)
    };
    if (state.world.tutorial.completed) state.world.tutorial.step = 4;
    const campaignPhase = input && input.world && input.world.campaignPhase;
    state.world.campaignPhase = ["tutorial", "long-play", "finale-ready", "complete"].includes(campaignPhase)
      ? campaignPhase
      : (state.world.tutorial.completed ? "long-play" : "tutorial");
    state.world.finaleReady = Boolean(input && input.world && input.world.finaleReady);
    state.world.ending = input && input.world && typeof input.world.ending === "string" ? input.world.ending : null;
    state.world.gameStatus = ["active", "won", "lost"].includes(input && input.world && input.world.gameStatus)
      ? input.world.gameStatus
      : "active";
    state.world.continuity = normalizeWorldContinuity(input && input.world && input.world.continuity, state);
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
    state.world.rumorPressure = clamp(Number(state.world.rumorPressure) || 0, 0, 100);

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

  function continuityHash(seed, context) {
    return hashSeededText(seed, context);
  }

  function hasLifeEndedRecord(history, lifeId) {
    if (!history || !Array.isArray(history.lifeEvents)) return false;
    return history.lifeEvents.some(function (entry) {
      return entry && entry.type === "life-ended" && entry.lifeId === lifeId;
    });
  }

  function resetNextLifeSlot(continuity) {
    continuity.nextLife.resolved = false;
    continuity.nextLife.outcome = "undecided";
    continuity.nextLife.decidedAtAbsoluteMinute = null;
    continuity.nextLife.decisionHash = null;
    continuity.nextLife.targetWorldId = null;
    continuity.nextLife.targetAbsoluteMinute = null;
    continuity.nextLife.explicitConnection = null;
  }

  function ensureContinuity(state) {
    if (!state.world) state.world = {};
    if (!state.world.continuity || typeof state.world.continuity !== "object") {
      state.world.continuity = normalizeWorldContinuity(null, state);
      return state.world.continuity;
    }
    state.world.continuity = normalizeWorldContinuity(state.world.continuity, state);
    return state.world.continuity;
  }

  function pushLifeEvent(state, type, detail) {
    const continuity = ensureContinuity(state);
    continuity.history.lifeEvents.push({
      type: String(type || "event"),
      absoluteMinute: absoluteMinute(state),
      lifeId: continuity.life.lifeId,
      detail: detail ? String(detail).slice(0, 180) : null
    });
    if (continuity.history.lifeEvents.length > 40) continuity.history.lifeEvents.splice(0, continuity.history.lifeEvents.length - 40);
  }

  function markLifeTerminated(state, reason) {
    const continuity = ensureContinuity(state);
    if (continuity.life.status === "ended") return false;
    continuity.life.status = "ended";
    continuity.life.endedAtAbsoluteMinute = absoluteMinute(state);
    continuity.life.endReason = String(reason || "unknown");
    pushLifeEvent(state, "life-ended", continuity.life.endReason);
    return true;
  }

  function resolveNextLifeOutcome(state, contextKey) {
    const continuity = ensureContinuity(state);
    const nextLife = continuity.nextLife;
    if (nextLife.resolved && CONTINUITY_OUTCOMES.includes(nextLife.outcome)) return clone(nextLife);
    const seed = continuity.timeline.continuitySeed || continuity.identity.worldId || DEFAULT_CONTINUITY.timeline.continuitySeed;
    const context = contextKey || (state.world.gameStatus + ":" + continuity.life.lifeId + ":" + absoluteMinute(state));
    const hash = continuityHash(seed, context);
    const outcome = CONTINUITY_OUTCOMES[hash % CONTINUITY_OUTCOMES.length];
    nextLife.resolved = true;
    nextLife.outcome = outcome;
    nextLife.decisionHash = hash;
    nextLife.decidedAtAbsoluteMinute = absoluteMinute(state);
    nextLife.targetWorldId = outcome === "different-world" ? ("world:" + hash.toString(36)) : continuity.identity.worldId;
    nextLife.targetAbsoluteMinute = outcome === "same-world-later"
      ? nextLife.decidedAtAbsoluteMinute + ((hash % 5) + 1) * 720
      : nextLife.decidedAtAbsoluteMinute;
    nextLife.explicitConnection = null;
    continuity.timeline.continuityDecision = outcome;
    pushLifeEvent(state, "continuity-decided", outcome);
    return clone(nextLife);
  }

  function beginNextLife(state, options) {
    const continuity = ensureContinuity(state);
    if (continuity.life.status !== "ended") return null;
    if (!continuity.nextLife.resolved || !CONTINUITY_OUTCOMES.includes(continuity.nextLife.outcome)) return null;
    const priorLifeId = continuity.life.lifeId;
    if (!hasLifeEndedRecord(continuity.history, continuity.life.lifeId)) {
      pushLifeEvent(state, "life-ended", continuity.life.endReason || "unknown");
    }
    const nextLife = clone(continuity.nextLife);
    const nextAbsoluteMinute = Number.isFinite(Number(nextLife.targetAbsoluteMinute))
      ? Math.max(0, Math.floor(Number(nextLife.targetAbsoluteMinute)))
      : absoluteMinute(state);
    const currentAbsoluteMinute = absoluteMinute(state);
    const normalizedStartMinute = nextLife.outcome === "same-world-later"
      ? Math.max(nextAbsoluteMinute, currentAbsoluteMinute)
      : nextAbsoluteMinute;
    const priorWorldId = continuity.identity.worldId;
    const nextWorldId = typeof nextLife.targetWorldId === "string" && nextLife.targetWorldId.trim()
      ? nextLife.targetWorldId.trim()
      : priorWorldId;
    const crossedWorld = nextLife.outcome === "different-world" && nextWorldId !== priorWorldId;
    if (crossedWorld) {
      continuity.identity.worldId = nextWorldId;
      continuity.identity.universeId = continuity.identity.universeId || DEFAULT_CONTINUITY.identity.universeId;
      continuity.identity.lineageRootId = nextWorldId;
      continuity.identity.parentWorldId = null;
      continuity.identity.explicitConnection = normalizeExplicitConnection(nextLife.explicitConnection);
      continuity.timeline.worldStartAbsoluteMinute = nextAbsoluteMinute;
      continuity.timeline.continuitySeed = "seed:" + nextWorldId;
      continuity.timeline.continuityDecision = null;
      continuity.history.lifeEvents = [];
      continuity.history.persistentConsequences = [];
    }
    continuity.life.ordinal = Math.max(1, Number(continuity.life.ordinal) || 1) + 1;
    continuity.life.lifeId = "life:" + continuity.life.ordinal;
    continuity.life.status = "active";
    continuity.life.startedAtAbsoluteMinute = normalizedStartMinute;
    continuity.life.endedAtAbsoluteMinute = null;
    continuity.life.endReason = null;
    continuity.knowledge.traces = [];
    state.world.gameStatus = "active";
    state.world.ending = null;
    continuity.timeline.continuityDecision = null;
    resetNextLifeSlot(continuity);
    if (nextLife.outcome === "same-world-later" && normalizedStartMinute > currentAbsoluteMinute) {
      state.world.day = Math.floor(normalizedStartMinute / 1440);
      state.world.minutes = normalizedStartMinute % 1440;
      state.world.npcSimulationMinute = normalizedStartMinute;
      state.world.factionSimulationDay = state.world.day - 1;
    }
    continuity.history.lifeEvents.push({
      type: "life-started",
      absoluteMinute: absoluteMinute(state),
      lifeId: continuity.life.lifeId,
      detail: "from:" + priorLifeId
    });
    if (continuity.history.lifeEvents.length > 40) continuity.history.lifeEvents.splice(0, continuity.history.lifeEvents.length - 40);
    return clone(continuity.life);
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
  Core.ensureWorldContinuity = ensureContinuity;
  Core.markLifeTerminated = markLifeTerminated;
  Core.resolveNextLifeOutcome = resolveNextLifeOutcome;
  Core.beginNextLife = beginNextLife;
  Core.DEFAULT_RELATIONS = DEFAULT_RELATIONS;
  Core.DEFAULT_ECONOMY = DEFAULT_ECONOMY;
})(AnonymousRPG.Core);
