window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.UI = AnonymousRPG.UI || {};

AnonymousRPG.UI.bindInput = function (worker) {
  const form = document.getElementById("actionForm");
  const input = document.getElementById("actionInput");

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    worker.postMessage({ type: "ACTION", text: text });
    input.value = "";
    input.focus();
  });
};
