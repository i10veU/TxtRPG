window.AnonymousRPG = window.AnonymousRPG || {};

(function (RPG) {
  let state = null;
  let worker = null;
  let saveTimer = null;

  async function persist() {
    if (!state) return;
    try {
      await RPG.Storage.saveState(state);
    } catch (error) {
      console.error("save failed", error);
    }
  }

  function queuePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 40);
  }

  function fallbackAction(text) {
    const before = RPG.Core.getAbsoluteMinute(state);
    const result = RPG.Core.resolveAction(state, text);
    const after = RPG.Core.getAbsoluteMinute(state);
    const npcEvents = RPG.Core.simulateNPCs(state, Math.max(0, after - before));
    const organizationEvents = RPG.Core.simulateOrganizations(state, after);
    const relationshipEvents = RPG.Core.simulateOrganizationRelations ? RPG.Core.simulateOrganizationRelations(state, after) : [];
    const npcRelationEvents = RPG.Core.simulateNPCRelations ? RPG.Core.simulateNPCRelations(state, after) : [];
    const economyEvent = RPG.Core.simulateEconomy(state, after);
    const regionalEconomyEvent = RPG.Core.simulateRegionalEconomy ? RPG.Core.simulateRegionalEconomy(state, after) : null;
    const caseCausalityEvent = RPG.Core.simulateCaseCausality ? RPG.Core.simulateCaseCausality(state, after) : null;
    const campaignEvents = RPG.Core.applyCampaignProgress
      ? RPG.Core.applyCampaignProgress(state, RPG.Data.caseDefinitions)
      : (RPG.Core.updatePlayerQuests ? (RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions), []) : []);
    if (result.narrative) RPG.Core.appendLog(state, result.narrative, result.action);
    npcEvents.forEach(function (event) {
      RPG.Core.appendLog(state, event, null, true);
    });
    organizationEvents.forEach(function (event) {
      RPG.Core.appendLog(state, event, null, true);
    });
    relationshipEvents.forEach(function (event) {
      RPG.Core.appendLog(state, event, null, true);
    });
    npcRelationEvents.forEach(function (event) {
      RPG.Core.appendLog(state, event, null, true);
    });
    if (economyEvent) RPG.Core.appendLog(state, economyEvent, null, true);
    if (regionalEconomyEvent) RPG.Core.appendLog(state, regionalEconomyEvent, null, true);
    if (caseCausalityEvent) RPG.Core.appendLog(state, caseCausalityEvent, null, true);
    campaignEvents.forEach(function (event) { RPG.Core.appendLog(state, event, null, true); });
    RPG.UI.render(state);
    queuePersist();
  }

  function dispatchAction(text) {
    if (worker) {
      worker.postMessage({ type: "ACTION", text: text });
      return;
    }
    fallbackAction(text);
  }

  function handleWorkerFailure() {
    if (!worker) return;
    worker.terminate();
    worker = null;
    RPG.Core.appendLog(state, "게임 워커를 사용할 수 없어 메인 스레드 호환 모드로 전환했다.", null, true);
    RPG.UI.render(state);
    queuePersist();
  }

  function bootWorker(initialState) {
    try {
      worker = new Worker("worker/game-worker.js");
    } catch (error) {
      worker = null;
      return false;
    }

    worker.onmessage = function (event) {
      const message = event.data || {};

      if (message.type === "READY") {
        state = RPG.Core.normalizeState(message.payload.state);
        RPG.UI.render(state);
        queuePersist();
        return;
      }

      if (message.type === "UPDATE") {
        state = RPG.Core.normalizeState(message.payload.state);
        RPG.UI.render(state);
        queuePersist();
        return;
      }

      if (message.type === "ERROR") {
        RPG.Core.appendLog(state, "시뮬레이션 오류: " + message.payload.message, null, true);
        RPG.UI.render(state);
        queuePersist();
      }
    };

    worker.onerror = function () {
      handleWorkerFailure();
    };

    worker.postMessage({ type: "INIT", state: initialState });
    return true;
  }

  async function init() {
    const loaded = await RPG.Storage.loadState();
    state = loaded.state
      ? RPG.Core.normalizeState(loaded.state)
      : RPG.Core.createDefaultState(RPG.Data.npcs);

    RPG.Core.ensureEconomy(state);
    if (RPG.Core.ensureRegionalEconomy) RPG.Core.ensureRegionalEconomy(state);
    RPG.Core.ensureOrganizations(state);
    if (RPG.Core.ensureOrganizationRelations) RPG.Core.ensureOrganizationRelations(state);
    if (RPG.Core.ensureNPCRelations) RPG.Core.ensureNPCRelations(state);
    if (RPG.Core.ensureNPCGoals) RPG.Core.ensureNPCGoals(state);
    if (RPG.Core.ensureCaseCausality) RPG.Core.ensureCaseCausality(state);
    RPG.Data.ensureCases(state);
    if (RPG.Core.updatePlayerQuests) RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);

    if (!state.log.length) {
      RPG.UI.addTurn(state, "비가 그친 새벽이다. 젖은 돌바닥 위로 사람들이 하루를 시작했다. 누구도 당신을 기다리지 않는다.");
      RPG.UI.addTurn(state, "북문 시장에서는 가게마다 곡물 가격이 조금씩 다르다. 광장 건너편에서는 경비대원이 상인의 저울을 확인하고 있다.");
    }

    RPG.UI.render(state);
    bootWorker(state);
    RPG.UI.bindInput(dispatchAction);

    window.addEventListener("beforeunload", persist);
    document.title = "무명의 연대기 — TXT RPG";
    queuePersist();
  }

  window.AnonymousRPGApp = {
    getState: function () { return state; },
    getRuntimeStatus: function () {
      return {
        workerActive: Boolean(worker),
        storage: RPG.Storage.databaseName
      };
    },
    save: persist,
    reset: function () {
      if (worker) {
        worker.postMessage({ type: "RESET" });
        return;
      }
      state = RPG.Core.createDefaultState(RPG.Data.npcs);
      RPG.Core.ensureEconomy(state);
      if (RPG.Core.ensureRegionalEconomy) RPG.Core.ensureRegionalEconomy(state);
      RPG.Core.ensureOrganizations(state);
      if (RPG.Core.ensureOrganizationRelations) RPG.Core.ensureOrganizationRelations(state);
      if (RPG.Core.ensureNPCRelations) RPG.Core.ensureNPCRelations(state);
      if (RPG.Core.ensureNPCGoals) RPG.Core.ensureNPCGoals(state);
      if (RPG.Core.ensureCaseCausality) RPG.Core.ensureCaseCausality(state);
      RPG.Data.ensureCases(state);
      if (RPG.Core.updatePlayerQuests) RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
      RPG.UI.render(state);
      persist();
    }
  };

  init().catch(function (error) {
    console.error(error);
    const story = document.getElementById("storyBody");
    story.textContent = "게임 초기화에 실패했다: " + error.message;
  });
})(AnonymousRPG);
