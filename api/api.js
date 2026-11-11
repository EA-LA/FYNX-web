(() => {
  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('api-navigation');
  const closeMenu = () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation'); };
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    nav.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('open')) { closeMenu(); menu.focus(); } });
  document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-lang]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    document.querySelectorAll('[data-example]').forEach(panel => { panel.hidden = panel.dataset.example !== button.dataset.lang; });
  }));
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const code = button.closest('.code').querySelector('code');
    const status = document.getElementById('copy-status');
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'Copied'; status.textContent = 'Code copied to clipboard.';
    } catch {
      const range = document.createRange(); range.selectNodeContents(code);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      button.textContent = 'Selected'; status.textContent = 'Clipboard unavailable. Code selected; use your copy shortcut.';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 2200);
  }));
})();
