/* =======================================================================
   FYNX Global Theme Toggle
   File: assets/theme.js
   Persists across pages via localStorage
   ======================================================================= */

(function () {
  const STORAGE_KEY = "fynx_theme"; // "dark" | "light"

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {}
    return "dark"; // default
  }

  function applyRootTheme(theme) {
    const isLight = theme === "light";
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
    document.documentElement.style.backgroundColor = isLight ? "#fbfbfb" : "#000000";
  }

  function applyTheme(theme) {
    const isLight = theme === "light";

    applyRootTheme(theme);

    if (!document.body) return;

    // Body classes (your system)
    document.body.classList.toggle("light-mode", isLight);
    document.body.classList.toggle("dark-mode", !isLight);
  }

  function setSavedTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }

  // Apply as early as possible to avoid theme/background flash on hard loads.
  applyRootTheme(getSavedTheme());



  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    applyTheme(event.newValue === "light" ? "light" : "dark");
  });

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
