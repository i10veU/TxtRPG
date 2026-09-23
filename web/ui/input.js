window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.UI = AnonymousRPG.UI || {};

AnonymousRPG.UI.bindInput = function (dispatch) {
  const form = document.getElementById("actionForm");
  const input = document.getElementById("actionInput");

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    dispatch(text);
    input.value = "";
    input.focus();
  });
};
