/* =======================================================================
   FYNX Global Theme Toggle
   File: assets/theme.js
   Persists across pages via localStorage
   ======================================================================= */

(function () {
  const STORAGE_KEY = "fynx_theme"; // "dark" | "light"

  function applyTheme(theme) {
    const isLight = theme === "light";

    // Body classes (your system)
    document.body.classList.toggle("light-mode", isLight);
    document.body.classList.toggle("dark-mode", !isLight);

    // Optional: dataset for CSS hooks if you want it
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
  }

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {}
    return "dark"; // default
  }

  function setSavedTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Apply saved theme on every page load
    applyTheme(getSavedTheme());

    // Bind any toggle buttons found on the page
    document.querySelectorAll("[data-fynx-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const current = getSavedTheme();
        const next = current === "dark" ? "light" : "dark";
        setSavedTheme(next);
        applyTheme(next);
      });
    });
  });
})();
