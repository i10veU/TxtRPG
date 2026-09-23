window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.UI = AnonymousRPG.UI || {};

(function (UI, Core, Data) {
  function esc(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  const factionNames = {
    merchants: "상인회",
    guard: "경비대",
    archive: "기록관",
    rural: "농촌 대표단",
    innkeepers: "여관망",
    workers: "노동자"
  };

  function relationLabel(value) {
    const score = Number(value) || 0;
    if (score >= 60) return "우호";
    if (score >= 20) return "협조적";
    if (score > -20) return "중립";
    if (score > -60) return "경계";
    return "적대적";
  }

  UI.render = function (state) {
    const place = Data.places[state.player.place];
    const clock = Core.getClock(state);
    document.getElementById("location").textContent = "세르카 · " + (place ? place.name : state.player.place);
    document.getElementById("dateText").textContent = "183년 · " + (state.world.day + 1) + "일";
    document.getElementById("timeText").textContent = clock.part + " " + clock.text;
    document.getElementById("moneyText").textContent = state.player.money;
    document.getElementById("hpText").textContent = state.player.hp + "/" + state.player.maxHp;
    document.getElementById("fatigueText").textContent = state.player.fatigue + "/" + state.player.maxFatigue;

    document.getElementById("inventoryList").innerHTML = Object.entries(state.player.inventory).map(function (entry) {
      return '<li><span>' + esc(entry[0]) + '</span><b>' + esc(entry[1]) + '</b></li>';
    }).join("");

    const discovered = Array.from(new Set(state.world.discovered));
    const openCases = state.world.cases.filter(function (entry) { return entry.status === "open"; }).map(function (entry) {
      return "사건: " + Data.caseDefinitions[entry.id].title;
    });
    const known = discovered.concat(openCases);
    document.getElementById("knownList").innerHTML = known.map(function (item) { return "<li>" + esc(item) + "</li>"; }).join("") || "<li>아직 없음</li>";

    const npcList = Object.values(state.npcs).map(function (npc) {
      const npcPlace = Data.places[npc.place];
      const faction = npc.faction ? factionNames[npc.faction] : "무소속";
      return '<li><span>' + esc(npc.name) + '</span><small>' + esc(npcPlace ? npcPlace.name : npc.place) + ' · ' + esc(npc.lastAction || npc.goal) + ' · ' + esc(faction) + ' · 신뢰 ' + esc(Math.round(Number(npc.trust) || 0)) + '</small></li>';
    });
    document.getElementById("npcList").innerHTML = npcList.join("") || "<li>없음</li>";

    const relationList = Object.keys(factionNames).map(function (id) {
      const score = Number(state.world.relations && state.world.relations[id]) || 0;
      return '<li><span>' + esc(factionNames[id]) + '</span><small>' + esc(relationLabel(score)) + ' · ' + esc(score) + '</small></li>';
    });
    let relationPanel = document.getElementById("relationList");
    if (!relationPanel) {
      relationPanel = document.createElement("ul");
      relationPanel.id = "relationList";
      const aside = document.querySelector("aside.status");
      const section = document.createElement("section");
      section.innerHTML = "<small>FACTIONS</small>";
      section.appendChild(relationPanel);
      aside.appendChild(section);
    }
    relationPanel.innerHTML = relationList.join("");

    document.getElementById("storyBody").innerHTML = state.log.map(function (turn) {
      return '<article class="turn">' + '<div class="time">' + esc(turn.time) + '</div>' +
        (turn.action ? '<div class="actionText">' + esc(turn.action) + '</div>' : "") +
        '<div class="' + (turn.system ? "system" : "narrative") + '">' + esc(turn.narrative) + '</div></article>';
    }).join("");
    window.scrollTo(0, document.body.scrollHeight);
  };

  UI.addTurn = function (state, narrative, action, system) {
    state.log.push({ time: (state.world.day + 1) + "일째 · " + Core.getClock(state).text, narrative: narrative, action: action || null, system: Boolean(system) });
    if (state.log.length > 60) state.log.shift();
  };
})(AnonymousRPG.UI, AnonymousRPG.Core, AnonymousRPG.Data);
