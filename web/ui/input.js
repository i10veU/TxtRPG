window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.UI = AnonymousRPG.UI || {};

AnonymousRPG.UI.bindInput = function (dispatch) {
  const form = document.getElementById("actionForm");
  const input = document.getElementById("actionInput");
  const close = document.getElementById("overlayClose");

  if (close) {
    close.addEventListener("click", AnonymousRPG.UI.closePanel);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    dispatch(text);
    input.value = "";
    input.focus();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      AnonymousRPG.UI.closePanel();
      input.focus();
      return;
    }

    if (event.target === input) return;

    const panels = {
      "1":["STATUS","status"],
      "2":["INVENTORY","inventory"],
      "3":["NPC","npc"],
      "4":["FACTIONS","faction"],
      "5":["CASES","cases"]
    };

    const item = panels[event.key];
    if (item) {
      AnonymousRPG.UI.openPanel(item[0], item[1]);
      event.preventDefault();
      input.focus();
    }
  });
};
