/* Automatic news notification ingestion for authenticated users.
 * Uses existing ingestNewsNotifications from account-system.
 * Does not create a second system. Respects user preferences via the engine.
 */
(function () {
  'use strict';
  if (window.__fynxAutoNewsIngest) return;
  window.__fynxAutoNewsIngest = true;

  const INTERVAL_MS = 3 * 60 * 1000; // ~3 minutes, within 1-5 min target
  let timer = null;

  async function tryIngest() {
    if (!window.FynxIdentity?.uid || document.hidden) return;
    try {
      const raw = localStorage.getItem('fynx_news_latest_payload');
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload?.items?.length) return;
      const mod = await import('/assets/js/account-system.js?v=20261125-header-fix');
      if (mod.ingestNewsNotifications) {
        await mod.ingestNewsNotifications(window.FynxIdentity.uid, payload.items);
      }
    } catch (e) {
      // Silent: do not break page if ingestion fails
    }
  }

  function start() {
    if (timer) return;
    tryIngest();
    timer = setInterval(tryIngest, INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tryIngest();
  });
  window.addEventListener('pagehide', () => { if (timer) clearInterval(timer); });
})();
