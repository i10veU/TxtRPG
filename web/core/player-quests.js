window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core) {
  const QUEST_TITLES = {
    "grain-warehouse": "닫힌 창고의 곡물",
    "night-cargo": "시간표 밖의 배",
    "land-record": "서로 다른 토지 기록",
    "faction-conflict": "갈라진 도시의 이해관계",
    "trade-route": "끊기는 교역로",
    "npc-dispute": "갈라진 사람들",
    "market-crisis": "흔들리는 곡물 시장",
    "grain-aftershock": "창고 장부의 후폭풍",
    "trade-route-aftershock": "대체 공급선의 대가",
    "faction-aftershock": "깨진 합의의 잔여물",
    "npc-dispute-aftershock": "남은 말의 후폭풍"
  };

  const AFTERSHOCKS = {
    "grain-warehouse": "grain-aftershock",
    "trade-route": "trade-route-aftershock",
    "faction-conflict": "faction-aftershock",
    "npc-dispute": "npc-dispute-aftershock"
  };

  function ensure(state) {
    state.world.playerQuests = state.world.playerQuests || { chains: {} };
    state.world.playerQuests.chains = state.world.playerQuests.chains || {};
    return state.world.playerQuests;
  }

  function hasHistory(state, caseId) {
    return Array.isArray(state.world.caseHistory) && state.world.caseHistory.some(function (entry) {
      return entry.caseId === caseId && (entry.status === "resolved" || entry.status === "failed");
    });
  }

  function isFinished(entry) {
    return Boolean(entry && (entry.status === "resolved" || entry.status === "failed"));
  }

  function ensureAftershockSteps(chain, followupId) {
    chain.steps = Array.isArray(chain.steps) ? chain.steps : [];
    if (chain.steps.length < 2) {
      chain.steps = [
        { id: "investigate", text: "사건의 단서를 확인한다.", status: "pending" },
        { id: "resolve", text: "사건을 해결하거나 결론을 낸다.", status: "pending" }
      ];
    }
    if (!chain.steps.some(function (step) { return step.id === "aftermath-investigate"; })) {
      chain.steps.push({ id: "aftermath-investigate", text: "사건의 후속 문제를 확인한다.", status: "pending" });
    }
    if (!chain.steps.some(function (step) { return step.id === "aftermath-resolve"; })) {
      chain.steps.push({ id: "aftermath-resolve", text: "후속 사건을 해결하거나 결론을 낸다.", status: "pending" });
    }
    chain.aftermathCaseId = followupId;
  }

  function update(state, definitions) {
    const quests = ensure(state);
    if (!definitions) return quests;
    Object.keys(definitions).forEach(function (caseId) {
      const title = QUEST_TITLES[caseId] || definitions[caseId].title || caseId;
      const entry = state.world.cases && state.world.cases.find(function (item) { return item.id === caseId; });
      const resolved = hasHistory(state, caseId) || isFinished(entry);
      const chain = quests.chains[caseId] || {
        id: "case:" + caseId,
        title: title,
        status: "locked",
        currentStep: 0,
        steps: [
          { id: "investigate", text: "사건의 단서를 확인한다.", status: "pending" },
          { id: "resolve", text: "사건을 해결하거나 결론을 낸다.", status: "pending" }
        ]
      };
      chain.title = title;
      if (entry && entry.status === "open") chain.steps[0].status = "complete";
      if (resolved) {
        chain.steps[0].status = "complete";
        chain.steps[1].status = "complete";
      }

      const followupId = AFTERSHOCKS[caseId];
      const followup = followupId && state.world.cases && state.world.cases.find(function (item) { return item.id === followupId; });
      if (followupId) {
        ensureAftershockSteps(chain, followupId);
        if (followup && followup.status === "open") {
          chain.steps[2].text = "사건의 후속 문제를 확인했다.";
          chain.steps[2].status = "complete";
        } else {
          chain.steps[2].text = "후속 사건이 열리기를 기다린다.";
        }
        if (isFinished(followup) || hasHistory(state, followupId)) {
          chain.steps[2].status = "complete";
          chain.steps[3].status = "complete";
        }
      }

      const next = chain.steps.findIndex(function (step) { return step.status !== "complete"; });
      chain.currentStep = next < 0 ? chain.steps.length : next;
      if (next < 0) chain.status = "complete";
      else if (entry && entry.status === "open") chain.status = "active";
      else if (resolved && followupId) chain.status = "active";
      else chain.status = "locked";
      quests.chains[caseId] = chain;
    });
    return quests;
  }

  function list(state, definitions) {
    update(state, definitions);
    return Object.keys(ensure(state).chains).map(function (id) { return ensure(state).chains[id]; });
  }

  function applyCampaignProgress(state, definitions) {
    update(state, definitions);
    const tutorial = state.world.tutorial || { step: 0, completed: false };
    const status = state.world.gameStatus || "active";
    const events = [];
    if (status !== "active") return events;

    if (Number(state.player.hp) <= 0) {
      state.player.hp = 0;
      state.world.gameStatus = "lost";
      events.push("당신은 더 이상 몸을 움직일 수 없다. 이번 여정은 여기서 끝났다.");
      return events;
    }

    if (tutorial.completed && state.world.campaignPhase === "tutorial") {
      state.world.campaignPhase = "long-play";
      events.push("기본 안내를 마쳤다. 이제 열린 사건과 소문을 따라 세르카의 운명을 선택할 수 있다.");
    }

    const canonical = state.world.playerQuests.chains["grain-warehouse"];
    if (canonical && canonical.status === "complete" && !state.world.finaleReady) {
      state.world.finaleReady = true;
      state.world.campaignPhase = "finale-ready";
      events.push("첫 번째 사건의 연쇄를 끝까지 매듭지었다. 이제 결말을 선택할 수 있다.");
    }

    if (tutorial.completed) return events;
    const next = Math.max(0, Math.min(4, Number(tutorial.step) || 0));
    if (next >= 3) {
      tutorial.step = 4;
      tutorial.completed = true;
      events.push("기본 안내를 마쳤다. 이제 열린 사건과 소문을 따라 세르카의 운명을 선택할 수 있다.");
      state.world.campaignPhase = "long-play";
    }
    return events;
  }

  function resolveFinale(state) {
    if (!state.world.finaleReady) return { narrative: "아직 결말을 선택할 때가 아니다. 첫 번째 사건의 연쇄를 먼저 끝내야 한다.", changed: false };
    state.world.gameStatus = "won";
    state.world.campaignPhase = "complete";
    state.world.ending = "canonical";
    return { narrative: "당신은 첫 번째 사건의 결과를 받아들였다. 세르카의 내일은 당신의 선택 위에 놓였다.", changed: true };
  }

  Core.resolveFinale = resolveFinale;
  Core.ensurePlayerQuests = ensure;
  Core.applyCampaignProgress = applyCampaignProgress;
  Core.updatePlayerQuests = update;
  Core.listPlayerQuests = list;
})(AnonymousRPG.Core);
