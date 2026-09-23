window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.UI = AnonymousRPG.UI || {};

AnonymousRPG.UI.bindInput = function (dispatch) {
  const form = document.getElementById("actionForm");
  const input = document.getElementById("actionInput");
  const close = document.getElementById("overlayClose");
  const history = [];
  let historyIndex = -1;

  if (close) close.addEventListener("click", AnonymousRPG.UI.closePanel);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (history[history.length - 1] !== text) history.push(text);
    if (history.length > 30) history.shift();
    historyIndex = -1;
    dispatch(text);
    input.value = "";
    input.focus();
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "ArrowUp") {
      if (!history.length) return;
      event.preventDefault();
      historyIndex = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      input.value = history[historyIndex];
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    if (event.key === "ArrowDown") {
      if (!history.length || historyIndex < 0) return;
      event.preventDefault();
      historyIndex += 1;
      if (historyIndex >= history.length) { historyIndex = -1; input.value = ""; }
      else { input.value = history[historyIndex]; input.setSelectionRange(input.value.length, input.value.length); }
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      AnonymousRPG.UI.closePanel();
      input.focus();
      return;
    }

    const panels = {
      "1":["STATUS","status"], "2":["INVENTORY","inventory"], "3":["NPC","npc"],
      "4":["FACTIONS","faction"], "5":["CASES","cases"], "6":["RUMORS","rumors"], "7":["ORGANIZATIONS","organizations"]
    };
    const item = panels[event.key];

    // When the command field is empty, numeric keys remain usable as UI shortcuts.
    // Once text has been entered, the key is treated as normal command input.
    if (event.target === input && input.value.length > 0) return;
    if (!item) return;

    AnonymousRPG.UI.openPanel(item[0], item[1]);
    event.preventDefault();
    input.focus();
  });
};
