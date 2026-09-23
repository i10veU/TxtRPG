window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core, Data) {
  const STEP_MINUTES = 30;

  function absoluteMinute(state) { return state.world.day * 1440 + state.world.minutes; }

  function scheduleFor(npc, hour) {
    const schedule = npc.schedule || [];
    for (let i = 0; i < schedule.length; i += 1) {
      const entry = schedule[i];
      if (hour >= entry.from && hour < entry.to) return entry;
    }
    return null;
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

  function simulateTick(state, absolute) {
    const hour = Math.floor((absolute % 1440) / 60);
    const events = [];
    Object.keys(state.npcs).forEach(function (id) {
      const npc = state.npcs[id];
      const routine = scheduleFor(npc, hour);
      if (!routine) return;
      const moved = moveNpc(state, npc, routine.place);
      const effect = applyRoutineEffect(state, id, npc, routine);
      applyFactionDrift(state, npc, routine);
      npc.lastAction = routine.action;
      npc.lastTick = absolute;
      if (moved && routine.announce) events.push(npc.name + "이(가) " + Data.places[routine.place].name + "으로 이동했다.");
      if (effect && routine.announce) events.push(npc.name + "이(가) " + routine.action + "을(를) 했다.");
      if (routine.announce && npc.faction && Number(state.world.relations[npc.faction]) <= -60) {
        events.push(npc.name + "이(가) 당신에 대한 경계를 주변에 퍼뜨렸다.");
      }
    });
    return events;
  }

  Core.simulateNPCs = function (state, elapsedMinutes) {
    const elapsed = Math.max(0, Number(elapsedMinutes) || 0);
    if (!elapsed || !state.npcs) return [];
    const end = absoluteMinute(state);
    const start = Math.max(0, end - elapsed);
    const firstTick = Math.ceil(start / STEP_MINUTES) * STEP_MINUTES;
    const events = [];
    for (let tick = firstTick; tick <= end; tick += STEP_MINUTES) {
      simulateTick(state, tick).forEach(function (event) { events.push(event); });
    }
    return events.length > 8 ? events.slice(-8) : events;
  };

  Core.getAbsoluteMinute = absoluteMinute;
})(AnonymousRPG.Core, AnonymousRPG.Data);
