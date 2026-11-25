/* Automatic news notification ingestion for authenticated users.
 * Uses the existing ingestNewsNotifications from account-system.
 * Does not create a second system. Respects preferences and deduplication via the engine.
 */
(function () {
  'use strict';
  if (window.__fynxAutoNewsIngest) return;
  window.__fynxAutoNewsIngest = true;

  const INTERVAL_MS = 3 * 60 * 1000;
  let timer = null;
  let lastAttempt = 0;

  function log(msg, err) {
    try {
      if (window.FynxMonitor && window.FynxMonitor.report) {
        window.FynxMonitor.report('notification', 'auto-ingest', err || new Error(msg));
      }
      if (location.search.includes('debug=1') || window.__fynxDebug) {
        console.info('[FYNX auto-ingest]', msg, err || '');
      }
    } catch (_) {}
  }

  async function tryIngest() {
    const now = Date.now();
    if (now - lastAttempt < 30000) return;
    lastAttempt = now;
    if (!window.FynxIdentity || !window.FynxIdentity.uid || document.hidden) return;

    try {
      let items = [];
      // Prefer fresh localStorage payload written by the news feed.
      try {
        const raw = localStorage.getItem('fynx_news_latest_payload');
        if (raw) {
          const payload = JSON.parse(raw);
          if (Array.isArray(payload && payload.items)) items = payload.items;
        }
      } catch (e) {
        log('localStorage payload parse failed', e);
      }

      // If no cached payload, attempt a lightweight fetch from the existing news endpoint if available.
      if (!items.length) {
        try {
          const res = await fetch('/assets/data/news-latest.json', { credentials: 'omit' });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data && data.items)) items = data.items;
            else if (Array.isArray(data)) items = data;
          }
        } catch (e) {
          // Optional endpoint; do not fail hard.
        }
      }

      if (!items.length) return;

      const mod = await import('/assets/js/account-system.js?v=20261125-header-fix');
      if (mod && typeof mod.ingestNewsNotifications === 'function') {
        const result = await mod.ingestNewsNotifications(window.FynxIdentity.uid, items);
        if (result && result.created > 0) log('ingested ' + result.created + ' news notifications');
      }
    } catch (err) {
      log('ingestion failed', err);
    }
  }

  function start() {
    if (timer) return;
    tryIngest();
    timer = setInterval(tryIngest, INTERVAL_MS);
  }

  function onVisible() {
    if (!document.hidden) tryIngest();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  window.addEventListener('pagehide', function () {
    if (timer) { clearInterval(timer); timer = null; }
  });
})();
