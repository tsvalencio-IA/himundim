(() => {
  "use strict";
  let theme = "light";
  try { theme = localStorage.getItem("himundim-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch (_) {}
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  function refresh() {
    document.querySelectorAll(".theme-toggle").forEach(button => {
      const dark = document.documentElement.dataset.theme === "dark";
      button.textContent = dark ? "Tema claro" : "Tema escuro";
      button.setAttribute("aria-label", dark ? "Usar tema claro" : "Usar tema escuro");
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    refresh();
    document.querySelectorAll(".theme-toggle").forEach(button => button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("himundim-theme", next); } catch (_) {}
      refresh();
    }));
  });
})();
