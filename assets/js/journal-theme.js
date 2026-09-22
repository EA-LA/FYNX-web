/* Shared theme adapter for public pages, tools and the owner workspace. */
(() => {
  const key = 'fynx_theme';
  function saved() { try { return localStorage.getItem(key) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } }
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.dataset.fynxTheme = theme;
    document.documentElement.style.backgroundColor = theme === 'light' ? '#ffffff' : '#0b0c0c';
    if (!document.body) return;
    document.body.classList.toggle('dark-mode', theme === 'dark');
    document.body.classList.toggle('light-mode', theme === 'light');
    document.querySelectorAll(selector).forEach(button => {
      button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
      button.setAttribute('aria-pressed', String(theme === 'light'));
      const label = button.querySelector('#themeLabel, #themeToggleText');
      if (button.hasAttribute('data-theme-control') && button.querySelector('[data-theme-label]')) button.querySelector('[data-theme-label]').textContent = theme === 'light' ? 'Light theme' : 'Dark theme';
      if (label) label.textContent = theme === 'light' ? 'Light' : 'Dark';
    });
  }
  const selector = '[data-journal-theme], [data-fynx-theme-toggle], #themeToggle, #themeBtn, #theme-toggle, .theme-toggle, .fynx-network-theme';
  apply(saved());
  document.addEventListener('click', event => {
    const button = event.target.closest(selector);
    if (!button || !button.matches('[data-theme-control]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(key, next); } catch {}
    apply(next);
    // Notify legacy page widgets that already subscribe to storage changes.
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: next }));
    window.dispatchEvent(new CustomEvent('fynx-theme-change', { detail: next }));
  }, true);
  function initialize() {
    apply(saved());

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
  window.addEventListener('storage', event => { if (event.key === key) apply(saved()); });
})();
