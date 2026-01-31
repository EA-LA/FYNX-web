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

    // If you already use body.dark-mode in some pages, keep it consistent:
    document.body.classList.toggle("dark-mode", !isLight);

    // For accessibility / UI libraries:
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
  }

  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return "dark"; // default: your brand
  }

  // Apply immediately on load
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(getSavedTheme());

    // Bind any toggle button(s) found on the page
    const toggles = document.querySelectorAll("[data-fynx-theme-toggle]");
    toggles.forEach(btn => {
      btn.addEventListener("click", () => {
        const current = getSavedTheme();
        const next = current === "dark" ? "light" : "dark";
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
      });
    });
  });
})();
