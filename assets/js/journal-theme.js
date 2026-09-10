/* Shared theme adapter for public pages, tools and the owner workspace. */
(() => {
  const key = 'fynx_theme';
  function saved() { try { return localStorage.getItem(key) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } }
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.backgroundColor = theme === 'light' ? '#f6f8f7' : '#0b0d0c';
    if (!document.body) return;
    document.body.classList.toggle('dark-mode', theme === 'dark');
    document.body.classList.toggle('light-mode', theme === 'light');
    document.querySelectorAll('[data-journal-theme], [data-fynx-theme-toggle]').forEach(button => {
      button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
      button.setAttribute('aria-pressed', String(theme === 'light'));
    });
  }
  const selector = '[data-journal-theme], [data-fynx-theme-toggle], #themeToggle, #theme-toggle, .theme-toggle, .fynx-network-theme';
  apply(saved());
  document.addEventListener('click', event => {
    const button = event.target.closest(selector);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(key, next); } catch {}
    apply(next);
    window.dispatchEvent(new CustomEvent('fynx-theme-change', { detail: next }));
  }, true);
  function initialize() {
    apply(saved());
    if (!document.querySelector(selector)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-utility fynx-theme-toggle';
      button.dataset.journalTheme = '';
      button.textContent = '◐';
      document.body.append(button);
      apply(saved());
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
  window.addEventListener('storage', event => { if (event.key === key) apply(saved()); });
})();
