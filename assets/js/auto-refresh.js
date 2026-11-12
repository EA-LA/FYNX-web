/* FYNX auto-refresh. Manual "Refresh" buttons are replaced site-wide by a live status chip:
   every page section that had a refresh control now updates itself every 10 minutes while the
   page is visible, and immediately when you come back to a tab that has gone stale.
   The original buttons stay in the DOM (hidden) so each section keeps its own refresh logic. */
(function () {
  'use strict';
  if (window.__fynxAutoRefresh) return; window.__fynxAutoRefresh = true;
  const EVERY = 10 * 60 * 1000;
  const SELECT = [
    '[data-newsroom-refresh]', '[data-news-refresh]', '[data-release-refresh]', '[data-your-refresh]', '[data-reader-refresh]',
    '#homeBriefingRefresh', '#refresh-portfolio', '#refresh-heatmap', '#refreshData', '#md-refresh', '#sentimentRefresh',
    '#refreshNewsBtn', '#refreshBtn', '#cotRefresh', '#retryVix', '#loadData', '#check-alerts'
  ].join(',');
  const SKIP = '#billing-refresh,#refresh-verification,#refreshCloudReminders,#loadSaved,[data-media-reset],[data-no-auto-refresh],form [type=submit]';
  const TEXT = /^\s*[↻⟳]?\s*(refresh|check now)(\s+(now|data|quotes|marks|coverage|report|observation|headlines|news|prices))?\s*[↻⟳]?\s*$/i;
  let next = Date.now() + EVERY, last = Date.now();
  const chips = new Set();

  function style() {
    if (document.getElementById('fx-auto-style')) return;
    const st = document.createElement('style'); st.id = 'fx-auto-style';
    st.textContent = '.fx-auto-hidden{display:none!important}'
      + '.fx-auto{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;border:1px solid rgba(31,90,63,.25);background:rgba(31,90,63,.06);color:#1f5a3f;font:600 11px/1.2 "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;white-space:nowrap;vertical-align:middle;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;flex-shrink:1}'
      + '.fx-auto i{width:7px;height:7px;border-radius:50%;background:#1f8a5a;flex:0 0 auto;animation:fx-auto-pulse 2s infinite}'
      + '.fx-auto.is-updating i{background:#d08a00}'
      + '@keyframes fx-auto-pulse{0%{box-shadow:0 0 0 0 rgba(31,138,90,.5)}70%{box-shadow:0 0 0 7px rgba(31,138,90,0)}100%{box-shadow:0 0 0 0 rgba(31,138,90,0)}}'
      + 'html[data-theme=dark] .fx-auto,body.dark-mode .fx-auto,[data-fynx-terminal] .terminal-dark .fx-auto{color:#7fd3a6;border-color:rgba(127,211,166,.3);background:rgba(127,211,166,.07)}'
      + '@media (prefers-reduced-motion:reduce){.fx-auto i{animation:none}}';
    document.head.append(st);
  }
  function mmss(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function paint() {
    const left = next - Date.now();
    chips.forEach(chip => {
      if (!chip.isConnected) { chips.delete(chip); return; }
      if (chip.classList.contains('is-updating')) return;
      chip.lastChild.textContent = 'Auto-updating · next ' + mmss(left);
    });
  }
  function eligible(button) {
    if (!(button instanceof HTMLElement) || button.dataset.fxAuto) return false;
    if (button.closest(SKIP) || button.matches(SKIP)) return false;
    if (button.closest('.fp-menu, [data-company-products], nav, dialog')) return false;
    return button.matches(SELECT) || (button.tagName === 'BUTTON' && TEXT.test(button.textContent || ''));
  }
  function adopt(button) {
    button.dataset.fxAuto = '1';
    button.classList.add('fx-auto-hidden'); button.setAttribute('aria-hidden', 'true'); button.tabIndex = -1;
    const chip = document.createElement('span'); chip.className = 'fx-auto'; chip.setAttribute('role', 'status');
    chip.title = 'This section refreshes on its own every 10 minutes while the page is open.';
    chip.append(document.createElement('i'), document.createTextNode(''));
    button.after(chip); chips.add(chip); paint();
  }
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && eligible(root)) adopt(root);
    root.querySelectorAll('button').forEach(b => { if (eligible(b)) adopt(b); });
  }
  function run() {
    last = Date.now(); next = last + EVERY;
    document.querySelectorAll('[data-fx-auto]').forEach(button => {
      if (!button.isConnected || button.disabled) return;
      const chip = button.nextElementSibling && button.nextElementSibling.classList.contains('fx-auto') ? button.nextElementSibling : null;
      if (chip) { chip.classList.add('is-updating'); chip.lastChild.textContent = 'Updating…'; setTimeout(() => { chip.classList.remove('is-updating'); paint(); }, 2500); }
      try { button.click(); } catch (_) {}
    });
    paint();
  }
  function init() {
    style(); scan(document.body);
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && scan(n)))).observe(document.body, {childList: true, subtree: true});
    setInterval(() => { if (document.hidden) return; if (Date.now() >= next) run(); else paint(); }, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last >= EVERY) run(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
