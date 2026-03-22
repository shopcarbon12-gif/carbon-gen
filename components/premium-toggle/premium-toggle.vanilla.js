/**
 * Optional helpers for the standalone HTML demo (demo.html).
 * Native checkbox toggling works without this file.
 */
(function () {
  /**
   * @param {HTMLInputElement} input
   */
  function syncSwitchRole(input) {
    if (input.getAttribute("role") === "switch") {
      input.setAttribute("aria-checked", input.checked ? "true" : "false");
    }
  }

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(".pt-switch__input")) {
      syncSwitchRole(t);
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".pt-switch__input[role='switch']").forEach(syncSwitchRole);
  });
})();
