window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core, Data) {
  const STEP_MINUTES = 30;

  function scheduleFor(npc, hour) {
    const schedule = npc.schedule || [];
    for (let i = 0; i < schedule.length; i += 1) {
      const entry = schedule[i];
      if (hour >= entry.from && hour < entry.to) return entry;
    }
    return null;
  }

  function routineKey(routine) {
    if (!routine) return null;
    return [routine.from, routine.to, routine.place, routine.action].join(":");
  }

  function moveNpc(state, npc, target) {
    if (!target || npc.place === target) return false;
    npc.place = target;
    return true;
  }

  function applyRoutineEffect(state, id, npc, routine) {
    if (!routine || !routine.effect) return null;
    if (routine.effect === "grain") state.world.grainSupply = Core.clamp(state.world.grainSupply + 1, 0, 100);
    if (routine.effect === "security") state.world.security = Core.clamp(state.world.security + 1, 0, 100);
    if (routine.effect === "tension") state.world.tension = Core.clamp(state.world.tension + 1, 0, 100);
    if (routine.effect === "rumor") state.world.rumorPressure += 1;
    if (routine.effect === "repair") state.world.security = Core.clamp(state.world.security + 1, 0, 100);
    return id + ":" + routine.action;
  }

  function applyFactionDrift(state, npc, routine) {
    if (!npc.faction) return;
    const sentiment = Number(state.world.relations[npc.faction]) || 0;
    if (sentiment >= 40) npc.trust = Core.clamp((Number(npc.trust) || 0) + 0.02, -100, 100);
    if (sentiment <= -40) npc.trust = Core.clamp((Number(npc.trust) || 0) - 0.02, -100, 100);
    if (sentiment <= -60 && routine && routine.effect === "rumor") state.world.rumorPressure += 1;
  }

  function emitRoutineSignal(state, npc, routine, absoluteMinute) {
    if (!routine || !routine.signal) return null;
    Core.recordEventSignal(state, routine.signal, npc.name, absoluteMinute, routine.signalText);
    return routine.signalText || (npc.name + "의 행동에서 새로운 정황이 발생했다.");
  }

  function simulateTick(state, absoluteMinute) {
    const hour = Math.floor((absoluteMinute % 1440) / 60);
    const events = [];

    Object.keys(state.npcs).forEach(function (id) {
      const npc = state.npcs[id];
      const routine = scheduleFor(npc, hour);

      if (!routine) {
        npc.activeRoutineKey = null;
        return;
      }

      const key = routineKey(routine);
      const entered = npc.activeRoutineKey !== key;
      const moved = moveNpc(state, npc, routine.place);
      const effect = applyRoutineEffect(state, id, npc, routine);
      applyFactionDrift(state, npc, routine);
      const goalEvent = entered && Core.progressNPCGoal
        ? Core.progressNPCGoal(state, id, 1, absoluteMinute, routine.action)
        : null;
      npc.lastAction = routine.action;
      npc.lastTick = absoluteMinute;
      npc.activeRoutineKey = key;

      if (entered && routine.signal) {
        events.push(npc.name + ": " + emitRoutineSignal(state, npc, routine, absoluteMinute));
      }
      if (entered && moved && routine.announce) {
        events.push(npc.name + "이(가) " + Data.places[routine.place].name + "으로 이동했다.");
      }
      if (entered && effect && routine.announce) {
        events.push(npc.name + "이(가) " + routine.action + "을(를) 했다.");
      }
      if (entered && routine.announce && npc.faction && Number(state.world.relations[npc.faction]) <= -60) {
        events.push(npc.name + "이(가) 당신에 대한 경계를 주변에 퍼뜨렸다.");
      }
      if (goalEvent) events.push(goalEvent);
    });

    if (Core.simulateFactionWorld) {
      Core.simulateFactionWorld(state, absoluteMinute).forEach(function (event) {
        events.push(event);
      });
    }

    return events;
  }

  Core.simulateNPCs = function (state) {
    if (!state || !state.npcs) return [];
    if (Core.ensureNPCGoals) Core.ensureNPCGoals(state);

    const end = Core.getAbsoluteMinute(state);
    let cursor = Number(state.world.npcSimulationMinute);

    if (!Number.isFinite(cursor)) cursor = end;
    if (cursor > end) cursor = end;
    if (cursor === end) {
      state.world.npcSimulationMinute = end;
      return [];
    }

    const firstTick = Math.floor(cursor / STEP_MINUTES) * STEP_MINUTES + STEP_MINUTES;
    const events = [];

    for (let tick = firstTick; tick <= end; tick += STEP_MINUTES) {
      simulateTick(state, tick).forEach(function (event) {
        events.push(event);
      });
    }

    state.world.npcSimulationMinute = end;
    Data.ensureCases(state);
    return events.length > 8 ? events.slice(-8) : events;
  };
})(AnonymousRPG.Core, AnonymousRPG.Data);
