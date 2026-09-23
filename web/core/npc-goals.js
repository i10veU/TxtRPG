window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core, Data) {
  const DEFAULT_TARGET = 3;

  function ensure(state) {
    Object.keys(state.npcs || {}).forEach(function (id) {
      const npc = state.npcs[id];
      if (!npc.goalState) {
        npc.goalState = {
          id: "goal-" + id,
          status: "active",
          progress: 0,
          target: Math.max(1, Number(npc.goalTarget) || DEFAULT_TARGET),
          lastProgressMinute: null,
          completedAt: null
        };
      }

      npc.goalState.progress = Math.max(0, Number(npc.goalState.progress) || 0);
      npc.goalState.target = Math.max(1, Number(npc.goalState.target) || DEFAULT_TARGET);

      if (npc.goalState.status !== "complete") {
        npc.goalState.status = "active";
      }
    });
  }

  function progress(state, id, amount, absoluteMinute, reason) {
    ensure(state);
    const npc = state.npcs[id];
    if (!npc || !npc.goalState || npc.goalState.status === "complete") return null;

    const goal = npc.goalState;
    const delta = Math.max(0, Number(amount) || 0);
    if (!delta) return null;

    goal.progress = Math.min(goal.target, goal.progress + delta);
    goal.lastProgressMinute = Number(absoluteMinute) || Core.getAbsoluteMinute(state);

    if (goal.progress < goal.target) return null;

    goal.status = "complete";
    goal.completedAt = goal.lastProgressMinute;

    if (npc.faction) Core.adjustRelation(state, npc.faction, 1);

    return npc.name + "이(가) 개인 목표를 달성했다: " + npc.goal +
      (reason ? " (" + reason + ")" : "");
  }

  function status(state, id) {
    ensure(state);
    const npc = state.npcs[id];
    if (!npc) return null;
    const goal = npc.goalState;
    return {
      id: id,
      name: npc.name,
      goal: npc.goal,
      status: goal.status,
      progress: goal.progress,
      target: goal.target,
      completedAt: goal.completedAt
    };
  }

  Core.ensureNPCGoals = ensure;
  Core.progressNPCGoal = progress;
  Core.getNPCGoalStatus = status;
})(AnonymousRPG.Core, AnonymousRPG.Data);
