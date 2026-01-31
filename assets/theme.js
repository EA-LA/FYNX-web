/* =======================================================================
   FYNX Global Theme Toggle
   File: assets/theme.js
   Persists across pages via localStorage
   ======================================================================= */

(function () {
  const STORAGE_KEY = "fynx_theme"; // "dark" | "light"

  function applyTheme(theme) {
    const isLight = theme === "light";
    document.body.classList.toggle("light-mode", isLight);
    document.body.classList.toggle("dark-mode", !isLight);
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
  }

  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return "dark"; // default
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Apply saved theme on every page load
    applyTheme(getSavedTheme());

    // Bind any toggle buttons found on the page
    document.querySelectorAll("[data-fynx-theme-toggle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const current = getSavedTheme();
        const next = current === "dark" ? "light" : "dark";
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
      });
    });
  });
})();
