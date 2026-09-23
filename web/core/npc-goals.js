window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core, Data) {
  const DEFAULT_TARGET = 3;

  const GOAL_CHAINS = {
    mara: [
      { text: "안정적인 곡물 공급 유지", target: 3, actions: ["시장 거래", "창고 장부 확인", "곡물 판매"] },
      { text: "시장 재고 기록 정리", target: 2, actions: ["창고 장부 확인", "시장 거래"] }
    ],
    jonas: [
      { text: "부두의 이상 화물 확인", target: 3, actions: ["하역 작업", "화물 목록 대조", "야간 선박 감시"] },
      { text: "부두 작업자와 화물 기록 공유", target: 2, actions: ["화물 목록 대조", "야간 선박 감시"] }
    ],
    serin: [
      { text: "오류가 있는 기록 추적", target: 3, actions: ["공문서 대조", "토지 기록 조사"] },
      { text: "공개 기록 보존 상태 점검", target: 2, actions: ["공문서 대조", "토지 기록 조사"] }
    ],
    darma: [
      { text: "농촌 운송로 유지", target: 3, actions: ["농촌 생산 확인", "운송 협상", "마을 회의"] },
      { text: "농촌 비축량 확보", target: 2, actions: ["농촌 생산 확인", "운송 협상"] }
    ],
    ibrahim: [
      { text: "시장 치안 유지", target: 3, actions: ["시장 순찰", "골목 순찰", "야간 경계"] },
      { text: "시장 순찰 배치 개선", target: 2, actions: ["시장 순찰", "골목 순찰"] }
    ],
    marta: [
      { text: "소문과 손님의 흐름 관리", target: 3, actions: ["여관 준비", "손님 응대", "손님들의 소문 기록"] },
      { text: "여관 정보 교환망 정비", target: 2, actions: ["손님 응대", "손님들의 소문 기록"] }
    ],
    orel: [
      { text: "도시 시설 수리", target: 3, actions: ["시장 시설 수리", "부두 시설 수리"] },
      { text: "공공 시설 안전 점검", target: 2, actions: ["시장 시설 수리", "부두 시설 수리"] }
    ]
  };

  function chainFor(id, npc) {
    if (GOAL_CHAINS[id]) return GOAL_CHAINS[id];
    return [{ text: npc.goal || "현재 맡은 일을 끝까지 수행", target: Math.max(1, Number(npc.goalTarget) || DEFAULT_TARGET), actions: [] }];
  }

  function makeState(id, npc, chainIndex) {
    const chain = chainFor(id, npc);
    const safeIndex = Math.max(0, Math.min(chain.length - 1, Number(chainIndex) || 0));
    const definition = chain[safeIndex];
    return { id: "goal-" + id + "-" + safeIndex, chainIndex: safeIndex, status: "active", progress: 0,
      target: Math.max(1, Number(definition.target) || DEFAULT_TARGET), organization: npc.faction || null, priority: 1,
      actions: Array.isArray(definition.actions) ? definition.actions.slice() : [], goalText: definition.text,
      lastProgressMinute: null, completedAt: null, blockedAt: null, blockedReason: null, lastReviewMinute: null,
      lastReviewReason: null, replanCount: 0, replanCooldownUntil: null, completedGoals: [] };
  }

  function ensure(state) {
    Object.keys(state.npcs || {}).forEach(function (id) {
      const npc = state.npcs[id], chain = chainFor(id, npc);
      if (!npc.goalState || typeof npc.goalState !== "object") npc.goalState = makeState(id, npc, 0);
      const goal = npc.goalState, chainIndex = Math.max(0, Math.min(chain.length - 1, Number(goal.chainIndex) || 0)), definition = chain[chainIndex];
      goal.id = goal.id || ("goal-" + id + "-" + chainIndex); goal.chainIndex = chainIndex;
      goal.status = ["active", "blocked", "complete", "abandoned"].includes(goal.status) ? goal.status : "active";
      goal.progress = Math.max(0, Number(goal.progress) || 0); goal.target = Math.max(1, Number(goal.target) || Number(definition.target) || DEFAULT_TARGET);
      goal.organization = goal.organization || npc.faction || null; goal.priority = Number.isFinite(Number(goal.priority)) ? Number(goal.priority) : 1;
      goal.actions = Array.isArray(goal.actions) ? goal.actions.slice() : definition.actions.slice();
      goal.goalText = goal.goalText || definition.text || npc.goal || "현재 맡은 일을 끝까지 수행";
      goal.lastProgressMinute = goal.lastProgressMinute == null ? null : Number(goal.lastProgressMinute);
      goal.completedAt = goal.completedAt == null ? null : Number(goal.completedAt); goal.blockedAt = goal.blockedAt == null ? null : Number(goal.blockedAt);
      goal.blockedReason = goal.blockedReason || null; goal.lastReviewMinute = goal.lastReviewMinute == null ? null : Number(goal.lastReviewMinute);
      goal.lastReviewReason = goal.lastReviewReason || null; goal.replanCount = Math.max(0, Number(goal.replanCount) || 0);
      goal.replanCooldownUntil = goal.replanCooldownUntil == null ? null : Number(goal.replanCooldownUntil);
      goal.completedGoals = Array.isArray(goal.completedGoals) ? goal.completedGoals.slice(-8) : [];
      if (goal.status === "active" && goal.progress >= goal.target) goal.progress = goal.target;
      npc.goal = goal.goalText;
    });
  }

  function organizationPressure(state, npc) { const id = npc && npc.faction; if (!id || !state.world.organizations || !state.world.organizations[id]) return 0; return Number(state.world.organizations[id].goalPressure) || 0; }

  function review(state, id, absoluteMinute) {
    ensure(state); const npc = state.npcs[id]; if (!npc) return null; const goal = npc.goalState, pressure = organizationPressure(state, npc), minute = Number(absoluteMinute) || Core.getAbsoluteMinute(state); goal.lastReviewMinute = minute;
    if (goal.status === "complete") return null;
    if (pressure <= -2) {
      if (goal.status !== "blocked") { goal.status = "blocked"; goal.blockedAt = minute; goal.blockedReason = "조직의 우선순위가 현재 목표와 충돌한다."; goal.lastReviewReason = goal.blockedReason; return npc.name + "의 목표가 일시 중단됐다: " + goal.goalText; }
      goal.lastReviewReason = goal.blockedReason || "조직 압력으로 중단됨";
      if (goal.blockedAt != null && minute - goal.blockedAt >= 1440 && (goal.replanCooldownUntil == null || minute >= goal.replanCooldownUntil)) return replan(state, id, minute, "중단 상태가 하루 이상 지속됐다.");
      return null;
    }
    if (goal.status === "blocked") { goal.status = "active"; goal.blockedAt = null; goal.blockedReason = null; goal.lastReviewReason = "조직 우선순위가 회복됐다."; return npc.name + "이(가) 조직의 우선순위 변화에 따라 목표를 재개했다: " + goal.goalText; }
    goal.priority = Core.clamp(1 + pressure, 0, 3); return null;
  }

  function replan(state, id, absoluteMinute, reason) {
    ensure(state); const npc = state.npcs[id]; if (!npc) return null; const goal = npc.goalState, chain = chainFor(id, npc);
    if (chain.length < 2) { goal.status = "abandoned"; goal.lastReviewMinute = absoluteMinute; goal.lastReviewReason = reason || "재계획 가능한 후속 목표가 없음"; return npc.name + "이(가) 현재 목표를 포기했다: " + goal.goalText; }
    const oldText = goal.goalText, nextIndex = (goal.chainIndex + 1) % chain.length, definition = chain[nextIndex];
    goal.completedGoals.push({ id: goal.id, text: oldText, status: "abandoned", reason: reason || "목표 재계획", minute: absoluteMinute }); goal.completedGoals = goal.completedGoals.slice(-8);
    goal.chainIndex = nextIndex; goal.id = "goal-" + id + "-" + nextIndex + "-" + (goal.replanCount + 1); goal.status = "active"; goal.progress = 0;
    goal.target = Math.max(1, Number(definition.target) || DEFAULT_TARGET); goal.actions = Array.isArray(definition.actions) ? definition.actions.slice() : []; goal.goalText = definition.text; goal.priority = 1;
    goal.completedAt = null; goal.blockedAt = null; goal.blockedReason = null; goal.lastProgressMinute = null; goal.lastReviewMinute = Number(absoluteMinute); goal.lastReviewReason = reason || "목표 재계획";
    goal.replanCount += 1; goal.replanCooldownUntil = Number(absoluteMinute) + 10080; npc.goal = goal.goalText;
    return npc.name + "이(가) 목표를 재계획했다: " + oldText + " → " + goal.goalText;
  }

  function isRelevantRoutine(goal, reason) { if (!goal.actions || !goal.actions.length) return true; return goal.actions.indexOf(reason) !== -1; }

  function progress(state, id, amount, absoluteMinute, reason) {
    ensure(state); const npc = state.npcs[id]; if (!npc || !npc.goalState || npc.goalState.status !== "active") return null; const goal = npc.goalState;
    const reviewEvent = review(state, id, absoluteMinute); if (goal.status !== "active") return reviewEvent; if (!isRelevantRoutine(goal, reason)) return reviewEvent;
    const pressure = organizationPressure(state, npc), multiplier = pressure >= 2 ? 2 : 1, delta = Math.max(0, Number(amount) || 0) * multiplier; if (!delta) return reviewEvent;
    goal.progress = Math.min(goal.target, goal.progress + delta); goal.lastProgressMinute = Number(absoluteMinute) || Core.getAbsoluteMinute(state);
    if (goal.progress < goal.target) { const progressEvent = npc.name + "의 개인 목표가 진행됐다: " + goal.goalText + " [" + goal.progress + "/" + goal.target + "]"; return reviewEvent ? reviewEvent + " " + progressEvent : progressEvent; }
    goal.status = "complete"; goal.completedAt = goal.lastProgressMinute; goal.completedGoals.push({ id: goal.id, text: goal.goalText, status: "complete", minute: goal.completedAt }); goal.completedGoals = goal.completedGoals.slice(-8);
    if (npc.faction) Core.adjustRelation(state, npc.faction, 1);
    const chain = chainFor(id, npc);
    if (chain.length > 1) { const event = advanceAfterCompletion(state, id, goal.completedAt); return npc.name + "이(가) 개인 목표를 달성했다: " + goal.goalText + (reason ? " (" + reason + ")" : "") + (event ? " " + event : ""); }
    return npc.name + "이(가) 개인 목표를 달성했다: " + goal.goalText + (reason ? " (" + reason + ")" : "");
  }

  function advanceAfterCompletion(state, id, absoluteMinute) {
    const npc = state.npcs[id]; if (!npc) return null; const goal = npc.goalState, chain = chainFor(id, npc), nextIndex = (goal.chainIndex + 1) % chain.length, definition = chain[nextIndex];
    goal.chainIndex = nextIndex; goal.id = "goal-" + id + "-" + nextIndex + "-next"; goal.status = "active"; goal.progress = 0; goal.target = Math.max(1, Number(definition.target) || DEFAULT_TARGET);
    goal.actions = Array.isArray(definition.actions) ? definition.actions.slice() : []; goal.goalText = definition.text; goal.priority = 1; goal.completedAt = absoluteMinute; goal.blockedAt = null; goal.blockedReason = null;
    goal.lastProgressMinute = null; goal.lastReviewMinute = absoluteMinute; goal.lastReviewReason = "선행 목표 완료 후 다음 목표를 설정했다."; goal.replanCooldownUntil = null; npc.goal = goal.goalText; return "다음 목표는 " + goal.goalText + "이다.";
  }

  function status(state, id) { ensure(state); const npc = state.npcs[id]; if (!npc) return null; const goal = npc.goalState; return { id:id, name:npc.name, goal:goal.goalText || npc.goal, status:goal.status, progress:goal.progress, target:goal.target, priority:goal.priority, organization:goal.organization, blockedReason:goal.blockedReason, replanCount:goal.replanCount, completedAt:goal.completedAt, completedGoals:goal.completedGoals.slice() }; }

  Core.ensureNPCGoals = ensure; Core.progressNPCGoal = progress; Core.reviewNPCGoal = review; Core.replanNPCGoal = replan; Core.getNPCGoalStatus = status; Core.npcGoalChains = GOAL_CHAINS;
})(AnonymousRPG.Core, AnonymousRPG.Data);
